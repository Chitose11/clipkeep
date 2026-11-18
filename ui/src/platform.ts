/** True inside the macOS app (WKWebView). Used only for shortcut labels and modifier checks. */
export const isMac =
  /Mac|iPhone|iPad/.test(navigator.platform) || /Mac|iPhone|iPad/.test(navigator.userAgent);

function macKey(key: string): string {
  switch (key) {
    case "Enter":
    case "Return":
      return "↩";
    default:
      return key;
  }
}

/** In-panel shortcut label. The key handler still accepts both Ctrl and ⌘. */
export function modShortcut(key: string): string {
  return isMac ? `⌘${macKey(key)}` : `Ctrl+${key}`;
}

/** Shift+key label, using ⇧ on macOS. */
export function shiftShortcut(key: string): string {
  return isMac ? `⇧${macKey(key)}` : `Shift+${key}`;
}
