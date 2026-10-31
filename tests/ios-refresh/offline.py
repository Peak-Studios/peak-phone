"""Build an offline DOM fixture from the actual local UI; no web server or policy changes.
Browser checks use Playwright set_content. External requests are aborted by the test harness.
This representation is a browser preview, not a replacement FiveM index.html.
"""
from pathlib import Path
import base64, json, re, mimetypes
ROOT = Path(__file__).resolve().parents[2] / 'web/public'

def data(path):
    mime = 'text/javascript' if path.suffix in ('.mjs', '.js') else mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()

def offline_html(prelude=''):
    index = (ROOT / 'index.html').read_text()
    styles = re.findall(r'<style[^>]*>(.*?)</style>', index, flags=re.S)
    for src in re.findall(r'<link[^>]*href="([^"]+)"', index):
        path = (ROOT / src).resolve()
        if path.suffix != '.css':
            continue
        def embed(match):
            href = match[1].strip('\"\' ')
            if href.startswith(('data:', 'http')):
                return match[0]
            asset = (path.parent / href).resolve()
            return 'url("' + data(asset) + '")' if asset.is_file() else match[0]
        styles.append(re.sub(r'url\(([^)]+)\)', embed, path.read_text()))
    modules = {}
    for path in (ROOT / 'duo').glob('*.mjs'):
        text = re.sub(r"(['\"])\./([^'\"]+\.mjs)\1", lambda m: json.dumps('duo/' + m[2]), path.read_text())
        modules['duo/' + path.name] = 'data:text/javascript;base64,' + base64.b64encode(text.encode()).decode()
    scripts = ''.join('<script>' + (ROOT / f).read_text().replace('</script', '<\\/script') + '</script>' for f in ['duo/sanitize.js', 'duo/voice-notes.js', 'build/duo-legacy.js'])
    # Only standalone HTML references are inlined; production files and saved preference IDs are unchanged.
    assets = {str(path.relative_to(ROOT)): data(path) for path in (ROOT / 'images').rglob('*') if path.is_file() and path.suffix in ('.png', '.webp', '.svg')}
    image_helper = r'''const assets=ASSETS;const convert=()=>{for(const n of document.images){const src=n.getAttribute('src');if(!src||src.startsWith('data:'))continue;const key=src.replace(/^\.\//,'');if(assets[key])n.src=assets[key];}};new MutationObserver(convert).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});'''.replace('ASSETS', json.dumps(assets))
    return '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Peak Duo — iOS refresh preview</title>' + ''.join('<style>'+s+'</style>' for s in styles) + '<script type="importmap">' + json.dumps({'imports': modules}) + '</script><script>' + prelude + '</script></head><body>' + scripts + '<script>' + image_helper + '</script><script type="module">import "duo/shell.mjs";</script></body></html>'

if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser(description='Create a self-contained browser preview with synthetic fixtures.')
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    args.output.write_text(offline_html())
    print(args.output)
