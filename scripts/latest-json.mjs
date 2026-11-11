// Writes installers/latest.json, the file installed copies of Marklet read to
// find an update: one entry per platform whose signed update file is found.
//
//   node scripts/latest-json.mjs ["Release notes shown in the update prompt"] [--dir <folder>]
//
// With --dir (the release workflow), the update files and their .sig files
// are read from that folder, under the names the release attaches them as.
// Without it, from this PC's build output (src-tauri/target/release/bundle).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version, productName } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const repo = "jgruber96/marklet";

const args = process.argv.slice(2);
const dirFlag = args.indexOf("--dir");
const dir = dirFlag >= 0 ? args[dirFlag + 1] : null;
const notes = args.filter((_, i) => i !== dirFlag && i !== dirFlag + 1)[0] ?? "";

/**
 * Each platform: the file installed copies download (as attached to the
 * release), and where the build leaves its signature on this PC.
 * Windows updates install from the NSIS installer; macOS ones replace the app
 * from a .app.tar.gz.
 */
const platforms = {
  "windows-x86_64": {
    file: `${productName}_${version}_x64-setup.exe`,
    localSig: join(root, "src-tauri", "target", "release", "bundle", "nsis", `${productName}_${version}_x64-setup.exe.sig`),
  },
  "darwin-aarch64": {
    file: `${productName}_${version}_aarch64.app.tar.gz`,
    localSig: join(root, "src-tauri", "target", "release", "bundle", "macos", `${productName}.app.tar.gz.sig`),
  },
};

const entries = {};
for (const [platform, { file, localSig }] of Object.entries(platforms)) {
  const sigPath = dir ? join(dir, `${file}.sig`) : localSig;
  if (!existsSync(sigPath)) continue;
  entries[platform] = {
    signature: readFileSync(sigPath, "utf8").trim(),
    url: `https://github.com/${repo}/releases/download/v${version}/${file}`,
  };
}

if (Object.keys(entries).length === 0) {
  const where = dir ?? "the build output";
  const found = dir && existsSync(dir) ? `\nFiles there: ${readdirSync(dir).join(", ")}` : "";
  console.error(`No update signatures in ${where}.${found}\nBuild with TAURI_SIGNING_PRIVATE_KEY set (see README, "Releasing an update").`);
  process.exit(1);
}

const latest = { version, notes, pub_date: new Date().toISOString(), platforms: entries };
mkdirSync(join(root, "installers"), { recursive: true });
const out = join(root, "installers", "latest.json");
writeFileSync(out, JSON.stringify(latest, null, 2) + "\n");
console.log(`Wrote ${out} for ${productName} ${version}: ${Object.keys(entries).join(", ")}`);
