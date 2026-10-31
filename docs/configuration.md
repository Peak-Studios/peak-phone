# Configuration

Peak Duo is configured through five Lua files. Restart `peak-phone` after changing any of them.

| File | Runs on | What it controls |
|---|---|---|
| [`shared/settings.lua`](../shared/settings.lua) | Server **and client** | Core behavior: items, keys, phone numbers, calls, video, money limits, media, social, jobs used by Services |
| [`sv_config.lua`](../sv_config.lua) | Server | Business networks, legacy gameplay data, and **`PhoneOwnerConfig`** (app branding and access) |
| [`config.lua`](../config.lua) | Server **and client** | Camera limits, speakerphone, crypto coins |
| [`jobs/settings.lua`](../jobs/settings.lua) | Server **and client** | Job Center and Job Creator limits |
| [`shared/kilogram-live.lua`](../shared/kilogram-live.lua) | Server **and client** | KiloGram live streams and gifts |

> [!CAUTION]
> Every client downloads `shared/settings.lua`, `config.lua`, `jobs/settings.lua` and `shared/kilogram-live.lua`. **Never put API keys or passwords in them.** Secrets go in `server.cfg` convars set with `set` (see [Secrets](#secrets-convars)).

## Core settings: `shared/settings.lua`

The most common options in `PhoneConfig`:

| Option | Default | Description |
|---|---|---|
| `Framework` | `'auto'` | `auto`, `qbcore`, `qbox` or `esx`. `auto` uses peak-bridge detection. |
| `RequirePhoneItem` | `true` | Players need the phone item to open the phone. |
| `PhoneItem` | `'phone'` | Inventory item name for the phone. |
| `SimItem` | `'simcard'` | Inventory item name for physical SIM cards. |
| `OpenKey` | `'M'` | Default key to open the phone (players can rebind it). |
| `AutoMigrate` | `true` | Create and upgrade the phone's own database tables on start. |
| `NumberPrefix` / `NumberDigits` | `'555'` / `7` | Format of generated phone numbers. |
| `MaxOwnedSIMs` | `5` | Maximum SIM cards per character. |
| `Devices` | see file | Max owned phones, PIN attempts and lockout, lending time, `InventoryMode` (`auto`, `unique`, `count`). |
| `DefaultApps` | see file | Optional apps preinstalled for new characters. Other optional apps are installed from the App Store. |
| `DefaultPreferences` | see file | Default wallpaper, ringtone and other client preferences. |
| `Ringtones.Custom` | `{}` | Extra ringtones: put audio files in `web/public/ringtones/` or use HTTPS URLs. |
| `VoiceResource` | `'pma-voice'` | Voice resource used for calls. |
| `CallRingSeconds` / `CallMaxSeconds` | `30` / `3600` | Ring timeout and maximum call length. |
| `Video` | see file | FaceTime resolution, FPS, bitrate, TURN requirement, `AudioMode` (`voice` or `webrtc`). See [video-calls.md](video-calls.md). |
| `Money` | see file | Maximum Wenmo transfer, crypto limits, bank account name. |
| `Media` | see file | Photo quota, upload cooldown, hosted media limits, and **`AllowedHosts`**: the HTTPS image hosts players may import from. |
| `Social` | see file | Enable or disable KiloGram and Binge, post and story limits, and the moderation ACE. |
| `YellowPages` | `48h`, `5` | Listing lifetime and maximum listings per character. |
| `NewsJobs`, `EmergencyJobs`, `TowJobs`, `DOJJobs` | see file | Framework job names that unlock News writing and appear in Services and DOJ. |
| `LegacyGameplay` | `true` | Enables gameplay apps that need external resources. These apps stay hidden behind a capability check until their provider is running. |
| `GarageAdapter` / `EnableVehicleSales` | `'none'` / `false` | Vehicle spawning and sales need a real garage adapter; see [integrations.md](integrations.md). |
| `Debug` | `false` | Extra console logging. |

### Example: change the phone item and open key

```lua
PhoneConfig.PhoneItem = 'smartphone'
PhoneConfig.OpenKey = 'F1'
```

### Example: allow your own image host

```lua
Media = {
    -- ...
    AllowedHosts = { 'i.imgur.com', 'r2.fivemanage.com', 'cdn.myserver.com' },
},
```

## Branding and app access: `PhoneOwnerConfig` in `sv_config.lua`

`PhoneOwnerConfig` changes how the phone looks to your players without code changes. The server validates the values at startup and sends only clean, plain-text values to clients.

```lua
PhoneOwnerConfig = {
    Apps = {
        Labels = { maps = 'City Map', services = 'Public Services' },   -- rename apps
        Icons  = { maps = 'navigation', services = 'shield' },          -- bundled icon names
        Defaults = {                                                     -- first-time Home layout
            Order = { 'calls', 'messages', 'maps', 'settings' },
            Dock  = { 'calls', 'messages', 'mails', 'contacts' },        -- up to 4
        },
        JobAccess = {                                                    -- server-enforced job allowlist
            services   = { 'police', 'ambulance' },
            jobcreator = { 'admin' },
        },
        Hidden = { 'crypto' },                                           -- hide and block apps for everyone
    },
    Maps = {
        Places = {                                                       -- replaces the starter places
            { id = 'hospital', name = 'Pillbox Hospital', area = 'Pillbox Hill', category = 'Services', x = 307.2, y = -595.3 },
        },
    },
    Networks = { Labels = { pdm = 'Premium Deluxe' } },
    Services = { Title = 'Public Services', Subtitle = 'People on duty', JobLabels = { bcso = 'County Sheriff' } },
    News = { Title = 'City News', Tagline = 'Reporting from around town.' },
    Store = { Title = 'City App Store', FeaturedApp = 'peakify', FeaturedTitle = 'Peak Music' },
}
```

Notes:

- Keys are **app IDs**. These settings rename and curate the existing apps; they can't add new ones (see [integrations.md](integrations.md) for that). App IDs: `calls`, `messages`, `mails`, `contacts`, `gallery`, `camera`, `peakify`, `documents`, `settings`, `maps`, `calendar`, `clock`, `weather`, `voicememos`, `homeedit`, `details`, `store`, `services`, `crypto`, `housing`, `y`, `kilogram`, `binge`, `wenmo`, `vehicles`, `jobcenter`, `jobcreator`, `busdriver`, `lumberjack`, `bin`, `calculator`, `yellowpages`, `racing`, `time-trials`, `cars`, `facetime`, `guber`, `bankbusters`.
- Icon names must be bundled glyph names, such as `phone`, `message-circle`, `shield`, `wallet`, `mail`, `users`, `camera`, `music`, `notebook`, `settings`, `navigation`, `timer`, `weather`, `id-card`, `app-store`, `home`, `briefcase`, `car` and `globe`. Remote icons or HTML are rejected.
- `Defaults` applies only to characters who don't have a saved Home layout yet.
- `JobAccess` is checked on the server for every request the app makes, not just in the UI.
- Map coordinates are **GTA world coordinates** (`x`, `y`), not latitude and longitude.

## Job Center: `jobs/settings.lua`

The Job Center runs group contracts (lobbies, steps, check-ins, rewards). Players with permission build these contracts in the **Job Creator** app.

| Option | Default | Description |
|---|---|---|
| `Enabled` | `true` | Turn the Job Center on or off. |
| `AdminAce` | `'peak.phone.jobs'` | ACE that grants Job Creator access. |
| `AllowFrameworkAdmins` | `true` | Framework admins can also use the Job Creator. |
| `MaxGroupSize` | `8` | Players per group. |
| `MaxRewardPerMember` | `10000` | Upper bound for any contract reward. |
| `CooldownSeconds` | `120` | Cooldown between contracts. |
| `ShowHubBlips` / `SpawnHubPeds` | `false` / `true` | Map blips and peds at job hubs. |

The default contracts are in `jobs/defaults.json`.

## KiloGram live: `shared/kilogram-live.lua`

Controls live streams (number of streams and viewers, duration, quality) and the gifting economy (coin packs bought with bank money). Live streaming reuses the TURN settings from [video-calls.md](video-calls.md). Each viewer uses some of the streamer's upload bandwidth, so keep `MaxViewers` modest.

## Camera, speaker and crypto: `config.lua`

- `Config.Camera`: field of view and look limits for the normal, vehicle and selfie cameras.
- `Config.Speaker*`: speakerphone volume and proximity range.
- `Config.Crypto`: the in-game (fictional) coins shown in the Crypto app.

## Secrets (convars)

Put these in `server.cfg` with **`set`**, never `setr` or `sets`:

| Convar | Used for |
|---|---|
| `phone_media_api_key` | FiveManage API key for photo and video uploads |
| `phone_turn_provider` | `cloudflare` or `coturn` |
| `phone_turn_key_id`, `phone_turn_api_token` | Cloudflare TURN credentials |
| `phone_turn_shared_secret`, `phone_turn_urls` | coturn shared secret and server URLs |

## Permissions (ACE)

| ACE | Grants |
|---|---|
| `peak.phone.admin` | Admin tools, including `phone_doctor` from in game |
| `peak.phone.jobs` | Job Creator access |
| `peak-phone.social.admin` | Social moderation (configurable with `PhoneConfig.Social.ModerationAce`) |
| `peakduo.calibrate` | The `duoprop_*` prop calibration commands |

```cfg
add_ace group.admin peak.phone.admin allow
add_ace group.admin peak.phone.jobs allow
add_ace group.admin peak-phone.social.admin allow
```

## Commands and keys

| Command / key | Who | Description |
|---|---|---|
| <kbd>M</kbd> / `/phone` | Players | Open or close the phone |
| <kbd>E</kbd> | Players | Fold or unfold (while the phone is open) |
| <kbd>F6</kbd> / <kbd>Left Alt</kbd> (`phoneinput`) | Players | Switch between the phone cursor and walking/driving with the phone open |
| `/phonesim` | Players | Explains where to switch SIMs (Settings → SIM) |
| `phone_doctor` | Server console / admins | Diagnostics report |
| `phone_social reports\|suspend\|restore\|resolve <id>` | Console / moderation ACE | Social moderation queue and actions |
| `phone_live stop <streamId>` | Console / moderation ACE | End a KiloGram live stream |
| `clearyp` | Console / admins | Delete all Yellow Pages listings |
| `duoprop_calibrate`, `duoprop_offset`, `duoprop_angle`, `duoprop_screen`, `duoprop_done` | `peakduo.calibrate` | Adjust the in-hand prop position for custom setups |
