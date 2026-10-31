// Measure visible text on solid CSS surfaces. Image/gradient-backed content is
// reported separately for visual review rather than assigned a guessed color.
window.auditPhoneContrast = (scope = document.querySelector('#duo')) => {
  // getComputedStyle may serialize sRGB as either legacy RGB bytes or the
  // modern color(srgb) form, whose channels use a 0–1 reference range.
  // Unsupported profiles stay unmeasured; interpreting them as black would
  // turn a parser limitation into a false contrast failure (or pass).
  const numeric = token => {
    const match = String(token).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%)?$/i);
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isFinite(number) ? {number, percent:!!match[2]} : null;
  };
  const alphaValue = token => {
    const part = numeric(token); if (!part) return null;
    return Math.max(0,Math.min(1,part.percent ? part.number / 100 : part.number));
  };
  const components = (tokens, scale, percentScale, clamp) => {
    if (tokens.length !== 3) return null;
    const result=[];
    for (const token of tokens) {
      const part=numeric(token); if (!part) return null;
      const value=part.number*(part.percent?percentScale:scale);
      if (!Number.isFinite(value)) return null;
      if (clamp) result.push(Math.max(0,Math.min(255,value)));
      else { if (value < 0 || value > 1) return null; result.push(value*255); }
    }
    return result;
  };
  const parse = value => {
    if (typeof value !== 'string') return null;
    const color=value.trim();
    const rgb=color.match(/^rgba?\((.*)\)$/i);
    if (rgb) {
      const body=rgb[1].trim();let channels,alpha='1';
      if (body.includes(',')) {
        if (body.includes('/')) return null;
        const parts=body.split(',').map(part=>part.trim());
        if (parts.length !== 3 && parts.length !== 4) return null;
        channels=parts.slice(0,3);if(parts.length===4)alpha=parts[3];
        const channelTypes=channels.map(numeric);
        if(channelTypes.some(part=>!part)||channelTypes.some(part=>part.percent!==channelTypes[0].percent))return null;
      } else {
        const slash=body.split('/');if(slash.length>2)return null;
        channels=slash[0].trim().split(/\s+/);if(slash.length===2)alpha=slash[1].trim();
        if(slash.length===2&&/\s/.test(alpha))return null;
      }
      const values=components(channels,1,2.55,true),a=alphaValue(alpha);
      return values&&a!==null?[...values,a]:null;
    }
    const srgb=color.match(/^color\(\s*srgb\s+([^()]*)\)$/i);
    if (!srgb) return null;
    const slash=srgb[1].trim().split('/');if(slash.length>2)return null;
    const channels=slash[0].trim().split(/\s+/),alpha=slash.length===2?slash[1].trim():'1';
    if(slash.length===2&&/\s/.test(alpha))return null;
    const values=components(channels,1,0.01,false),a=alphaValue(alpha);
    return values&&a!==null?[...values,a]:null;
  };
  const over = (top, bottom) => top.slice(0, 3).map((v, i) => v * top[3] + bottom[i] * (1 - top[3]));
  const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
  const failures = [], unmeasured = []; let measured = 0;
  for (const node of scope.querySelectorAll('*')) {
    const text = [...node.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    if (!text || node.closest('[inert],[aria-hidden=true]') || !node.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})) continue;
    const box = node.getBoundingClientRect(), viewport = scope.getBoundingClientRect();
    if (box.width < 1 || box.height < 1 || box.bottom <= viewport.top || box.top >= viewport.bottom || box.right <= viewport.left || box.left >= viewport.right) continue;
    const style = getComputedStyle(node); let layers = [], opacity = 1, uncertain = false;
    // Status and slider labels can be backed by positioned siblings instead
    // of ancestor backgrounds. Keep these in the screenshot review queue.
    if (node.closest('.duo-status,.cc-slider')) {
      unmeasured.push({text: text.slice(0, 90), selector: node.tagName.toLowerCase()+'.'+[...node.classList].join('.'), reason: 'positioned sibling background'});
      continue;
    }
    let unsupportedColor=false;
    for (let parent = node; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent); opacity *= Number(css.opacity);
      if (css.backgroundImage !== 'none') { uncertain = true; break; }
      const color = parse(css.backgroundColor); if(!color){unsupportedColor=true;break;} layers.push(color);
      if (color[3] >= .999) break;
    }
    const context = []; for (let parent=node; parent && context.length<5; parent=parent.parentElement) context.push(parent.tagName.toLowerCase()+'.'+[...parent.classList].join('.'));
    const entry = {text: text.slice(0, 90), selector: node.tagName.toLowerCase() + '.' + [...node.classList].join('.'), context, foreground: style.color};
    if(unsupportedColor)entry.reason='unsupported CSS color syntax or profile';
    if (uncertain || unsupportedColor || !layers.some(c => c[3] >= .999) || opacity < .99) { unmeasured.push(entry); continue; }
    let background = [255, 255, 255];
    for (const color of layers.reverse()) background = over(color, background);
    const textColor=parse(style.color);if(!textColor){unmeasured.push({...entry,reason:'unsupported CSS foreground color syntax or profile'});continue;}
    const foreground = over(textColor, background), levels = [luminance(foreground), luminance(background)].sort((a,b) => a-b);
    const ratio = (levels[1] + .05) / (levels[0] + .05);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    measured++;
    if (ratio < (large ? 3 : 4.5)) failures.push({...entry, background, ratio: +ratio.toFixed(2), disabled: !!node.closest(':disabled,[aria-disabled=true]')});
  }
  return {measured, failures, unmeasured};
};
