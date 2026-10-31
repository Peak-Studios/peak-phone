"""Escape closes the visible phone from an app or focused field in Chromium."""
from pathlib import Path
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent / "ios-refresh"))
from offline import offline_html

ROOT = Path(__file__).resolve().parents[1]
CHROMIUM = os.environ.get("CHROMIUM_BIN") or next(
    (str(path) for path in (
        Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
        Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
        Path("/usr/bin/chromium"),
    ) if path.exists()),
    None,
)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=CHROMIUM, headless=True)
    page = browser.new_page()
    page.route("**/*", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.set_content(offline_html())
    page.wait_for_function("window.PeakDuo && document.documentElement.dataset.duoReady === 'true'")
    page.evaluate("PeakDuo.openApp('calculator')")
    page.keyboard.press("Escape")
    assert not page.evaluate("PeakDuo.getState().visible"), "Escape must close from an app"

    page.evaluate("() => window.postMessage(window.PeakDuo.previewAdapter.previewOpen())")
    page.wait_for_function("PeakDuo.getState().visible")
    page.locator(".duo-search input").first.focus()
    page.keyboard.press("Escape")
    assert not page.evaluate("PeakDuo.getState().visible"), "Escape must close from a focused field"
    assert not errors, errors
    browser.close()

print("PASS Escape closes phone from app and focused field")
