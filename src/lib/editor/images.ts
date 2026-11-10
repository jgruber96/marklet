import { invoke } from "@tauri-apps/api/core";
import { joinPath } from "../paths";

/** Pasted images are saved in this folder, next to the Markdown file. */
export const IMAGE_FOLDER = "assets";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

/**
 * The images on the clipboard, if the paste is an image rather than text: a
 * screenshot, an image copied from a browser, or image files copied in the
 * file manager. Text copied from an app that also offers a picture of it
 * (a spreadsheet, a word processor) still pastes as text.
 */
export function pastedImages(data: DataTransfer | null): File[] {
  if (!data || data.getData("text/plain")) return [];
  return [...data.files].filter((file) => file.type in EXTENSIONS);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A screenshot has no name of its own (the web view calls it "image.png"), so it gets a dated one. */
function fileNameFor(file: File, now: Date): string {
  const ext = EXTENSIONS[file.type] ?? "png";
  if (file.name && !/^image\.[a-z]+$/i.test(file.name)) return file.name;
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `image-${date}-${time}.${ext}`;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error("The pasted image could not be read."));
    reader.readAsDataURL(file);
  });
}

/**
 * Saves pasted images into the `assets` folder beside the document and
 * returns the Markdown that shows them, with paths relative to the document.
 */
export async function saveImages(files: File[], docDir: string): Promise<string> {
  const folder = joinPath(docDir, IMAGE_FOLDER);
  const now = new Date();
  const lines: string[] = [];
  for (const file of files) {
    const saved = await invoke<string>("save_image", { dir: folder, name: fileNameFor(file, now), data: await toBase64(file) });
    lines.push(`![](${encodeURI(`${IMAGE_FOLDER}/${saved}`).replace(/[()]/g, escape)})`);
  }
  return lines.join("\n");
}
