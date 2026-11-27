// Harness entry point for the COMPOSITE canvas: the main window, plus the
// popup window floating over it in the corner the app defaults to.

import "./no-motion";
import "./freeze-clock";
import { APP_H, APP_W, POPUP_H, POPUP_MARGIN, POPUP_MAX_SHARE, POPUP_W } from "./geometry.mjs";
import { readParams, runtime } from "./runtime";
import { ready } from "./wait";

readParams();

const appFrame = document.getElementById("app-frame") as HTMLIFrameElement;
const popupFrame = document.getElementById("popup-frame") as HTMLIFrameElement;

const query = `scene=${runtime.scene}&lang=${runtime.lang}`;

// An iframe is a replaced element: `inset: 0` alone leaves it at its intrinsic
// 300x150, so both sizes are set explicitly.
appFrame.style.width = `${APP_W}px`;
appFrame.style.height = `${APP_H}px`;
appFrame.src = `/_shots/index.html?${query}`;

if (runtime.popup) {
  // Both popups open at the window's size; the missed one is fitted below.
  popupFrame.style.display = "block";
  popupFrame.style.width = `${POPUP_W}px`;
  popupFrame.style.height = `${POPUP_H}px`;
  popupFrame.style.left = `${APP_W - POPUP_W - POPUP_MARGIN}px`;
  popupFrame.style.top = `${APP_H - POPUP_H - POPUP_MARGIN}px`;
  popupFrame.src = `/_shots/popup.html?popup=${runtime.popup}&lang=${runtime.lang}`;
}

// scheduler.rs::fit_popup_window: a popup takes the height its page measured,
// never more than POPUP_MAX_SHARE of the work area (the canvas here), and
// keeps its bottom edge.
window.addEventListener("message", (event) => {
  if (event.data?.type !== "fit-popup") return;
  const limit = Math.floor((APP_H - POPUP_MARGIN) * POPUP_MAX_SHARE);
  const height = Math.min(Math.max(1, Math.round(event.data.height)), limit);
  popupFrame.style.height = `${height}px`;
  popupFrame.style.top = `${APP_H - height - POPUP_MARGIN}px`;
  (event.source as Window).postMessage({ type: "popup-fitted" }, "*");
});

if (runtime.scene === "editor" || runtime.scene === "settings") {
  popupFrame.style.display = "block";
  popupFrame.style.width = "820px";
  popupFrame.style.height = "650px";
  popupFrame.style.left = `${(APP_W - 820) / 2}px`;
  popupFrame.style.top = `${(APP_H - 650) / 2}px`;
  popupFrame.src = `/_shots/${runtime.scene}.html?lang=${runtime.lang}`;
}

const frames =
  runtime.popup || runtime.scene === "editor" || runtime.scene === "settings"
    ? [appFrame, popupFrame]
    : [appFrame];

function settled(frame: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = performance.now();

    const poll = () => {
      const flag = frame.contentDocument?.documentElement?.dataset;

      if (flag?.shotsError) {
        reject(new Error(flag.shotsError));

        return;
      }

      if (flag?.shotsReady) {
        resolve();

        return;
      }

      if (performance.now() - started > 20_000) {
        reject(new Error(`timed out waiting for ${frame.title}`));

        return;
      }

      setTimeout(poll, 25);
    };

    poll();
  });
}

Promise.all(frames.map(settled))
  .then(() => ready())
  .catch((e) => {
    document.documentElement.dataset.shotsError = String(e);
    console.error(e);
  });
