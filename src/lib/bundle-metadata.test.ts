import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), "oups-metadata-"));
for (const file of ["locales", "screenshots", "src-tauri/icons", "src-tauri/Cargo.toml", "LICENSE"]) {
  cpSync(join(root, file), join(fixture, file), { recursive: true });
}
const config = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const cargo = readFileSync(join(fixture, "src-tauri/Cargo.toml"), "utf8");
const english = JSON.parse(readFileSync(join(root, "locales/en.json"), "utf8"));
const output = join(fixture, "src-tauri/gen/bundle");
const read = (file: string) => readFileSync(join(output, file), "utf8");

// Change the actual sources to catch a hardcoded name/version/author in any output.
writeFileSync(
  join(fixture, "src-tauri/tauri.conf.json"),
  JSON.stringify({
    ...config,
    productName: "Fixture & Friends",
  }),
);
writeFileSync(
  join(fixture, "src-tauri/Cargo.toml"),
  cargo
    .replace(/^version = .+$/m, 'version = "9.8.7"')
    .replace(/^authors = .+$/m, 'authors = ["Alice & Bob"]'),
);
execFileSync(process.execPath, [join(root, "scripts/bundle-metadata.mjs")], {
  cwd: fixture,
  env: { ...process.env, SOURCE_DATE_EPOCH: "1794096000" },
});

afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe("package metadata", () => {
  const xml = read(`${config.identifier}.metainfo.xml`);

  it("keeps the native package description in sync with its English translation", () => {
    expect(config.bundle.shortDescription).toBe(english.distribution.summary);
    expect(config.bundle.longDescription).toBe(english.distribution.description);
  });

  it("derives identity and release metadata from the sources and escapes XML", () => {
    expect(xml).toContain("<name>Fixture &amp; Friends</name>");
    expect(xml).toContain("<name>Alice &amp; Bob</name>");
    expect(xml).toContain('<release version="9.8.7" date="2026-11-08"/>');
    expect(xml).toContain(`<id>${config.identifier}</id>`);
    expect(xml).toContain("<project_license>MIT</project_license>");
    expect(xml).not.toContain("undefined");
  });

  it("links AppStream to the desktop file, binary and installed stock icon", () => {
    expect(xml).toContain('<launchable type="desktop-id">Fixture &amp; Friends.desktop</launchable>');
    expect(xml).toContain('<icon type="stock">scheduler</icon>');
    expect(xml).toContain("<binary>scheduler</binary>");
  });

  it("uses the real screenshot dimensions and only existing language variants", () => {
    expect(xml.match(/<screenshot[ >]/g)).toHaveLength(3);
    expect(xml.match(/<image /g)).toHaveLength(6);
    expect(xml).toContain('<image type="source" width="1194" height="834">');
    expect(xml).toContain('xml:lang="ru"');
    for (const match of xml.matchAll(/https:\/\/raw\.githubusercontent\.com\/[^<]+\/screenshots\/([^<]+)/g)) {
      expect(existsSync(join(root, "screenshots", match[1]))).toBe(true);
    }
  });

  it("ships translated metadata and macOS credits for every locale", () => {
    for (const file of readdirSync(join(root, "locales")).filter((name) => name.endsWith(".json"))) {
      const locale = JSON.parse(readFileSync(join(root, "locales", file), "utf8"));
      const html = read(`macos/${locale.meta.code}.lproj/Credits.html`);
      expect(html).toContain(`dir="${locale.meta.dir}"`);
      expect(html).toContain("Fixture &amp; Friends 9.8.7");
      expect(html).toContain("Alice &amp; Bob");
      expect(html).toContain(">MIT</a>");
      expect(read("Info.plist")).toContain(`<string>${locale.meta.code}</string>`);
      for (const match of html.matchAll(/(?:src|href)="(\.\.\/[^"#]+)"/g)) {
        expect(existsSync(join(output, "macos", `${locale.meta.code}.lproj`, match[1]))).toBe(true);
      }
    }
    expect(read("macos/Credits.html")).not.toContain('src="../');
    expect(read("macos/LICENSE.txt")).toBe(readFileSync(join(root, "LICENSE"), "utf8"));
  });

  it("includes metadata and license in both Linux bundle targets and macOS", () => {
    const linux = JSON.parse(readFileSync(join(root, "src-tauri/tauri.linux.conf.json"), "utf8"));
    for (const target of ["deb", "appimage"]) {
      expect(linux.bundle.linux[target].files[`/usr/share/metainfo/${config.identifier}.metainfo.xml`]).toBe(
        `gen/bundle/${config.identifier}.metainfo.xml`,
      );
      expect(linux.bundle.linux[target].files["/usr/share/doc/oups/copyright"]).toBe("../LICENSE");
    }
    const mac = JSON.parse(readFileSync(join(root, "src-tauri/tauri.macos.conf.json"), "utf8"));
    expect(mac.bundle.icon).toContain("icons/icon.icns");
    expect(mac.bundle.macOS.files.Resources).toBe("gen/bundle/macos");
    expect(mac.bundle.macOS.infoPlist).toBe("gen/bundle/Info.plist");
  });
});
