// Smoke test: starts the real app and drives it through its main features,
// checking the results on screen and on disk. Run before a release:
//
//   npm run smoke
//
// Windows only (it talks to the app's WebView2 over its debugging port). The
// app runs from source (`tauri dev`) under its own identifier, so it never
// touches the settings, session or recovery files of an installed Marklet
// (and runs even while one is open), and it works on a scratch folder of
// notes in the temp directory.

import { chromium } from "playwright-core";
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("The smoke test runs on Windows only; skipped.");
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const IDENTIFIER = "us.darkstardev.marklet.smoke";
const CDP = "http://127.0.0.1:9444";
const appData = join(process.env.APPDATA, IDENTIFIER);
const localData = join(process.env.LOCALAPPDATA, IDENTIFIER);
const recoveryDir = join(appData, "recovery");
const debugExe = join(root, "src-tauri", "target", "debug", "marklet.exe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// PowerShell one-liners, written with single quotes only so they pass through the shell unchanged.
const ps = (command) => execSync(`powershell -NoProfile -Command "${command}"`, { encoding: "utf8" }).trim();
/** The test app's processes: marklet.exe built under this repo, never an installed Marklet. */
const TEST_APP = `Get-Process -Name marklet -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${debugExe}' }`;

// ---- Results

const failures = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok || detail === "" ? "" : `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`);
  if (!ok) failures.push(name);
}

// ---- The app

let devProcess = null;

/** Stops the test app (never an installed Marklet: only the build under this repo), and the dev server. */
function stopApp() {
  try {
    ps(`${TEST_APP} | Stop-Process -Force`);
  } catch {
    // Not running.
  }
  if (devProcess?.pid) {
    try {
      execSync(`taskkill /PID ${devProcess.pid} /T /F`, { stdio: "ignore" });
    } catch {
      // Already gone.
    }
  }
  devProcess = null;
  try {
    ps("Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }");
  } catch {
    // Nothing was listening.
  }
}

const appRunning = () => ps(`(${TEST_APP} | Measure-Object).Count`) !== "0";

/** Starts the app from source and returns its page once the editor is up. */
async function startApp() {
  devProcess = spawn("npm", ["run", "tauri", "dev", "--", "--config", join(here, "tauri.smoke.json")], {
    cwd: root,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    // The web view's debugging port is asked for in tauri.smoke.json (the window's additionalBrowserArgs).
    env: process.env,
  });
  let log = "";
  devProcess.stdout.on("data", (d) => (log += d));
  devProcess.stderr.on("data", (d) => (log += d));
  // The first run compiles the app, which can take several minutes; once it is running, the web view is up within seconds.
  const compileDeadline = Date.now() + 25 * 60 * 1000;
  let runningSince = 0;
  let browser = null;
  let lastError = "";
  while (!browser) {
    if (devProcess.exitCode !== null) throw new Error(`The app did not start:\n${log.slice(-2000)}`);
    if (!runningSince && appRunning()) runningSince = Date.now();
    if (runningSince ? Date.now() - runningSince > 3 * 60 * 1000 : Date.now() > compileDeadline) break;
    try {
      browser = await chromium.connectOverCDP(CDP, { timeout: 15000 });
    } catch (err) {
      lastError = String(err).split("\n")[0];
      await sleep(2000);
    }
  }
  if (!browser) {
    // Say what the machine looks like, so a failure on another computer can be understood from its log.
    const facts = [];
    const tryPs = (label, command) => {
      try {
        facts.push(`${label}:\n${ps(command) || "(nothing)"}`);
      } catch (err) {
        facts.push(`${label}: failed (${String(err).split("\n")[0]})`);
      }
    };
    tryPs("app and web view processes", "Get-Process marklet,msedgewebview2 -ErrorAction SilentlyContinue | Select-Object Name,Id,SessionId,MainWindowHandle | Format-Table -AutoSize | Out-String");
    tryPs("listening on 9444 or 1420", "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 9444,1420 } | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table -AutoSize | Out-String");
    tryPs("WebView2 runtime", "(Get-Process msedgewebview2 -ErrorAction SilentlyContinue | Select-Object -First 1).Path");
    tryPs("web view command line", "(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' } | Select-Object -First 1).CommandLine");
    tryPs("this process session", "(Get-Process -Id $PID).SessionId");
    throw new Error(`The app's web view never became reachable (${runningSince ? "the app was running" : "the app never started"}; last error: ${lastError}).\n${facts.join("\n")}\n--- app output ---\n${log.slice(-1500)}`);
  }
  const page = browser.contexts()[0].pages()[0];
  return { browser, page };
}

// ---- Helpers for driving the page

function driver(page) {
  const emit = (event, payload) => page.evaluate(([e, p]) => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: e, payload: p }), [event, payload]);
  return {
    emit,
    /** Files or folders dropped on the window, at a place in it (CSS pixels). */
    drop: async (paths, at = { x: 600, y: 400 }) => {
      const dpr = await page.evaluate(() => devicePixelRatio);
      await emit("tauri://drag-drop", { paths, position: { x: at.x * dpr, y: at.y * dpr } });
    },
    /** Chooses an item from the app menu by its path of labels. */
    menu: async (...labels) => {
      await page.locator('button[aria-label="Menu"]').click();
      for (const label of labels) {
        await page.locator(".menu").last().locator(".menu-item", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first().click();
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(350);
    },
    tabs: () => page.evaluate(() => [...document.querySelectorAll(".tab")].map((t) => ({ name: t.querySelector(".tab-name").textContent, front: t.classList.contains("active"), unsaved: !!t.querySelector(".tab-dot") }))),
    frontTab: () => page.evaluate(() => document.querySelector(".tab.active .tab-name")?.textContent ?? null),
    line: (text) => page.evaluate((t) => [...document.querySelectorAll(".cm-line")].find((l) => l.textContent.includes(t))?.textContent ?? null, text),
  };
}

// Native dialogs cannot be clicked from here. This stands in for the dialog
// module (served by the dev server) and answers: Restore, and Don't Save.
const DIALOG_STUB = `window.__dialogs ??= [];
export const ask = async (m) => (window.__dialogs.push(m), true);
export const confirm = ask;
export const message = async (m) => (window.__dialogs.push(m), /Do you want to save/.test(m) ? "Don't Save" : "Ok");
export const open = async () => null;
export const save = async () => null;`;

// ---- The test

const work = join(tmpdir(), `marklet-smoke-${Date.now()}`);
const notes = join(work, "Smoke Notes");
const notePath = join(notes, "Note.md");
const NOTE = "# Smoke\n\nHello world.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nEnd.\n";
// A 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function main() {
  if (ps("(Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count") !== "0") {
    throw new Error("Port 1420 is in use: stop the running dev server (npm run dev / tauri dev) first.");
  }
  // A clean profile and a scratch folder of notes.
  for (const dir of [appData, localData]) rmSync(dir, { recursive: true, force: true });
  mkdirSync(notes, { recursive: true });
  writeFileSync(notePath, NOTE);
  writeFileSync(join(notes, "Other.md"), "# Other\n\nThere is a needle in this haystack.\n");
  writeFileSync(join(work, "pic.png"), PNG);

  console.log("Starting Marklet from source (the first run compiles it)…");
  let { browser, page } = await startApp();
  const errors = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(String(e)));
    // A failed request is reported with its address below, in place of the console's bare "Failed to load resource".
    p.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
    p.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
    p.on("requestfailed", (r) => errors.push(`failed ${r.url()} (${r.failure()?.errorText ?? "?"})`));
  };
  watch(page);
  let app = driver(page);
  const read = () => readFileSync(notePath, "utf8");
  const save = async () => {
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(700);
  };

  console.log("\nStart");
  await page.waitForSelector(".cm-content", { timeout: 120000 });
  await page.waitForTimeout(2500);
  check("the window draws its own title bar", (await page.locator(".toolbar.titlebar .win-buttons button").count()) === 3);
  check("a fresh profile opens the welcome note, as a saved tab", JSON.stringify(await app.tabs()) === '[{"name":"Welcome.md","front":true,"unsaved":false}]', await app.tabs());
  check("the welcome note is rendered", (await page.locator(".pane-preview h1").textContent()) === "Welcome to Marklet");

  console.log("\nOpen, edit, save");
  await app.drop([notes, notePath]);
  await page.waitForSelector(".tree-row", { timeout: 15000 });
  await page.waitForTimeout(800);
  check("a dropped folder becomes the workspace", (await page.locator(".tree-row", { hasText: "Other.md" }).count()) === 1);
  check("a dropped note opens in front", (await app.frontTab()) === "Note.md", await app.frontTab());
  check("the preview renders it", (await page.locator(".pane-preview h1").textContent()) === "Smoke");
  await page.locator(".cm-line", { hasText: "End." }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Typed by smoke.");
  await page.waitForTimeout(300);
  check("typing marks the tab unsaved", (await app.tabs()).find((t) => t.front)?.unsaved === true);
  await save();
  check("Ctrl+S writes the file", read().includes("End. Typed by smoke."), read());
  check("line endings are kept (LF)", !read().includes("\r"));
  check("saving clears the unsaved mark", (await app.tabs()).find((t) => t.front)?.unsaved === false);

  console.log("\nSmart editing");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  check("Enter continues a list", (await app.line("- two")) === "- two", await app.line("two"));
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("(x");
  check("an empty item ends the list, and brackets close themselves", (await app.line("(x")) === "(x)", await app.line("(x"));
  await page.keyboard.press("End");
  await page.keyboard.type(" plain");
  await page.locator(".cm-line", { hasText: "(x) plain" }).dblclick({ position: { x: 60, y: 8 } });
  const word = await page.evaluate(() => getSelection().toString());
  await page.keyboard.type("*");
  await page.keyboard.type("*");
  check("typing ** over a selection makes it bold", word === "plain" && (await app.line("(x)")) === "(x) **plain**", [word, await app.line("(x)")]);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "https://example.com/page");
    document.querySelector(".cm-content").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  check("pasting a web address over a selection makes a link", (await app.line("(x)")) === "(x) **[plain](https://example.com/page)**", await app.line("(x)"));
  await save();

  console.log("\nRich view and tables");
  await app.menu("View", "Rich");
  check("View > Rich turns the Rich view on", await page.evaluate(() => document.querySelector(".cm-editor").classList.contains("cm-rich")));
  check("Markdown symbols are hidden away from the cursor", (await app.line("Smoke")) === "Smoke", await app.line("Smoke"));
  const cell = page.locator('.cm-rich-table [data-cell="1:0"]');
  await cell.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("one");
  await page.waitForTimeout(300);
  check("Select All in a table cell stays in the cell", (await page.locator(".cm-line").count()) > 3 && (await app.line("Smoke")) !== null);
  await page.keyboard.press("Tab");
  check("Tab moves to the next cell", (await page.evaluate(() => document.activeElement?.getAttribute("data-cell"))) === "1:1");
  await page.keyboard.press("Escape");
  await save();
  check("the edited table is saved as aligned Markdown", read().includes("| A   | B   |\n| --- | --- |\n| one | 2   |"), read());
  check("the rest of the note is intact", read().startsWith("# Smoke\n\nHello world."), read().slice(0, 40));

  console.log("\nFind and replace");
  await app.menu("View", "Split");
  await page.locator(".cm-line", { hasText: "Hello world" }).click();
  await page.keyboard.press("Control+f");
  await page.locator(".cm-search input[name=search]").pressSequentially("world");
  await page.waitForTimeout(400);
  check("find highlights the match", (await page.locator(".cm-searchMatch").count()) >= 1);
  await page.locator(".cm-search input[name=replace]").pressSequentially("there");
  await page.locator(".cm-search button[name=replaceAll]").click();
  await page.keyboard.press("Escape");
  await save();
  check("replace all changes the text", read().includes("Hello there."), read().slice(0, 40));

  console.log("\nSettings, zoom, menus");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+,");
  check("Ctrl+, opens Settings", (await page.locator(".settings").count()) === 1);
  await page.locator(".settings .segmented button", { hasText: "Dark" }).click();
  check("choosing Dark applies it", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");
  await page.keyboard.press("Escape");
  check("Esc closes Settings", (await page.locator(".settings").count()) === 0);
  const size = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".cm-editor")).fontSize));
  const normal = await size();
  await app.menu("View", "Zoom In");
  check("View > Zoom In enlarges the text", (await size()) > normal, [normal, await size()]);
  await app.menu("View", "Actual Size");
  await page.locator(".cm-content").click();
  await page.keyboard.press("F10");
  await page.waitForTimeout(250);
  check("F10 opens the menu on its first item", (await page.evaluate(() => document.querySelector(".menu-item.active .menu-label")?.textContent)) === "File");
  await page.keyboard.press("Escape");
  check("Esc closes the menu", (await page.locator(".menu").count()) === 0);

  console.log("\nFocus mode and the command palette");
  await page.keyboard.press("F11");
  await page.waitForTimeout(1200);
  const focused = await page.evaluate(() => ({
    on: document.querySelector(".app").classList.contains("focus"),
    sidebar: getComputedStyle(document.querySelector(".sidebar")).display,
    tabs: getComputedStyle(document.querySelector(".tabstrip")).display,
    lit: document.querySelectorAll(".cm-focus-lit").length,
    dim: document.querySelectorAll(".cm-line:not(.cm-focus-lit)").length,
  }));
  check("F11 hides everything but the text", focused.on && focused.sidebar === "none" && focused.tabs === "none", focused);
  check("and lights only the paragraph being written", focused.lit >= 1 && focused.dim >= 1, focused);
  await page.keyboard.press("F11");
  await page.waitForTimeout(1200);
  check("F11 again brings the window back", await page.evaluate(() => !document.querySelector(".app").classList.contains("focus") && getComputedStyle(document.querySelector(".sidebar")).display !== "none"));
  await page.keyboard.press("Control+t");
  await page.waitForSelector(".palette");
  await page.keyboard.type("oth");
  await page.waitForTimeout(200);
  check("Ctrl+T finds a note from a few letters", (await page.locator(".palette-item.active .palette-label").textContent()) === "Other.md");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  check("and Enter opens it", (await app.frontTab()) === "Other.md" && (await page.locator(".palette").count()) === 0, await app.frontTab());
  await page.keyboard.press("Control+Shift+P");
  await page.waitForSelector(".palette");
  await page.keyboard.type("light");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  check("Ctrl+Shift+P runs a command by name", (await page.evaluate(() => document.documentElement.dataset.theme)) === "light");
  await page.locator(".tab", { hasText: "Note.md" }).click();
  await page.waitForTimeout(400);

  console.log("\nSearch in folder, images, export");
  await page.keyboard.press("Control+Shift+F");
  await page.keyboard.type("needle");
  await page.waitForSelector(".search-hit", { timeout: 10000 });
  check("folder search finds the line", (await page.locator(".search-hit").count()) === 1);
  await page.locator(".search-hit").first().click();
  await page.waitForTimeout(800);
  check("a result opens its file with the match selected", (await app.frontTab()) === "Other.md" && (await page.evaluate(() => getSelection().toString())) === "needle");
  await page.locator(".side-search input").fill("");
  await page.locator(".tab", { hasText: "Note.md" }).click();
  await page.waitForTimeout(500);
  const box = await page.locator(".cm-line", { hasText: "Hello there" }).boundingBox();
  await app.drop([join(work, "pic.png")], { x: box.x + 4, y: box.y + box.height / 2 });
  await page.waitForTimeout(1200);
  check("a dropped image is copied to assets", existsSync(join(notes, "assets", "pic.png")));
  check("and linked where it was dropped", (await app.line("![](assets/pic.png)")) !== null);
  check("the preview shows it", (await page.evaluate(() => document.querySelector(".pane-preview img")?.naturalWidth ?? 0)) === 1);
  const html = await page.evaluate(async () => {
    const { buildHtml } = await import("/src/lib/export/export.ts");
    return buildHtml("# Exported\n\nSome $x^2$ math and `code`.\n", null, "Exported", "light", "blue");
  });
  check("HTML export builds a standalone page", html.includes("<h1") && html.includes("Exported") && html.includes("@font-face") && !html.includes("http://localhost"), html.length);

  console.log("\nCrash recovery");
  await app.menu("File", "New");
  await page.locator(".cm-content").click();
  await page.keyboard.type("Unsaved smoke text.");
  await page.waitForTimeout(1600);
  const copies = () => (existsSync(recoveryDir) ? readdirSync(recoveryDir).filter((f) => f.endsWith(".json")) : []);
  check("an unsaved note gets a recovery copy", copies().length === 1, copies());
  check("no errors in the app so far", errors.length === 0, errors.slice(0, 3));
  check("(the test can see the app's process)", appRunning());
  await browser.close().catch(() => {});
  stopApp(); // the "crash"
  await sleep(2000);
  check("the copy survives the app being killed", copies().length === 1, copies());

  ({ browser, page } = await startApp());
  await page.waitForTimeout(4000); // the app is showing its native Restore prompt
  const context = browser.contexts()[0];
  await context.route(/plugin-dialog/, (route) => route.fulfill({ contentType: "application/javascript", body: DIALOG_STUB }));
  await page.reload();
  watch(page);
  app = driver(page);
  await page.waitForSelector(".cm-content", { timeout: 120000 });
  await page.waitForTimeout(4000);
  const asked = await page.evaluate(() => window.__dialogs ?? []);
  check("the next launch offers to restore", asked.some((m) => /did not close properly/.test(m)), asked);
  const restored = (await app.tabs()).find((t) => t.name.startsWith("Untitled"));
  check("the note comes back as an unsaved tab", restored?.unsaved === true && restored.front, await app.tabs());
  check("with its text", (await app.line("Unsaved smoke text.")) !== null);
  // A normal quit ("Don't Save"): nothing may be left to recover.
  await page.evaluate(() => void window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://close-requested", payload: null }).catch(() => {}));
  let exited = false;
  for (let i = 0; i < 20 && !exited; i++) {
    await sleep(500);
    exited = !appRunning();
  }
  check("closing the window quits the app", exited);
  check("a normal quit leaves no recovery copies", copies().length === 0, copies());
  check("no errors after the restart", errors.length === 0, errors.slice(0, 3));
  await browser.close().catch(() => {});
}

let crashed = null;
try {
  await main();
} catch (err) {
  crashed = err;
} finally {
  stopApp();
  for (const dir of [work, appData, localData]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // The web view can hold its folder for a moment after exit; it is recreated clean next run anyway.
    }
  }
}

if (crashed) {
  console.error(`\nThe smoke test could not finish: ${crashed.stack ?? crashed}`);
  process.exit(2);
}
console.log(failures.length ? `\n${failures.length} check(s) failed:\n  ${failures.join("\n  ")}` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
