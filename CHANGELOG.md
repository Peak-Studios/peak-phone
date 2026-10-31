# Changelog

## 3.1.0 (2026-10-31)

### Changed
- **Redesigned lock screen** in the style of modern iOS: a glance with the date and a large clock, then swipe up, tap or type to open a passcode keypad. The keypad has round frosted keys with letters, filling dots, Delete and Cancel, a shake on a wrong passcode, and auto-submit at 6 digits. It has layouts for the folded, unfolded, portrait and landscape screens, and recovery and reset keep their own sheet.

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
