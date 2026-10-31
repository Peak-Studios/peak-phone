/* Restrictive rich-text renderer. Reconstructs an allowlisted HTML tree; never returns source markup.
 * Intentionally excludes links, images, embedded documents, stylesheets, forms and active media.
 * Documents retain normal text formatting. Photos use separate validated URL components.
 */
(() => {
  const tags = new Set('p div span strong b em i u s strike del blockquote pre code br hr h1 h2 h3 h4 h5 h6 ol ul li table tbody thead tr td th'.split(' '));
  const discard = new Set('script style iframe frame object embed template svg math noscript textarea xmp plaintext link meta base form input button select'.split(' '));
  const classes = /^(?:ql-(?:align-(?:left|center|right|justify)|indent-[0-8]|size-(?:small|large|huge)|font-(?:serif|monospace)|direction-rtl)|ck-content|fa[srb]?|fa-[a-z0-9-]+|svelte-[a-z0-9]+)$/;
  function sanitize(input) {
    if (input == null) return '';
    const text = String(input); if (text.length > 200000) return '';
    const parsed = new DOMParser().parseFromString(text, 'text/html');
    const out = document.createElement('div'); let count = 0;
    function copy(node, target, depth) {
      if (++count > 12000 || depth > 40) return;
      if (node.nodeType === 3) { target.appendChild(document.createTextNode(node.data)); return; }
      if (node.nodeType !== 1 || discard.has(node.localName)) return;
      let next = target;
      if (tags.has(node.localName)) {
        next = document.createElement(node.localName);
        const c = (node.getAttribute('class') || '').split(/\s+/).filter(x => classes.test(x)).join(' ');
        if (c) next.className = c;
        // Only harmless color/alignment values; no URLs, custom properties or arbitrary CSS.
        for (const prop of ['color','background-color','text-align']) {
          const value = node.style.getPropertyValue(prop);
          if (/^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s]+\)|[a-z]{3,20})$/i.test(value)) next.style.setProperty(prop,value);
        }
        target.appendChild(next);
      }
      for (const child of node.childNodes) copy(child, next, depth + 1);
    }
    for (const child of parsed.body.childNodes) copy(child, out, 0);
    return out.innerHTML;
  }
  Object.defineProperty(window, 'PeakDuoSanitize', {value: sanitize, writable: false});
})();
