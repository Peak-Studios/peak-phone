# Tests

See [docs/development.md](../docs/development.md#tests) for how to run the suites.

- `*.test.mjs` and folders with `*.test.mjs`: Node `node:test` suites (run by `npm test`).
- `portable/`: Lua cases run against mocked FiveM natives (`lua_runner.py`), plus SQL contract checks and browser checks for the backend flows.
- `*/browser.py` and `browser_*.py`: Playwright tests against the local preview (`npm run preview`).
- `contracts/`: fixtures the tests compare against: the runtime integrity manifest, recorded NUI routes, the legacy icon baseline and the integration inventory.

All of these use mocks or the browser preview. They don't replace testing on a real FXServer with your framework, database and two connected players.
