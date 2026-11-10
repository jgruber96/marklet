export interface Heading {
  level: number;
  text: string;
  /** 0-based source line; matches the preview's `data-line`. */
  line: number;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const PARAGRAPH_BREAKER = /^ {0,3}(?:[-*+>]|\d+[.)]|#{1,6}(?:\s|$)|`{3,}|~{3,}|\|)|^\s*$|^ {4}/;

/** Inline Markdown down to plain text: `**a** [b](c) \`d\`` → `a b d`. */
function plain(text: string): string {
  // Escaped characters (\*) are parked as private-use code points so they can't act as markers.
  let out = text.replace(/\\([\\`*_{}[\]()#+\-.!~])/g, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)));
  out = out.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, "");
  // Repeat for nested emphasis such as ***both***.
  for (let i = 0; i < 3; i++) out = out.replace(/(\*\*|__|\*|_|~~|`)(.+?)\1/g, "$2");
  return out.replace(/[-]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000)).trim();
}

/** ATX (`# Title`) and setext (`Title` over `===`) headings, skipping fenced code. */
export function findHeadings(source: string): Heading[] {
  const lines = source.split("\n");
  const out: Heading[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    const atx = ATX.exec(line);
    if (atx) {
      out.push({ level: atx[1].length, text: plain(atx[2] ?? ""), line: i });
      continue;
    }
    // A setext underline turns the paragraph line above it into a heading.
    const setext = SETEXT.exec(line);
    const prev = lines[i - 1];
    if (setext && i > 0 && !PARAGRAPH_BREAKER.test(prev) && (i < 2 || /^\s*$/.test(lines[i - 2]) || ATX.test(lines[i - 2]) || FENCE.test(lines[i - 2]))) {
      out.push({ level: setext[1][0] === "=" ? 1 : 2, text: plain(prev), line: i - 1 });
    }
  }
  return out;
}
