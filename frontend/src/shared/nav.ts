/** Navigate the top frame to url, falling back to the current frame when a browser blocks top access. */
export function replaceTopLocation(url: string): void {
  try {
    if (window.top) {
      window.top.location.replace(url);
      return;
    }
  } catch {
    // A browser may block top access; fall through to the current frame.
  }
  window.location.replace(url);
}
