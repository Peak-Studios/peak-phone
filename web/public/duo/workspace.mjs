/** Pure workspace state. An app instance is never cloned: moving/folding keeps its DOM. */
export const sides = ['left', 'right'];
export function initialWorkspace(expanded = false, layout = 'split') {
  return { expanded: !!expanded, layout: layout === 'full' ? 'full' : 'split', ratio: 0.5, active: 'left', panes: { left: { app: null, home: true }, right: { app: null, home: true } } };
}
export function reduceWorkspace(current, action) {
  const state = { ...current, panes: { left: { ...current.panes.left }, right: { ...current.panes.right } } };
  const side = sides.includes(action.side) ? action.side : state.active;
  switch (action.type) {
    case 'FOCUS': state.active = side; break;
    case 'TOGGLE': state.expanded = !state.expanded; break;
    case 'EXPAND': state.expanded = !!action.value; break;
    case 'LAYOUT': if (['full', 'split'].includes(action.value)) state.layout = action.value; break;
    case 'RATIO': if (Number.isFinite(action.value)) state.ratio = Math.max(0.4, Math.min(0.6, action.value)); break;
    case 'MOVE': {
      const from = sides.includes(action.from) ? action.from : state.active;
      if (from !== side) {
        const other = state.panes[side]; state.panes[side] = state.panes[from]; state.panes[from] = other;
      }
      state.active = side; break;
    }
    case 'HOME': state.active = side; state.panes[side].home = true; break;
    case 'RESUME': state.active = side; if (state.panes[side].app) state.panes[side].home = false; break;
    case 'OPEN': {
      if (typeof action.app !== 'string' || !action.app) break;
      const existing = sides.find(key => state.panes[key].app === action.app);
      if (existing) { state.active = existing; state.panes[existing].home = false; }
      else { state.active = side; state.panes[side] = { app: action.app, home: false }; }
      break;
    }
    case 'CLOSE': state.panes[side] = { app: null, home: true }; break;
    case 'REMOVE': for (const key of sides) if (state.panes[key].app === action.app) state.panes[key] = { app: null, home: true }; break;
    case 'SWAP': {
      const left = state.panes.left; state.panes.left = state.panes.right; state.panes.right = left;
      state.active = state.active === 'left' ? 'right' : 'left'; break;
    }
    case 'RESET': return { ...initialWorkspace(state.expanded, state.layout), ratio: state.ratio ?? 0.5 };
  }
  return state;
}
export function visibleApps(state, phoneVisible = true) {
  if (!phoneVisible) return [];
  return sides.filter(key => isPaneVisible(state, key))
    .filter(key => !state.panes[key].home && state.panes[key].app)
    .map(key => state.panes[key].app);
}
export function activeApp(state) { const pane = state.panes[state.active]; return pane.home ? 'home' : pane.app || 'home'; }
export function isEditing(target) {
  return !!(target && (target.isContentEditable || target.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"],.ck-editor__editable')));
}
export function shouldFold(event, visible, blocked = false) {
  return visible && !blocked && !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
    String(event.key).toLowerCase() === 'e' && !isEditing(event.target);
}

/** Closed and full-screen views expose exactly one workspace; hidden apps remain mounted. */
export function isPaneVisible(state, side) { return (state.expanded && state.layout !== 'full') || side === state.active; }
