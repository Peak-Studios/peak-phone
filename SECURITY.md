# Security policy

## Reporting a vulnerability

Please **don't** open a public issue for security problems, such as exploits that give money or items, run code on other clients, leak secrets, or bypass permissions.

Report them privately through GitHub: open the repository's **Security** tab and choose **[Report a vulnerability](https://github.com/Peak-Studios/peak-phone/security/advisories/new)**.

Include the affected version, the steps to reproduce, and the impact. This is a volunteer-maintained project, so response times aren't guaranteed, but valid reports will be fixed and credited.

## Supported versions

Only the latest release on `main` gets security fixes.

## Hardening tips for server owners

- Keep secrets (`phone_media_api_key`, TURN keys) in `set` convars, never `setr` or `sets`, and never in Lua config files.
- Keep `PhoneConfig.Video.RelayOnly = true` so player IP addresses aren't exposed in video calls.
- Restrict `PhoneConfig.Media.AllowedHosts` to image hosts you trust.
- Give `peak.phone.admin`, `peak.phone.jobs` and the social moderation ACE only to trusted staff.
