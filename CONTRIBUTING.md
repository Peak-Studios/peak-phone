# Contributing to Peak Duo

Thanks for helping. Peak Duo is maintained by the community on a best-effort basis, so clear and well-tested contributions are the best way to get things merged.

## Reporting bugs

Use the [bug report template](https://github.com/Peak-Studios/peak-phone/issues/new/choose) and include:

- framework (QBCore / Qbox / ESX) and version, inventory, and `peak-bridge` version
- FiveM server artifact number
- full `phone_doctor` output
- server console and F8 errors, plus steps to reproduce

Please search existing issues first. Report security problems privately (see [SECURITY.md](SECURITY.md)), not in a public issue.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep each PR focused on one fix or feature.
3. Follow the existing style. Lua and JavaScript are compact and dependency-free; the UI is plain ES modules in `web/public/duo/`.
4. **Validate everything on the server.** Never trust NUI or client input for money, items, ownership, jobs or distance.
5. Never commit secrets. API keys belong in `server.cfg` convars set with `set`.
6. Run the checks:

   ```sh
   npm test
   npm run test:lua
   npm run build          # only if you changed web/legacy
   npm run manifest:write # if you changed runtime files
   npm run verify
   ```

7. Describe what you tested in game, and with which framework.

See [docs/development.md](docs/development.md) for the architecture and the browser preview.

## License

By contributing, you agree that your contributions are licensed under the [GPL-3.0](LICENSE) license of this project.
