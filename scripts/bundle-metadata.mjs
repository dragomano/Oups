// Generate package metadata without a second source for the app name or version.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const config = JSON.parse(read("src-tauri/tauri.conf.json"));
const cargo = read("src-tauri/Cargo.toml").match(/^\[package\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
if (!cargo) throw new Error("Missing [package] in Cargo.toml");
const field = (key) => {
  const value = cargo.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"))?.[1];
  if (!value) throw new Error(`Missing package.${key} in Cargo.toml`);
  return JSON.parse(value);
};
const name = config.productName;
const id = config.identifier;
const version = field("version");
const authors = field("authors").join(", ");
const license = field("license");
const binary = config.mainBinaryName ?? field("name");
const homepage = config.bundle.homepage ?? field("homepage");
const repository = field("repository");
const rawUrl = repository.replace("https://github.com/", "https://raw.githubusercontent.com/");
const epoch =
  process.env.SOURCE_DATE_EPOCH ??
  execFileSync("git", ["log", "-1", "--format=%ct"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
const date = new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
const locales = readdirSync(path.join(root, "locales"))
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(read(`locales/${file}`)))
  .sort((a, b) => Number(b.meta.code === "en") - Number(a.meta.code === "en"));
const english = locales.find((locale) => locale.meta.code === "en");
if (!english) throw new Error("Missing English package metadata");
for (const locale of locales) {
  locale.distribution = { ...english.distribution, ...locale.distribution };
}

const escapeXml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );
const lang = (code) => (code === "en" ? "" : ` xml:lang="${escapeXml(code)}"`);
const tag = (key, value, code = "en") => `<${key}${lang(code)}>${escapeXml(value)}</${key}>`;
const shots = [
  ["01-list", "list"],
  ["03-matrix", "matrix"],
  ["04-editor", "editor"],
];
const shotFile = (stem, code) => {
  const file = `${stem}.${code}.png`;
  return existsSync(path.join(root, "screenshots", file)) ? file : `${stem}.en.png`;
};
const screenshotXml = shots
  .map(([stem, key], index) => {
    const images = new Map();
    for (const locale of locales) {
      const code = locale.meta.code;
      const file = shotFile(stem, code);
      if (images.has(file)) continue;
      const png = readFileSync(path.join(root, "screenshots", file));
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      images.set(
        file,
        `<image type="source" width="${width}" height="${height}"${lang(code)}>${escapeXml(`${rawUrl}/main/screenshots/${file}`)}</image>`,
      );
    }
    return `    <screenshot${index === 0 ? ' type="default"' : ""}>
${locales.map((locale) => `      ${tag("caption", locale.distribution[key], locale.meta.code)}`).join("\n")}
${[...images.values()].map((image) => `      ${image}`).join("\n")}
    </screenshot>`;
  })
  .join("\n");
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  ${tag("id", id)}
  ${tag("metadata_license", license)}
  ${tag("project_license", license)}
  ${tag("name", name)}
${locales.map((locale) => `  ${tag("summary", locale.distribution.summary, locale.meta.code)}`).join("\n")}
  <description>
${locales.map((locale) => `    ${tag("p", locale.distribution.description, locale.meta.code)}`).join("\n")}
  </description>
  <developer id="io.github.${escapeXml(new URL(repository).pathname.split("/")[1])}">
    ${tag("name", authors)}
  </developer>
  <launchable type="desktop-id">${escapeXml(name)}.desktop</launchable>
  ${tag("pkgname", name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase())}
  <icon type="stock">${escapeXml(binary)}</icon>
  <provides>${tag("binary", binary)}</provides>
  <categories><category>Office</category></categories>
  <url type="homepage">${escapeXml(homepage)}</url>
  <url type="bugtracker">${escapeXml(`${repository}/issues`)}</url>
  <screenshots>
${screenshotXml}
  </screenshots>
  <releases><release version="${escapeXml(version)}" date="${date}"/></releases>
  <content_rating type="oars-1.1"/>
</component>
`;

const out = path.join(root, "src-tauri/gen/bundle");
const mac = path.join(out, "macos");
mkdirSync(mac, { recursive: true });
writeFileSync(path.join(out, `${id}.metainfo.xml`), xml);
cpSync(path.join(root, "LICENSE"), path.join(mac, "LICENSE.txt"));
cpSync(path.join(root, "src-tauri/icons/128x128.png"), path.join(mac, "app-icon.png"));
mkdirSync(path.join(mac, "screenshots"), { recursive: true });
for (const locale of locales) {
  const code = locale.meta.code;
  const dir = path.join(mac, `${code}.lproj`);
  mkdirSync(dir, { recursive: true });
  const figures = shots
    .map(([stem, key]) => {
      const file = shotFile(stem, code);
      cpSync(path.join(root, "screenshots", file), path.join(mac, "screenshots", file));
      return `<p><img src="../screenshots/${escapeXml(file)}" width="560" alt="${escapeXml(locale.distribution[key])}"><br>${escapeXml(locale.distribution[key])}</p>`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="${escapeXml(code)}" dir="${escapeXml(locale.meta.dir)}">
<head><meta charset="utf-8"><title>${escapeXml(name)}</title></head>
<body>
<p><img src="../app-icon.png" width="64" height="64" alt=""></p>
<h1>${escapeXml(name)} ${escapeXml(version)}</h1>
<p>${escapeXml(authors)} · <a href="../LICENSE.txt">${escapeXml(license)}</a></p>
<p>${escapeXml(locale.distribution.description)}</p>
<p><a href="${escapeXml(homepage)}">${escapeXml(homepage)}</a></p>
${figures}
</body>
</html>
`;
  writeFileSync(path.join(dir, "Credits.html"), html);
  if (code === "en")
    writeFileSync(
      path.join(mac, "Credits.html"),
      html.replaceAll('src="../', 'src="').replaceAll('href="../', 'href="'),
    );
}
writeFileSync(
  path.join(out, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleLocalizations</key>
  <array>${locales.map((locale) => tag("string", locale.meta.code)).join("")}</array>
</dict></plist>
`,
);
console.log(`Generated Linux and macOS package metadata for ${name} ${version}`);
