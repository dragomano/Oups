// Assemble the portable distribution: Oups.exe + locales/ next to it,
// zipped into dist/Oups_portable_win64_<version>.zip.
// Run after `pnpm tauri build --no-bundle` (or use `pnpm dist`, which runs both).
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

// Rule: the app version lives ONLY in src-tauri/Cargo.toml ([package] version).
const cargo = readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const versionMatch = /^version\s*=\s*"([^"]+)"/m.exec(cargo);
if (!versionMatch) {
  console.error("Could not read version from src-tauri/Cargo.toml");
  process.exit(1);
}
const version = versionMatch[1];

// Cargo names the binary after the package (`scheduler`); the portable
// artifact carries the display name from tauri.conf.json (productName).
const exe = ["scheduler.exe", "Scheduler.exe"]
  .map((n) => path.join(root, "src-tauri", "target", "release", n))
  .find((p) => existsSync(p));
if (!exe) {
  console.error("Release binary not found in src-tauri/target/release/");
  console.error("Run `pnpm tauri build --no-bundle` first (or use `pnpm dist`).");
  process.exit(1);
}

const stageDir = path.join(root, "dist", "Oups");
try {
  rmSync(stageDir, { recursive: true, force: true });
} catch {
  console.error(`Cannot clear ${stageDir} — the app is likely running from it.`);
  console.error("Close Oups.exe and run `pnpm dist` again.");
  process.exit(1);
}
mkdirSync(stageDir, { recursive: true });

const stagedExe = path.join(stageDir, "Oups.exe");
cpSync(exe, stagedExe);
cpSync(path.join(root, "locales"), path.join(stageDir, "locales"), { recursive: true });
cpSync(path.join(root, "LICENSE"), path.join(stageDir, "LICENSE.txt"));

// The sound is optional: include it only when supplied in the project root.
const sound = path.join(root, "oups.wav");
if (existsSync(sound)) {
  cpSync(sound, path.join(stageDir, "oups.wav"));
}

// Optional UPX compression (the exe is ~2x smaller). Used automatically when
// `upx` is on PATH; note that some antivirus tools flag UPX-packed binaries.
let upxPath = null;
try {
  // "ignore" on stderr keeps the "file not found" message of `where` quiet.
  upxPath = execSync("where upx", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split(/\r?\n/)[0]
    .trim();
} catch {
  // upx not installed — skip compression
}
if (upxPath) {
  console.log("Compressing Oups.exe with UPX (--best --lzma)...");
  execSync(`"${upxPath}" --best --lzma -q "${stagedExe}"`, { stdio: "inherit" });
} else {
  console.log("upx not found on PATH — skipping exe compression.");
}

// The portable build is x64 Windows only, so the name carries the target.
const zipPath = path.join(root, "dist", `Oups_portable_win64_${version}.zip`);
rmSync(zipPath, { force: true });

// PowerShell Compress-Archive is always available on Windows.
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force"`,
  { stdio: "inherit" },
);

console.log("\nPortable build ready:");
console.log(`  folder: ${stageDir}`);
console.log(`  zip:    ${zipPath}`);
