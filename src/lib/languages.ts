import type { LanguageRegistration } from "shiki/core";
import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";

/**
 * The fenced-code languages Nova MD supports, shared by the editor
 * (CodeMirror language packs) and the preview (Shiki grammars). Every loader
 * is a dynamic import, so nothing is fetched until a block uses it.
 */
interface CodeLanguage {
  /** Fence tags that select this entry, lowercase. */
  tags: string[];
  /** Shown on the preview's code block label. */
  label: string;
  /** Shiki grammar id. */
  shikiId: string;
  editor: () => Promise<LanguageSupport>;
  preview: () => Promise<LanguageRegistration[]>;
}

const shiki = (load: Promise<{ default: LanguageRegistration[] }>) => load.then((m) => m.default);
const legacy = <T>(load: Promise<T>, pick: (m: T) => Parameters<typeof StreamLanguage.define>[0]) =>
  load.then((m) => new LanguageSupport(StreamLanguage.define(pick(m))));

export const CODE_LANGUAGES: CodeLanguage[] = [
  {
    tags: ["js", "javascript"],
    label: "JavaScript",
    editor: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
    shikiId: "javascript",
    preview: () => shiki(import("@shikijs/langs/javascript")),
  },
  {
    tags: ["jsx"],
    label: "JSX",
    editor: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
    shikiId: "jsx",
    preview: () => shiki(import("@shikijs/langs/jsx")),
  },
  {
    tags: ["ts", "typescript"],
    label: "TypeScript",
    editor: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
    shikiId: "typescript",
    preview: () => shiki(import("@shikijs/langs/typescript")),
  },
  {
    tags: ["tsx"],
    label: "TSX",
    editor: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true, jsx: true })),
    shikiId: "tsx",
    preview: () => shiki(import("@shikijs/langs/tsx")),
  },
  {
    tags: ["py", "python"],
    label: "Python",
    editor: () => import("@codemirror/lang-python").then((m) => m.python()),
    shikiId: "python",
    preview: () => shiki(import("@shikijs/langs/python")),
  },
  {
    tags: ["yml", "yaml"],
    label: "YAML",
    editor: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
    shikiId: "yaml",
    preview: () => shiki(import("@shikijs/langs/yaml")),
  },
  {
    tags: ["json"],
    label: "JSON",
    editor: () => import("@codemirror/lang-json").then((m) => m.json()),
    shikiId: "json",
    preview: () => shiki(import("@shikijs/langs/json")),
  },
  {
    tags: ["jsonc"],
    label: "JSONC",
    // lang-json is strict JSON; the legacy JSON mode also tokenizes comments.
    editor: () => legacy(import("@codemirror/legacy-modes/mode/javascript"), (m) => m.json),
    shikiId: "jsonc",
    preview: () => shiki(import("@shikijs/langs/jsonc")),
  },
  {
    tags: ["ps1", "powershell", "pwsh"],
    label: "PowerShell",
    editor: () => legacy(import("@codemirror/legacy-modes/mode/powershell"), (m) => m.powerShell),
    shikiId: "powershell",
    preview: () => shiki(import("@shikijs/langs/powershell")),
  },
  {
    tags: ["sh", "bash", "shell", "zsh"],
    label: "Shell",
    editor: () => legacy(import("@codemirror/legacy-modes/mode/shell"), (m) => m.shell),
    shikiId: "shellscript",
    preview: () => shiki(import("@shikijs/langs/shellscript")),
  },
  {
    tags: ["html"],
    label: "HTML",
    editor: () => import("@codemirror/lang-html").then((m) => m.html()),
    shikiId: "html",
    preview: () => shiki(import("@shikijs/langs/html")),
  },
  {
    tags: ["xml"],
    label: "XML",
    editor: () => import("@codemirror/lang-xml").then((m) => m.xml()),
    shikiId: "xml",
    preview: () => shiki(import("@shikijs/langs/xml")),
  },
  {
    tags: ["css"],
    label: "CSS",
    editor: () => import("@codemirror/lang-css").then((m) => m.css()),
    shikiId: "css",
    preview: () => shiki(import("@shikijs/langs/css")),
  },
  {
    tags: ["scss"],
    label: "SCSS",
    editor: () => import("@codemirror/lang-sass").then((m) => m.sass({ indented: false })),
    shikiId: "scss",
    preview: () => shiki(import("@shikijs/langs/scss")),
  },
  {
    tags: ["sql"],
    label: "SQL",
    editor: () => import("@codemirror/lang-sql").then((m) => m.sql()),
    shikiId: "sql",
    preview: () => shiki(import("@shikijs/langs/sql")),
  },
  {
    tags: ["cs", "csharp"],
    label: "C#",
    editor: () => legacy(import("@codemirror/legacy-modes/mode/clike"), (m) => m.csharp),
    shikiId: "csharp",
    preview: () => shiki(import("@shikijs/langs/csharp")),
  },
  {
    tags: ["rs", "rust"],
    label: "Rust",
    editor: () => import("@codemirror/lang-rust").then((m) => m.rust()),
    shikiId: "rust",
    preview: () => shiki(import("@shikijs/langs/rust")),
  },
];

const byTag = new Map(CODE_LANGUAGES.flatMap((lang) => lang.tags.map((tag) => [tag, lang] as const)));

/** First word of a fence's info string, lowercased: ```` ```YAML title="x" ```` → "yaml". */
export const fenceTag = (info: string) => info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

export const languageForTag = (tag: string): CodeLanguage | undefined => byTag.get(tag);

/** For @codemirror/lang-markdown's `codeLanguages`: matches tags exactly, loads lazily. */
export const editorCodeLanguages = (info: string): LanguageDescription | null => {
  const lang = languageForTag(fenceTag(info));
  return lang ? editorDescriptions.get(lang)! : null;
};

// One description per entry, so each pack loads (and caches) once.
const editorDescriptions = new Map(
  CODE_LANGUAGES.map((lang) => [lang, LanguageDescription.of({ name: lang.label, alias: lang.tags, load: lang.editor })]),
);
