/**
 * The note a new user sees on first launch (and from Settings › Welcome Note):
 * a short tour that is itself a Markdown document, so the preview and the
 * Rich view have something to show. `mac` picks the key names.
 */
export function welcomeNote(mac: boolean): string {
  const mod = mac ? "Cmd" : "Ctrl";
  const focus = mac ? "Cmd+Shift+Enter" : "F11";
  return `# Welcome to Marklet

Marklet is a quiet place to write **Markdown**. Your notes are plain text files on your own computer, so they open in any other app and are yours to keep.

This note is a short tour. Edit it freely: nothing here is saved unless you choose to save it.

## Three ways to look at a note

- **Split** (${mod}+2) shows the Markdown on the left and the finished page on the right.
- **Rich** (${mod}+4) hides the symbols and lets you write on the finished page. Try it now.
- **Focus mode** (${focus}) clears everything but your words.

## Things to try

- [x] Open Marklet
- [ ] Press ${mod}+4, then click this box to tick it
- [ ] Press ${mod}+Shift+P and type a few letters of any command
- [ ] Open a folder of notes (${mod}+Shift+O), then jump between them with ${mod}+T
- [ ] Paste a screenshot into a saved note

## What Markdown can do here

Text can be **bold**, *italic*, ~~struck through~~ or \`code\`, and can link to [other pages](https://github.com/jgruber96/marklet).

| Feature      | How                              |
| :----------- | :------------------------------- |
| Tables       | Click a cell in Rich view        |
| Math         | Write it between dollar signs    |
| Diagrams     | A code block marked \`mermaid\`    |
| Export       | HTML or PDF, from the toolbar    |

Math looks like this, $e^{i\\pi} + 1 = 0$, or on its own line:

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

A diagram is a few lines of text:

\`\`\`mermaid
graph LR
  Idea --> Draft --> Edit --> Share
\`\`\`

And code is highlighted:

\`\`\`ts
const greet = (name: string) => \`Hello, \${name}\`;
\`\`\`

> Good tools disappear while you work.

## Good to know

- **Nothing is lost.** Notes save themselves two seconds after you stop typing, and unsaved work is offered back if the app or your computer goes down.
- **Make it yours.** ${mod}+, opens Settings: theme, accent color, fonts and text size.
- **This note** is always under Settings › Welcome Note.
`;
}
