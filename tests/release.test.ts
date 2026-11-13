import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(__dirname, "..", "scripts", "latest-json.mjs");
const { version } = JSON.parse(readFileSync(join(__dirname, "..", "src-tauri", "tauri.conf.json"), "utf8"));

describe("the update feed (scripts/latest-json.mjs)", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "marklet-feed-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (notes: string) => {
    const out = join(dir, "latest.json");
    execFileSync(process.execPath, [script, notes, "--dir", dir, "--out", out]);
    return JSON.parse(readFileSync(out, "utf8"));
  };

  it("lists every platform whose signed update file is present", () => {
    writeFileSync(join(dir, `Marklet_${version}_x64-setup.exe.sig`), "windows-signature\n");
    writeFileSync(join(dir, `Marklet_${version}_aarch64.app.tar.gz.sig`), "mac-signature\n");
    const feed = run("What changed");
    expect(feed.version).toBe(version);
    expect(feed.notes).toBe("What changed");
    expect(feed.platforms).toEqual({
      "windows-x86_64": { signature: "windows-signature", url: `https://github.com/jgruber96/marklet/releases/download/v${version}/Marklet_${version}_x64-setup.exe` },
      "darwin-aarch64": { signature: "mac-signature", url: `https://github.com/jgruber96/marklet/releases/download/v${version}/Marklet_${version}_aarch64.app.tar.gz` },
    });
  });

  it("leaves out a platform that was not built", () => {
    writeFileSync(join(dir, `Marklet_${version}_x64-setup.exe.sig`), "windows-signature");
    expect(Object.keys(run("").platforms)).toEqual(["windows-x86_64"]);
  });

  it("fails rather than publish a feed with no updates in it", () => {
    const result = spawnSync(process.execPath, [script, "notes", "--dir", dir, "--out", join(dir, "latest.json")]);
    expect(result.status).toBe(1);
  });
});
