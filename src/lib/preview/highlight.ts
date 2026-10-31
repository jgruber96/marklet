import type { HighlighterCore, ThemeRegistration } from "shiki/core";
import { languageForTag } from "../languages";

/*
 * Shiki for the preview's code blocks. The theme's "colors" are palette names,
 * not hex values; tokens are emitted as <span class="tok-…"> and styles/preview.css
 * maps each class to the --tok-* variables in theme.css. That keeps light/dark
 * switching free (no re-highlight), matches the editor's mapping in
 * lib/editor/highlight.ts, and keeps inline styles out of the sanitized HTML.
 */
const PALETTE = ["keyword", "string", "function", "number", "comment", "plain"] as const;
type Palette = (typeof PALETTE)[number];
const color = (p: Palette) => `#00000${PALETTE.indexOf(p)}`; // Shiki wants hex; decoded below.

const theme: ThemeRegistration = {
  name: "nova",
  type: "light",
  fg: color("plain"),
  bg: "#ffffff",
  settings: [
    { settings: { foreground: color("plain") } },
    { scope: ["comment", "punctuation.definition.comment", "string.quoted.docstring"], settings: { foreground: color("comment") } },
    {
      scope: [
        "keyword",
        "storage",
        "storage.type",
        "storage.modifier",
        "keyword.operator.new",
        "keyword.operator.expression",
        "keyword.operator.logical.python",
        "entity.name.tag",
        "punctuation.definition.tag",
      ],
      settings: { foreground: color("keyword") },
    },
    {
      scope: [
        "string",
        "string.quoted",
        "string.template",
        "string.regexp",
        "string.unquoted.plain.out.yaml",
        "punctuation.definition.string",
      ],
      settings: { foreground: color("string") },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
        "entity.name.type",
        "entity.name.class",
        "entity.other.inherited-class",
        "support.class",
        "support.type",
        "entity.name.function.macro",
      ],
      settings: { foreground: color("function") },
    },
    {
      scope: [
        "constant",
        "constant.numeric",
        "constant.language",
        "constant.character.escape",
        "variable.language",
        "variable.other.constant",
        "support.constant",
        "support.type.property-name",
        "meta.object-literal.key",
        "entity.name.tag.yaml",
        "entity.other.attribute-name",
        "meta.property-name",
      ],
      settings: { foreground: color("number") },
    },
    { scope: ["variable.parameter", "punctuation", "keyword.operator", "meta.embedded"], settings: { foreground: color("plain") } },
  ],
};

let highlighter: HighlighterCore | null = null;
let starting: Promise<HighlighterCore> | null = null;
const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** Called when a grammar finishes loading, so the preview can re-render. */
export function onHighlighterChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function start(): Promise<HighlighterCore> {
  starting ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    async ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      (highlighter = await createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() })),
  );
  return starting;
}

function load(tag: string): Promise<void> | undefined {
  const lang = languageForTag(tag);
  if (!lang) return;
  if (loading.has(lang.label)) return loading.get(lang.label);
  const done = Promise.all([start(), lang.preview()])
    .then(async ([h, grammars]) => {
      await h.loadLanguage(...grammars);
      loaded.add(lang.label);
      listeners.forEach((fn) => fn());
    })
    .catch((err) => console.error(`Could not load ${lang.label} highlighting`, err));
  loading.set(lang.label, done);
  return done;
}

/** Resolves once every grammar requested so far has loaded (export renders, waits, renders again). */
export async function highlightingIdle(): Promise<void> {
  await Promise.all(loading.values());
}

const cache = new Map<string, string>();
const CACHE_LIMIT = 300;

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Highlights a code block's content as HTML spans. Returns null when the tag
 * is unknown or its grammar is still loading (the caller renders plain text,
 * and the preview re-renders once loading finishes).
 */
export function highlightCode(code: string, tag: string): string | null {
  const lang = languageForTag(tag);
  if (!lang) return null;
  if (!highlighter || !loaded.has(lang.label)) {
    load(tag);
    return null;
  }
  const key = `${tag}\0${code}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const lines = highlighter.codeToTokensBase(code.replace(/\n$/, ""), { lang: lang.shikiId, theme: "nova" });
  const html = lines
    .map((line) =>
      line
        .map((token) => {
          const p = PALETTE[Number(token.color?.slice(-1))] ?? "plain";
          const text = escapeHtml(token.content);
          return p === "plain" ? text : `<span class="tok-${p}">${text}</span>`;
        })
        .join(""),
    )
    .join("\n");

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, html);
  return html;
}
