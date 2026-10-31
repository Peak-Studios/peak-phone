/** Disable backdrop-filter declarations while preserving comments, strings and selectors. */
function disableBackdropFilters(css) {
  if (typeof css !== 'string') throw new TypeError('Expected CSS text');
  let out = '', i = 0, previous = '';
  const commentEnd = pos => { const end = css.indexOf('*/', pos + 2); return end < 0 ? css.length : end + 2; };
  const stringEnd = pos => {
    const quote = css[pos++];
    while (pos < css.length) { if (css[pos] === '\\') { pos += 2; continue; } if (css[pos++] === quote) break; }
    return pos;
  };
  while (i < css.length) {
    if (css.startsWith('/*', i)) { const end=commentEnd(i); out+=css.slice(i,end); i=end; continue; }
    if (css[i] === '"' || css[i] === "'") { const end=stringEnd(i); out+=css.slice(i,end); previous='string'; i=end; continue; }
    const match = (previous === '{' || previous === ';') && /^(?:-webkit-)?backdrop-filter\b/i.exec(css.slice(i));
    if (match) {
      let colon=i+match[0].length;
      while (colon < css.length) {
        if (/\s/.test(css[colon])) colon++;
        else if (css.startsWith('/*',colon)) colon=commentEnd(colon);
        else break;
      }
      if (css[colon] === ':') {
        let end=colon+1, depth=0;
        while (end < css.length) {
          if (css.startsWith('/*',end)) { end=commentEnd(end); continue; }
          if (css[end] === '"' || css[end] === "'") { end=stringEnd(end); continue; }
          if (css[end] === '(') depth++;
          if (css[end] === ')') depth--;
          if (!depth && (css[end] === ';' || css[end] === '}')) break;
          end++;
        }
        const important = /!\s*important/i.test(css.slice(colon+1,end).replace(/\/\*[\s\S]*?\*\//g,''));
        const current=css.slice(colon+1,end);
        out+=/^\s*none\s*(?:!\s*important)?\s*$/i.test(current) ? css.slice(i,end) : css.slice(i,colon+1)+'none'+(important?'!important':'');
        i=end; previous='value'; continue;
      }
    }
    const char=css[i++]; out+=char; if (!/\s/.test(char)) previous=char;
  }
  return out;
}
module.exports = { disableBackdropFilters };
