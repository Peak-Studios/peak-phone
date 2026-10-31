/** In-memory recent-app state. Preview markup is deliberately never persisted. */
export class AppSwitcherHistory {
  constructor(limit = 8) {
    this.limit = Math.max(1, Math.floor(Number(limit) || 8));
    this.order = [];
    this.previews = new Map();
  }

  remember(id, preview = null) {
    if (typeof id !== 'string' || !id) return [];
    this.order = [id, ...this.order.filter(item => item !== id)];
    if (typeof preview === 'string' && preview.length) this.previews.set(id, preview);
    const evicted = this.order.splice(this.limit);
    for (const item of evicted) this.previews.delete(item);
    return evicted;
  }

  activate(id) {
    this.order = this.order.filter(item => item !== id);
    this.previews.delete(id);
  }

  dismiss(id) {
    const existed = this.order.includes(id);
    this.order = this.order.filter(item => item !== id);
    this.previews.delete(id);
    return existed;
  }

  clear() {
    this.order = [];
    this.previews.clear();
  }

  list() { return [...this.order]; }
  preview(id) { return this.previews.get(id) || ''; }
}

/** Cycle through one stable MRU stack while repeated edge gestures are made. */
export function cycleQuickSwitch(current, recents, direction = 1, previous = null) {
  const uniqueRecents = [...new Set(recents)].filter(id => id && id !== current);
  if (!current || !uniqueRecents.length) return { sequence: current ? [current] : [], index: 0, target: null };
  const sameMembers = previous?.sequence?.length === uniqueRecents.length + 1 &&
    new Set(previous.sequence).size === uniqueRecents.length + 1 &&
    [current, ...uniqueRecents].every(id => previous.sequence.includes(id));
  const valid = sameMembers && previous.sequence[previous.index] === current;
  const sequence = valid ? [...previous.sequence] : [current, ...uniqueRecents];
  const index = valid
    ? (previous.index + (direction < 0 ? -1 : 1) + sequence.length) % sequence.length
    : 1;
  return { sequence, index, target: sequence[index] };
}

/**
 * Turn a safe displaySnapshot app node into an inert, same-origin preview.
 * It remains only in memory for the current phone session.
 */
export function sanitizeAppPreview(node, baseURL = globalThis.location?.href || 'http://localhost/') {
  if (!node?.cloneNode) return '';
  const copy = node.cloneNode(true);
  const origin = (() => { try { return new URL(baseURL).origin; } catch { return 'http://localhost'; } })();
  const safeURL = value => {
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(value)) return true;
    try { return new URL(value, baseURL).origin === origin; } catch { return false; }
  };
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    if ((element.getAttribute('class') || '').split(/\s+/).some(name => name === 'duo-mirror-control-overlay' || name === 'duo-mirror-control-text')) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || ['id', 'for', 'name', 'list', 'form', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'href', 'xlink:href', 'formaction', 'action', 'target', 'autofocus', 'contenteditable'].includes(name)) {
        element.removeAttribute(attribute.name);
      } else if (['src', 'srcset', 'poster'].includes(name) && !safeURL(attribute.value)) {
        element.removeAttribute(attribute.name);
      } else if (name === 'style' && /url\s*\(/i.test(attribute.value)) {
        element.style.removeProperty('background-image');
        element.style.removeProperty('list-style-image');
        if (/url\s*\(/i.test(element.getAttribute('style') || '')) element.removeAttribute('style');
      }
    }
    if (element.matches('form')) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    if (element.matches('script,style,link,iframe,object,embed,base,meta,foreignObject,video,audio')) {
      element.remove();
      continue;
    }
    if (element.matches('button,input,textarea,select,[tabindex]')) {
      element.setAttribute('tabindex', '-1');
      element.setAttribute('aria-hidden', 'true');
      if ('disabled' in element) {
        if (!element.disabled) element.setAttribute('data-switcher-enabled', 'true');
        element.disabled = true;
      }
      if (element.matches('input,textarea')) {
        element.removeAttribute('value');
        if (element.matches('input[type=password]')) element.value = '';
      }
    }
  }
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('data-switcher-preview', 'true');
  const markup = copy.outerHTML;
  return markup.length <= 220000 ? markup : '';
}
