"""Build the phone's compatibility bridge and append its semantic theme layer.

Legacy applications predate the shared iOS presentation and use unrelated class
names.  This generator discovers only content groups, controls, and text roles;
it never guesses a role from a color's brightness.  The authored role system is
maintained in web/public/duo/appearance-semantic.css.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CLASS = re.compile(r'\.([a-zA-Z_][\w-]*)')
DECLARATION = re.compile(r'([\w-]+)\s*:\s*([^;]+)')

# These classes describe user media, artwork, identity, brand, or a state icon.
# They stay under their component's own styling instead of becoming a neutral
# panel merely because their names happen to include "card", "item", or "tile".
PROTECTED = re.compile(
    r'(wallpaper|icon|image|photo|gallery|camera|video|media|poster|avatar|logo|brand|map|chart|graph|waveform|progress|loader|spinner|skeleton|thumbnail|thumb|artwork|(?:^|[-_])art(?:[-_]|$)|cover|badge|indicator|status-dot|visual|stage|hero|scene|island|profile-placeholder)',
    re.I,
)
ELEVATED = ('modal', 'sheet', 'dialog', 'popover', 'dropdown', 'menu')
GROUPED = ('card', 'row', 'item', 'cell', 'paper', 'list', 'panel', 'section', 'group', 'bubble', 'conversation', 'composer', 'field', 'input', 'form', 'search', 'record', 'post')
CONTROL = ('pill', 'chip', 'segment', 'toggle', 'switch', 'primary-btn', 'action-btn', 'icon-btn')
PRIMARY_ACTION = ('primary', 'submit', 'confirm', 'answer', 'operator', 'equals', 'buy', 'pay', 'install', 'outgoing')
SECONDARY_TEXT = ('muted', 'secondary', 'subtitle', 'caption', 'preview', 'hint', 'helper', 'meta', 'eyebrow', 'footnote', 'placeholder', 'description', 'tertiary', 'storage-note', 'empty', 'date', 'time')
STATE_WORDS = ('active', 'selected', 'disabled', 'error', 'warning', 'danger', 'destructive', 'success', 'finished', 'completed', 'busy', 'connected', 'disconnected', 'online', 'offline', 'current', 'missed', 'unread', 'positive', 'negative', 'focus', 'checked', 'invalid', 'pending', 'pressed', 'on', 'off')
STATE_ATTRIBUTES = re.compile(r'\[(?:data-)?(?:active|selected|pressed|checked|disabled|on|off|current|busy|connected|unread|missed)(?:\s*[*^$|~]?=|\])', re.I)


def rules(css):
    """Yield ordinary CSS rules, walking nested media/supports blocks."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    pos = 0
    while pos < len(css):
        start = css.find('{', pos)
        if start < 0:
            return
        depth, end = 1, start + 1
        while depth and end < len(css):
            if css[end] == '{':
                depth += 1
            elif css[end] == '}':
                depth -= 1
            end += 1
        header, body = css[pos:start].strip(), css[start + 1:end - 1]
        if header.startswith(('@media', '@supports', '@container')):
            yield from rules(body)
        elif not header.startswith('@'):
            yield header, body
        pos = end


def split_selectors(header):
    return re.split(r',\s*(?![^()]*\))', header)


def class_names(selector):
    return {name for name in CLASS.findall(selector) if not name.startswith('svelte-')}


def words(name):
    return re.findall(r'[a-z0-9]+', name.lower())


def protected(name):
    return bool(PROTECTED.search(name))


def named(name, roles):
    parts = words(name)
    return any(part in roles for part in parts) or any(name.lower().endswith(role) for role in roles)


def declarations(body):
    return {prop.lower(): value.strip() for prop, value in DECLARATION.findall(body)}


def subject_classes(selector):
    # Ancestor/state classes describe context, not the styled subject. Avoid
    # turning .nx-call-row's ancestors into white text just because a nested
    # action button happens to use a color in its own rule.
    parts = re.split(r'\s+|\s*[>+~]\s*', selector.strip())
    return class_names(parts[-1]) if parts else set()


def has_fill(props):
    for prop, value in props.items():
        if not prop.startswith('background') or value.strip().lower() in ('none', 'transparent'):
            continue
        for alpha in re.findall(r'rgba\([^)]*?,\s*([\d.]+)\s*\)', value, re.I):
            if float(alpha) <= .01:
                value = re.sub(r'rgba\([^)]*?\)', '', value, flags=re.I)
        if re.search(r'#[0-9a-f]{8}\b', value, re.I) and re.search(r'#[0-9a-f]{8}\b', value, re.I).group()[7:9].lower() in ('00', '01'):
            continue
        if re.search(r'#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\(|var\(|gradient\(', value, re.I):
            return True
    return False


def saturated_fill(props):
    for prop, value in props.items():
        if not prop.startswith('background'):
            continue
        tokens = re.findall(r'#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)', value, re.I)
        for token in tokens:
            if token.startswith('#'):
                raw = token[1:]
                if len(raw) == 3:
                    raw = ''.join(char * 2 for char in raw)
                rgb = [int(raw[i:i+2], 16) for i in (0, 2, 4)]
            else:
                rgb = [int(float(part)) for part in re.findall(r'[\d.]+', token)[:3]]
            if len(rgb) == 3 and max(rgb) - min(rgb) > 55 and max(rgb) > 75:
                return True
    return False


def has_state(name):
    return any(part in STATE_WORDS for part in words(name))


def source_styles(index):
    names = re.findall(r'href="\./duo/([^"?]+\.css)', index)
    paths = [ROOT / 'web/public/build/bundle.css']
    paths.extend(ROOT / 'web/public/duo' / name for name in names
                 if name not in ('appearance.css', 'legacy-icons.css', 'nui-safe.css'))
    return paths


def collect_roles(paths):
    roles = {'elevated': set(), 'grouped': set(), 'control': set(),
             'primary': set(), 'secondary': set(), 'ink': set()}
    for path in paths:
        if not path.exists():
            continue
        for header, body in rules(path.read_text(encoding='utf-8')):
            props = declarations(body)
            if not props:
                continue
            for selector in split_selectors(header):
                if selector.startswith(('html', 'body', ':root')) or any(
                    marker in selector.lower() for marker in ('wallpaper', 'camera', 'video-stage', 'duo-preview')
                ):
                    continue
                names = subject_classes(selector)
                if any(has_state(name) for name in names) or re.search(r':(?:hover|active|focus|disabled|checked|selected)(?:\b|\()', selector) or STATE_ATTRIBUTES.search(selector):
                    continue
                fill = has_fill(props)
                color = 'color' in props
                for name in names:
                    if protected(name):
                        continue
                    if has_state(name):
                        continue
                    if named(name, ELEVATED) and fill:
                        roles['elevated'].add(name)
                    elif named(name, GROUPED) and fill:
                        roles['grouped'].add(name)
                    elif named(name, CONTROL) and fill:
                        # Shared primitive names style many unrelated buttons,
                        # including icons, selected tabs, and branded actions.
                        if name.lower() not in ('pill', 'chip', 'segment', 'toggle', 'switch') and not saturated_fill(props) and not named(name, PRIMARY_ACTION):
                            roles['control'].add(name)
                    if color:
                        if named(name, PRIMARY_ACTION) and fill and saturated_fill(props):
                            roles['primary'].add(name)
                        elif named(name, SECONDARY_TEXT):
                            roles['secondary'].add(name)
                        elif not any(part in STATE_WORDS for part in words(name)):
                            roles['ink'].add(name)
    # A class can be used for more than one role in different applications. Keep
    # the strongest surface role, while action and text roles remain independent.
    roles['grouped'] -= roles['elevated']
    roles['control'] -= roles['grouped'] | roles['elevated']
    roles['ink'] -= roles['secondary'] | roles['primary']
    return roles


def grouped_rules(names, declarations_text, batch=72):
    names = sorted(names)
    chunks = [names[i:i + batch] for i in range(0, len(names), batch)]
    return '\n'.join(
        '#duo[data-theme] .duo-app-instance :is(' + ','.join('.' + n for n in chunk) +
        '){' + declarations_text + '}' for chunk in chunks
    )


def legacy_bridge(paths):
    roles = collect_roles(paths)
    chunks = [
        '/* Generated compatibility bridge. Change semantic roles in appearance-semantic.css. */',
        grouped_rules(roles['grouped'], 'background:var(--theme-grouped)!important;background-image:none!important;border-color:var(--theme-separator)!important;color:var(--theme-label)!important'),
        grouped_rules(roles['elevated'], 'background:var(--theme-elevated)!important;background-image:none!important;border-color:var(--theme-separator)!important;color:var(--theme-label)!important'),
        grouped_rules(roles['control'], 'background:var(--theme-control)!important;background-image:none!important;border-color:var(--theme-separator)!important;color:var(--theme-label)!important'),
        grouped_rules(roles['secondary'], 'color:var(--theme-secondary)!important;opacity:1!important'),
        grouped_rules(roles['ink'], 'color:var(--theme-label)!important'),
        grouped_rules(roles['primary'], 'color:var(--theme-on-accent)!important'),
    ]
    counts = ', '.join(f'{name}={len(values)}' for name, values in roles.items())
    return '\n'.join(part for part in chunks if part) + f'\n/* Discovered legacy classes: {counts}. */\n'


def main():
    index = (ROOT / 'web/public/index.html').read_text(encoding='utf-8')
    semantic = ROOT / 'web/public/duo/appearance-semantic.css'
    if not semantic.exists():
        raise SystemExit(f'Missing authored theme roles: {semantic}')
    bridge = legacy_bridge(source_styles(index))
    output = bridge + '\n' + semantic.read_text(encoding='utf-8').rstrip() + '\n'
    with (ROOT / 'web/public/duo/appearance.css').open('w', encoding='utf-8', newline='\n') as generated:
        generated.write(output)
    print(f'Generated appearance.css ({len(output):,} bytes) from semantic roles and {semantic.name}.')


if __name__ == '__main__':
    main()
