/*
 * Which platform the app runs on, from the web view's user agent.
 *
 * iPadOS reports itself as a Mac, so "Mac" in the user agent alone does not
 * mean macOS: an iPad is told apart by its touch screen (a Mac's web view
 * reports no touch points).
 */

const ua = navigator.userAgent;

/** iPhone or iPad. */
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);

/** Phones and tablets: no menu bar, window controls, folder watcher or self-update. */
export const isMobile = isIOS || /Android/.test(ua);

export const isDesktop = !isMobile;

/** macOS on a Mac (not an iPad). */
export const isMacOS = ua.includes("Mac") && !isIOS;

/** Shortcuts are shown with ⌘ (macOS, and iPad or iPhone with a keyboard) rather than Ctrl. */
export const appleKeys = isMacOS || isIOS;
