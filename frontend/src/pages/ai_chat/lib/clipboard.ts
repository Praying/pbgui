/**
 * Copy text to the clipboard and report whether it landed.
 *
 * PBGui is often opened over plain HTTP on a LAN address, which is not a
 * secure context, so `navigator.clipboard` is missing there; the hidden
 * textarea + execCommand path (WorkspaceHeader uses the same trick) keeps
 * the copy button working. Focus returns to the element that had it, so a
 * keyboard user stays on the copy button.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
      previous?.focus({ preventScroll: true });
    }
  }
}
