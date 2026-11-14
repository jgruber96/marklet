import { isTauri } from "@tauri-apps/api/core";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { isMobile } from "./platform";

/*
 * Updates come from the newest GitHub release: the app reads its latest.json
 * (see scripts/latest-json.mjs), and the updater plugin only installs a
 * download whose signature matches the public key in tauri.conf.json.
 */

let checking = false;

/**
 * Looks for a newer version and offers to install it. A check at startup
 * stays quiet unless there is an update; a manual one (Settings › Check for
 * Updates) also reports "up to date" and errors. `beforeInstall` gives the
 * app the chance to save open files; resolving false cancels the install.
 */
export async function checkForUpdate(manual: boolean, beforeInstall: () => Promise<boolean>): Promise<void> {
  // iOS gets updates from the App Store.
  if (!isTauri() || isMobile || checking) return;
  checking = true;
  try {
    const update = await check();
    if (!update) {
      if (manual) await message("You have the latest version of Marklet.", { title: "Marklet", kind: "info" });
      return;
    }
    const notes = update.body?.trim();
    const install = await ask(
      `Marklet ${update.version} is available (you have ${update.currentVersion}).` +
        (notes ? `\n\n${notes.length > 600 ? notes.slice(0, 600) + "…" : notes}` : "") +
        "\n\nInstall it now? Marklet will restart.",
      { title: "Update available", kind: "info", okLabel: "Install", cancelLabel: "Later" },
    );
    if (!install || !(await beforeInstall())) return;
    await update.downloadAndInstall();
    // Windows closes the app for the installer; elsewhere the new version starts here.
    await relaunch();
  } catch (err) {
    if (manual) await message(`Could not check for updates.\n\n${String(err)}`, { title: "Marklet", kind: "error" });
    else console.warn("Update check failed", err);
  } finally {
    checking = false;
  }
}
