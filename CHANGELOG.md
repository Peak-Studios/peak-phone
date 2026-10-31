# Changelog

## 3.0.0: open-source release (2026-10-30)

Peak Duo is now free and open source under the GPL-3.0.

### Breaking changes
- The resource is renamed from `fw-phone` to **`peak-phone`**. All events (`fw-phone:*` → `peak-phone:*`), exports (`exports['fw-phone']` → `exports['peak-phone']`) and NUI routes changed. See [Upgrading from fw-phone](docs/installation.md#upgrading-from-fw-phone-peak-duo-2x).
- The internal framework compatibility object `FW` is now `Peak`.
- Cfx Asset Escrow configuration (`escrow_ignore`) has been removed; every file is open and editable.

### Added
- `LICENSE` (GPL-3.0), `THIRD_PARTY_NOTICES.md`, and a new documentation set in `docs/` with screenshots.
- Contribution guide, security policy and issue templates.

### Changed
- Removed internal development notes and historical upgrade documents.
- Test output now goes to `artifacts/` (git-ignored).
- Asset authoring scripts read tool paths from environment variables.
- The SQL contract test now understands runtime-created tables and more column types.

The database schema is unchanged from 2.1.0-duo.5, so existing phone data is kept.
