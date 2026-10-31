/** Copy while the user's click is still active in FiveM CEF.
 * execCommand works in older embedded browsers; the Clipboard API covers hosts
 * that disable it. Neither path reports success unless the browser confirms it.
 */
function legacyCopy(value, doc) {
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;
  const previous = doc.activeElement;
  const start = previous?.selectionStart;
  const end = previous?.selectionEnd;
  const direction = previous?.selectionDirection;
  const selection = doc.getSelection?.();
  const ranges = [];
  if (selection) for (let i = 0; i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i).cloneRange());
  const field = doc.createElement('textarea');
  field.value = value;
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  try {
    doc.body.append(field);
    field.focus({ preventScroll: true });
    field.select();
    return doc.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    field.remove();
    if (previous?.isConnected) {
      try { previous.focus({ preventScroll: true }); } catch { /* Disposed editor. */ }
      if (Number.isInteger(start) && Number.isInteger(end) && typeof previous.setSelectionRange === 'function') {
        try { previous.setSelectionRange(start, end, direction || 'none'); } catch { /* Non-text input. */ }
      }
    }
    if (selection && ranges.length) {
      try { selection.removeAllRanges(); for (const range of ranges) selection.addRange(range); } catch { /* Selection moved. */ }
    }
  }
}

export async function copyText(value, { doc = globalThis.document, nav = globalThis.navigator } = {}) {
  const text = String(value ?? '');
  if (legacyCopy(text, doc)) return true;
  if (typeof nav?.clipboard?.writeText !== 'function') return false;
  try { await nav.clipboard.writeText(text); return true; } catch { return false; }
}
