// Capture driver for screenshots/*.png.
//
//   pnpm shots            every shot, both languages
//   pnpm shots 03 07      only the shots whose name starts so
//
// It drives headless Edge over the DevTools protocol rather than `--screenshot`:
// that flag measures the WINDOW, not the viewport (so the frame comes out the
// wrong size and has to be cropped) and it captures at an arbitrary moment,
// which is how the popup quietly renders as a plain app about half the time.
// `Emulation.setDeviceMetricsOverride` pins the viewport instead, and the page
// itself raises `data-shots-ready` only when its content is in the DOM.
//
// Edge is spawned with `--remote-debugging-port=0` and the real port is read
// from the `DevToolsActivePort` file in the run's own profile dir: a fixed
// port once made runs silently attach to a leftover browser from an earlier
// run that still held it, until one wedged for good. On Windows the browser
// is killed with `taskkill /T` — plain kill() orphans the renderer tree, and
// those orphans were what kept holding the old fixed port.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_H, APP_W, LANGUAGES, TRAY_H, TRAY_W } from "./geometry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const outDir = join(project, "screenshots");
const profileDir = join(tmpdir(), `oups-shots-${process.pid}`);

/** Preferred port for the harness server (kept in one place with vite.config.ts). */
const PREFERRED_PORT = 1430;

/** True if a TCP port on 127.0.0.1 can be bound right now. */
function portIsFree(port) {
  return new Promise((res) => {
    const server = net.createServer();

    server.once("error", () => res(false));
    server.listen(port, "127.0.0.1", () => server.close(() => res(true)));
  });
}

/** The harness used to run Vite on a fixed port, so a leftover dev server (or
    anything else holding 1430) failed `pnpm shots` outright. Try the preferred
    port first, then ask the OS for a concrete free one (a literal `--port 0`
    would make Vite choose silently and the driver could not learn the port). */
async function pickHarnessPort() {
  if (await portIsFree(PREFERRED_PORT)) return PREFERRED_PORT;

  console.log(`port ${PREFERRED_PORT} is busy, picking a free one`);
  return new Promise((res, rej) => {
    const server = net.createServer();

    server.once("error", rej);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();

      server.close(() => res(port));
    });
  });
}

/** name -> what to put on screen. Mirrors the table in screenshots/README.md.
    `page` selects the harness entry point (shell.html by default); tray shots
    get their own, smaller canvas since the menu is not an app window. */
const SHOTS = [
  { name: "01-list", scene: "list", popup: null },
  { name: "02-completed", scene: "completed", popup: null },
  { name: "03-matrix", scene: "matrix", popup: null },
  { name: "04-editor", scene: "editor", popup: null },
  { name: "05-settings", scene: "settings", popup: null },
  { name: "06-empty", scene: "empty", popup: null },
  { name: "07-popup", scene: "list", popup: "single" },
  { name: "08-popup-missed", scene: "list", popup: "missed" },
  { name: "09-tray", page: "tray" },
  { name: "10-editor-mobile", page: "editor", width: 390, height: 844 },
  { name: "11-settings-mobile", page: "settings", scene: "settings", width: 390, height: 844 },
];

const filters = process.argv.slice(2);
const shots = filters.length ? SHOTS.filter((s) => filters.some((f) => s.name.startsWith(f))) : SHOTS;

if (shots.length === 0) {
  console.error(`no shots match ${filters.join(", ")}`);
  process.exit(1);
}

/** Where Edge usually lives; the harness needs a Chromium, not a specific one. */
function findEdge() {
  const roots = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(
    Boolean,
  );
  const candidates = roots.map((root) => join(root, "Microsoft", "Edge", "Application", "msedge.exe"));

  return candidates.find((path) => existsSync(path));
}

/* ------------------------------------------------------------------ helpers */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** With --remote-debugging-port=0 Edge chooses a free port itself and writes
    it to DevToolsActivePort in the profile dir; the file only appears once the
    DevTools server is up. */
async function waitForPortFile() {
  const file = join(profileDir, "DevToolsActivePort");

  for (let i = 0; i < 100; i++) {
    try {
      const port = Number(readFileSync(file, "utf8").split("\n")[0]?.trim());

      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Edge has not written the file yet.
    }

    await sleep(100);
  }

  throw new Error("headless Edge never wrote DevToolsActivePort");
}

async function waitForDevtools(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const json = await res.json();

      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch {
      // Edge is still starting up.
    }

    await sleep(100);
  }

  throw new Error("headless Edge never opened its DevTools port");
}

async function waitForServer() {
  for (let i = 0; i < 200; i++) {
    try {
      const res = await fetch(`${ORIGIN}/_shots/shell.html`);

      if (res.ok) return;
    } catch {
      // Vite is still starting up.
    }

    await sleep(100);
  }

  throw new Error("the harness server never came up");
}

/** Minimal CDP client: one WebSocket, request/response by id. */
function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;

  const call = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const id = nextId++;

      pending.set(id, { res, rej });
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    const waiter = pending.get(msg.id);

    if (!waiter) return;

    pending.delete(msg.id);
    if (msg.error) waiter.rej(new Error(`${msg.error.message} (${msg.method ?? ""})`));
    else waiter.res(msg.result);
  });

  const open = new Promise((res, rej) => {
    ws.addEventListener("open", () => res());
    ws.addEventListener("error", () => rej(new Error("DevTools socket failed")));
  });

  return { open, call, close: () => ws.close() };
}

/** kill() on Windows leaves the renderer tree alive, and those orphans used to
    outlive the run and hold browser-wide resources until killed by hand. */
async function killTree(child) {
  if (process.platform !== "win32" || !child.pid) {
    child.kill("SIGKILL");

    return;
  }

  await new Promise((resolve) => {
    const taskkill = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });

    taskkill.on("close", resolve);
    taskkill.on("error", resolve);
  });
}

/** The profile dir is disposable; failing to remove it must not fail a run
    whose screenshots were taken fine. */
function removeProfile() {
  try {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    // A dangling temp dir is cheaper to leave behind than to die on.
  }
}

/* --------------------------------------------------------------------- main */

const edge = findEdge();

if (!edge) {
  console.error("no Microsoft Edge found; the capture driver needs a Chromium browser");
  process.exit(1);
}

const PORT = await pickHarnessPort();
const ORIGIN = `http://127.0.0.1:${PORT}`;

mkdirSync(outDir, { recursive: true });

const vite = spawn(
  process.execPath,
  [
    join(project, "node_modules", "vite", "bin", "vite.js"),
    "--config",
    join(here, "vite.config.ts"),
    // Overrides the config's fixed port; 0 makes Vite take a free one.
    "--port",
    String(PORT),
    "--strictPort",
  ],
  { cwd: project, stdio: ["ignore", "pipe", "pipe"] },
);

const browser = spawn(
  edge,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    `--window-size=${APP_W},${APP_H}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

const noise = (stream, prefix) => {
  stream?.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) console.log(`${prefix} ${line.trim()}`);
    }
  });
};

noise(vite.stdout, "vite |");
noise(vite.stderr, "vite |");
noise(browser.stderr, "edge |");

let cdp;

try {
  await waitForServer();
  cdp = connect(await waitForDevtools(await waitForPortFile()));
  await cdp.open;

  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });

  await cdp.call("Page.enable", {}, sessionId);

  for (const shot of shots) {
    for (const lang of LANGUAGES) {
      const width = shot.width ?? (shot.page === "tray" ? TRAY_W : APP_W);
      const height = shot.height ?? (shot.page === "tray" ? TRAY_H : APP_H);
      const url =
        shot.page === "editor" || shot.page === "settings"
          ? `${ORIGIN}/_shots/${shot.page}.html?lang=${lang}`
          : shot.page === "main"
            ? `${ORIGIN}/_shots/index.html?scene=${shot.scene}&lang=${lang}`
            : shot.page === "tray"
              ? `${ORIGIN}/_shots/tray.html?lang=${lang}`
              : `${ORIGIN}/_shots/shell.html?scene=${shot.scene}&lang=${lang}` +
                (shot.popup ? `&popup=${shot.popup}` : "");

      await cdp.call(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile: shot.page === "editor" || shot.page === "settings" },
        sessionId,
      );
      await cdp.call(
        "Emulation.setTouchEmulationEnabled",
        { enabled: shot.page === "editor" || shot.page === "settings" },
        sessionId,
      );
      await cdp.call("Page.navigate", { url }, sessionId);

      // Wait for the page to say its content is in the DOM. A fixed delay
      // either wastes time or loses the popup.
      const deadline = Date.now() + 30_000;
      let ready = false;

      while (Date.now() < deadline) {
        const { result } = await cdp.call(
          "Runtime.evaluate",
          {
            expression:
              "JSON.stringify({ready:document.documentElement.dataset.shotsReady,error:document.documentElement.dataset.shotsError})",
            returnByValue: true,
          },
          sessionId,
        );
        const state = JSON.parse(result.value ?? "{}");

        if (state.error) throw new Error(`${shot.name}.${lang}: ${state.error}`);
        if (state.ready) {
          ready = true;
          break;
        }

        await sleep(50);
      }

      if (!ready) throw new Error(`${shot.name}.${lang}: never became ready`);

      // The app's own window chrome: the main window is frameless, so these
      // buttons are part of the page. The gallery width (1194) must keep the
      // one-row toolbar with both labels in every captured language.
      if (!shot.page) {
        const { result } = await cdp.call(
          "Runtime.evaluate",
          {
            expression: `(() => {
            const doc = document.querySelector("#app-frame")?.contentDocument;
            const bar = doc?.querySelector(".toolbar");
            const caption = doc?.querySelector(".caption");
            return Boolean(bar && caption && caption.querySelectorAll("button").length === 3
              && !bar.classList.contains("search-below")
              && !bar.classList.contains("hide-io") && !bar.classList.contains("hide-new")
              && doc.querySelector(".frame") && doc.querySelector(".card"));
          })()`,
            returnByValue: true,
          },
          sessionId,
        );
        if (!result.value) throw new Error(`${shot.name}.${lang}: window chrome or one-row toolbar missing`);
      }

      if (shot.name === "04-editor" || shot.page === "editor") {
        const { result } = await cdp.call(
          "Runtime.evaluate",
          {
            expression: `(() => {
            const doc = document.querySelector("#popup-frame")?.contentDocument ?? document;
            const form = doc.querySelector(".editor-form");
            const footer = doc.querySelector(".footer")?.getBoundingClientRect();
            const header = doc.querySelector(".editor-head")?.getBoundingClientRect();
            const close = doc.querySelector(".editor-close")?.getBoundingClientRect();
            return Boolean(form && footer && header && close && header.top >= 0
              && close.left >= 0 && close.right <= doc.defaultView.innerWidth + 1
              && doc.querySelectorAll("h2").length === 1 && !doc.querySelector(".caption")
              && form.scrollWidth <= form.clientWidth + 1
              && footer.top >= 0 && footer.bottom <= doc.defaultView.innerHeight + 1);
          })()`,
            returnByValue: true,
          },
          sessionId,
        );
        if (!result.value) throw new Error(`${shot.name}.${lang}: editor overflows or its footer is clipped`);
      }

      if (shot.scene === "settings") {
        const { result } = await cdp.call(
          "Runtime.evaluate",
          {
            expression: `(() => {
            const doc = document.querySelector("#popup-frame")?.contentDocument ?? document;
            const dialog = doc.querySelector(".settings-dialog")?.getBoundingClientRect();
            const footer = doc.querySelector(".settings-footer")?.getBoundingClientRect();
            const body = doc.querySelector(".settings-body");
            const mobile = doc.defaultView.innerWidth <= 560;
            const switches = [...doc.querySelectorAll(".settings-check input")];
            const caption = doc.querySelector(".settings-position");
            const themes = [...doc.querySelectorAll(".settings-themes button")];
            const themeLabelsFit = themes.every(button => {
              const label = button.querySelector("span");
              if (!label || button.getAttribute("aria-label") !== label.textContent
                || button.title !== label.textContent) return false;
              if (!label.getClientRects().length) return true;
              const text = label.getBoundingClientRect();
              const bounds = button.getBoundingClientRect();
              return text.left >= bounds.left && text.right <= bounds.right;
            });
            return Boolean(dialog && footer && body && !doc.querySelector(".settings-overlay")
              && (doc.defaultView.innerWidth === ${width} || ${shot.page !== "settings"})
              && dialog.top >= 0
              && footer.bottom <= doc.defaultView.innerHeight + 1
              && body.scrollWidth <= body.clientWidth + 1
              && themes.length === 3 && themeLabelsFit
              && (!mobile || themes.every(button => !button.querySelector("span").getClientRects().length))
              && switches.length === 2 && switches.every(input => input.closest("label")?.control === input)
              && (mobile ? doc.defaultView.getComputedStyle(caption).justifyContent === "center"
                : body.scrollHeight <= body.clientHeight + 1));
          })()`,
            returnByValue: true,
            awaitPromise: true,
          },
          sessionId,
        );
        if (!result.value) throw new Error(`${shot.name}.${lang}: settings layout or modal behavior failed`);
      }

      const { data } = await cdp.call(
        "Page.captureScreenshot",
        { format: "png", fromSurface: true, captureBeyondViewport: false },
        sessionId,
      );
      const file = join(outDir, `${shot.name}.${lang}.png`);

      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`captured ${shot.name}.${lang}.png`);
    }
  }

  await cdp.call("Target.closeTarget", { targetId });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  cdp?.close();
  await killTree(browser);
  await killTree(vite);
  removeProfile();
}
