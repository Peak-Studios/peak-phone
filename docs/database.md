# Database

Peak Duo stores its data in its own tables through `oxmysql`. It **never** changes your framework's tables (players, users, owned vehicles and so on); it only reads them where needed.

Recommended: MySQL 8 or MariaDB 10.6+, InnoDB, `utf8mb4`.

## Automatic setup (default)

With `PhoneConfig.AutoMigrate = true` (in `shared/settings.lua`), the phone does this on every start:

1. Runs [`sql/portable.sql`](../sql/portable.sql) and [`sql/social.sql`](../sql/social.sql) to create any missing tables.
2. Runs [`bridge/schema.lua`](../bridge/schema.lua) to add new columns, widen old identifier columns and create indexes when upgrading from older versions.
3. Runs [`jobs/schema.sql`](../jobs/schema.sql) for the Job Center tables.
4. Creates the KiloGram live tables (`peak_phone_kilogram_wallets`, `peak_phone_kilogram_gift_ledger`) from `server/sv_kilogram_live.lua`.

The first start needs a database user with `CREATE`, `ALTER` and `INDEX` permissions. Nothing is ever dropped or truncated, but `ALTER TABLE` can briefly lock a large table, so **back up first**.

If a required table, column or index is still missing after this, the phone stops with an error in the console instead of running with a broken schema.

## Manual setup

If your database user can't run DDL:

1. Set `AutoMigrate = false`.
2. Import these three files, in this order: `sql/portable.sql`, `sql/social.sql`, `jobs/schema.sql`.
3. When upgrading an **existing** database, also apply the column and index changes listed in `bridge/schema.lua`. The `.sql` files only create missing tables; they don't upgrade existing ones.

## Tables

**Core** (`sql/portable.sql`): `peak_phone_schema`, `peak_phone_characters`, `phone_profiles`, `phone_installed_apps`, `peak_phone_backups`, `sim_cards`, `peak_phone_devices`, `peak_phone_device_access`, `peak_phone_device_sessions`, `phone_contacts`, `peak_phone_location_shares`, `phone_calls`, `phone_messages`, `phone_message_reactions`, `phone_conversation_preferences`, `phone_groups`, `phone_group_members`, `phone_group_messages`, `phone_group_read_status`, `phone_group_message_reactions`, `phone_mails`, `phone_documents`, `phone_newsarticles`, `phone_photos`, `peak_phone_media`, `peak_phone_media_references`, `peak_phone_voice_memos`, `phone_wenmo`, `phone_cash_requests`, `phone_cash_events`, `peak_phone_ledger`, `peak_phone_y_posts`, `peak_phone_y_reactions`, `peak_phone_y_notifications`, `peak_phone_y_reports`, `peak_phone_y_moderation_audit`, `player_twitter_profiles`, `player_twitter_premium`, `player_twitter_follows`, `phone_tierup`, `phone_peakify_tracks`, `phone_peakify_playlists`, `phone_peakify_playlist_tracks`, `phone_peakify_playlist_collaborators`.

**Social** (`sql/social.sql`): `peak_phone_social_profiles`, `peak_phone_social_posts`, `peak_phone_social_highlights`, `peak_phone_social_highlight_stories`, `peak_phone_social_likes`, `peak_phone_social_saves`, `peak_phone_social_follows`, `peak_phone_social_comments`, `peak_phone_social_swipes`, `peak_phone_social_matches`, `peak_phone_social_messages`, `peak_phone_social_blocks`, `peak_phone_social_activity`, `peak_phone_social_reports`, `peak_phone_yellowpages`.

**Jobs** (`jobs/schema.sql`): `peak_phone_jobs`, `peak_phone_job_audit`, `peak_phone_job_rewards`.

**KiloGram live** (created at runtime): `peak_phone_kilogram_wallets`, `peak_phone_kilogram_gift_ledger`.

## Character identity

| Framework | Identifier stored |
|---|---|
| QBCore / Qbox | `citizenid` |
| ESX Legacy | The full character identifier, including the multicharacter prefix (for example `char1:...`) |

When a character first uses the phone, it gets a phone number, either generated or imported from an existing framework number or owned SIM when one exists.

## Money

Wenmo, Crypto, KiloGram coin purchases, Y premium and Job Center rewards move money through your framework's **bank** account via `peak-bridge`. Bank operations are written to a journal first (`peak_phone_ledger`, or `peak_phone_job_rewards` for the Job Center), so a crash or restart can't pay out twice. If a transfer ends in an unknown state, `phone_doctor` lists it. Check it against your bank history and **don't retry it automatically**.

## Backup and rollback

- Back up the whole database before installing or upgrading.
- To roll back, stop `peak-phone`, put back the previous resource folder, and restore the matching database backup.
- Wenmo and bank operations aren't in the same transaction as your framework's bank. After restoring a backup, compare `peak_phone_ledger` with your bank history.

## Uninstall

To remove all phone data, drop the tables listed above. **This can't be undone.** `sim_cards` and `phone_*` table names are generic, so make sure another resource isn't using them before you drop them.
