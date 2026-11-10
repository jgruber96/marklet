// Writes installers/latest.json, the file installed copies of Marklet read to
// find an update. Run it after `npm run tauri build` (with the signing key
// set), then attach latest.json and the installer to the GitHub release.
//
//   node scripts/latest-json.mjs ["Release notes shown in the update prompt"]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version, productName } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const repo = "jgruber96/marklet";

// Windows updates install from the NSIS installer; its .sig is written beside it by the build.
const installer = `${productName}_${version}_x64-setup.exe`;
const sigPath = join(root, "src-tauri", "target", "release", "bundle", "nsis", `${installer}.sig`);
if (!existsSync(sigPath)) {
  console.error(`No signature at ${sigPath}.\nBuild with TAURI_SIGNING_PRIVATE_KEY set (see README, "Releasing an update").`);
  process.exit(1);
}

const latest = {
  version,
  notes: process.argv[2] ?? "",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(sigPath, "utf8").trim(),
      url: `https://github.com/${repo}/releases/download/v${version}/${installer}`,
    },
  },
};

mkdirSync(join(root, "installers"), { recursive: true });
const out = join(root, "installers", "latest.json");
writeFileSync(out, JSON.stringify(latest, null, 2) + "\n");
console.log(`Wrote ${out} for ${productName} ${version}`);
