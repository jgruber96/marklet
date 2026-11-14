/*
 * Hover labels for an iPad used with a mouse or trackpad. The iPadOS web view
 * never shows an element's `title` as a tooltip, so on iOS the app draws it:
 * after a short pause over anything with a title, a small label appears below
 * it (above it near the bottom of the screen). Touches never show one, and
 * desktop keeps the system's own tooltips.
 */

/** How long the pointer rests on something before its label appears (ms). */
const DELAY = 600;
/** Space between the element and its label, and the label and the screen edge (px). */
const GAP = 6;

export function installHoverTips(): void {
  const tip = document.createElement("div");
  tip.className = "hover-tip";
  // The buttons already carry aria-labels; this is for the eye only.
  tip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tip);

  let target: HTMLElement | null = null;
  let timer = 0;

  const hide = () => {
    window.clearTimeout(timer);
    target = null;
    tip.classList.remove("shown");
  };

  const show = (el: HTMLElement) => {
    const text = el.getAttribute("title")?.trim();
    if (!text || !el.isConnected) return;
    tip.textContent = text;
    // Measured while still invisible, so it appears in place without a jump.
    const box = el.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    let top = box.bottom + GAP;
    if (top + size.height > window.innerHeight - GAP) top = box.top - GAP - size.height;
    const left = Math.min(Math.max(GAP, box.left + box.width / 2 - size.width / 2), window.innerWidth - size.width - GAP);
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    tip.classList.add("shown");
  };

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = (e.target as Element).closest<HTMLElement>("[title]");
    if (el === target) return;
    hide();
    if (!el) return;
    target = el;
    timer = window.setTimeout(() => show(el), DELAY);
  });

  document.addEventListener("pointerout", (e) => {
    if (!target) return;
    const to = e.relatedTarget as Node | null;
    if (to && target.contains(to)) return;
    hide();
  });

  // Clicking, typing or scrolling puts the label away.
  for (const type of ["pointerdown", "keydown", "wheel"]) document.addEventListener(type, hide, true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
}
