"""Fail CI for measured, enabled text contrast regressions; retain exclusions."""
from pathlib import Path
import json, os

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('APPEARANCE_OUT', str(ROOT/'artifacts/ios-theme-redesign')))
cases = json.loads((OUT/'contrast.json').read_text()) + json.loads((OUT/'states.json').read_text())
failures = [{ 'theme': case['theme'], 'app': case['app'], 'action': case.get('action'), **failure }
            for case in cases for failure in case['failures'] if not failure['disabled']]
summary = {
    'cases': len(cases),
    'measured': sum(case['measured'] for case in cases),
    'unmeasured': sum(len(case['unmeasured']) for case in cases),
    'failures': failures,
    'limits': 'Solid CSS surfaces only. Image, gradient, opacity and sibling-backed text require visual review; input values/placeholders and icon paths are not measured.'
}
(OUT/'contrast-summary.json').write_text(json.dumps(summary, indent=2))
assert summary['measured'] >= 500, 'Contrast audit coverage unexpectedly low'
assert not failures, json.dumps(failures, ensure_ascii=True, indent=2)
print('PASS:', summary['measured'], 'enabled solid-surface text checks across', len(cases), 'cases;', summary['unmeasured'], 'text instances require visual review')
