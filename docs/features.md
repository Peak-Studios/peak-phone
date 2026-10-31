# Features

Each app's behavior and requirements. "Built in" means the app works with only the [required dependencies](installation.md#2-dependencies).

## The phone itself

| Feature | Details |
|---|---|
| **Foldable display** | Cover screen when folded; wide inner display when unfolded (<kbd>E</kbd>). Open apps and unsaved drafts survive a fold. |
| **Split View** | Two apps side by side with a resizable divider. Swap panes, go full screen, or pick apps from the Display menu. |
| **Orientation** | Portrait and landscape on the unfolded display. |
| **App Switcher and gestures** | Recent apps, swipe home, page dots, and smooth app transitions. |
| **Home Screen** | Several pages, a dock with up to 4 apps, and long-press editing to move or remove apps. The **Home Screen** app edits the layout. |
| **Appearance** | Light and dark mode, Reduce Motion and Reduce Transparency, wallpapers, and text and contrast tuning. |
| **Control Center** | Now Playing controls, Do Not Disturb and Focus, Flashlight, Dark Mode, ShareDrop, connectivity, and Camera and Calculator shortcuts. |
| **Lock screen** | Per-device PIN with an attempt limit and timed lockout. |
| **Notifications** | Banners and a notification list, per-app unread badges, and per-app settings. |
| **Ringtones** | Built-in tones plus your own (`PhoneConfig.Ringtones.Custom`). |
| **Hardware buttons** | Power, volume and side buttons on the 3D prop and in the UI. |
| **3D prop** | The custom Peak Duo handset (`peak-duo-prop`) with fold and unfold animations for male and female freemode peds. Other peds use a neutral phone pose. |
| **Physical devices** | With a metadata inventory, each `phone` item is a unique device with its own owner, PIN and inserted SIM. Phones can be lent out, and broken phones can be detected. |
| **SIM cards** | A character can own several numbers (default limit 5). Insert, swap or remove physical `simcard` items from **Settings → SIM**, with a SIM-tray animation. |

## Apps

### Communication

| App | Built in | Details |
|---|---|---|
| **Phone** | Needs `pma-voice` | Server-controlled calls, recents and missed calls, contacts, a full keypad, speakerphone, busy, decline and timeout handling. |
| **FaceTime** | Needs TURN + `pma-voice` | Video calls that stream the **game camera** (front or rear) over WebRTC, not a webcam. Audio goes through `pma-voice` by default. See [video-calls.md](video-calls.md). |
| **Messages** | ✅ | Direct and group chats, read receipts, reactions, replies, images, and voice notes (WebM/Opus, 15 s). |
| **Mail** | ✅ | Inbox, compose, read state and delete. Other resources can send mail through the server API. In-city mail only, not real email. |
| **Contacts** | ✅ | Save, edit and favourite contacts; share contacts with nearby players. |
| **ShareDrop** | ✅ | AirDrop-style sharing of photos, contacts, locations and documents with nearby players, with a hand animation. |

### Social (fictional in-city networks)

| App | Built in | Details |
|---|---|---|
| **Y** | ✅ | X-style feed: posts with up to 4 images, replies, quotes, reposts, likes, follows, notifications, bookmarks, drafts, profiles and moderation reports. |
| **KiloGram** | ✅ (live needs TURN) | Photo posts, stories, comments, direct messages, profiles, live streams with comments, and coin **gifts** bought with bank money. |
| **Binge** | ✅ | Dating-style profiles, likes and matches. |

### Utilities

| App | Built in | Details |
|---|---|---|
| **Maps** | ✅ | GTA V atlas map, search, coordinates, saved places, waypoints, and **Find My** (see friends who share their location, with expiry and revoking). |
| **Weather** | ✅ | The real in-game weather and wind, plus a forecast. |
| **Clock** | ✅ | World clock, alarms, stopwatch and timers. |
| **Notes** | ✅ | Folders, checklists, rich text, signing and sharing documents with nearby players. |
| **Calendar** | ✅ | A personal calendar stored on the device. |
| **Calculator** | ✅ | Standard and scientific modes, with history. |
| **Voice Memos** | ✅ | Record, play, rename and share voice memos. |
| **Photos + Camera** | Needs `screenshot-basic` + FiveManage | Photos, selfies and in-vehicle camera; video recording on the device; albums; HTTPS image import from allowed hosts. |
| **Peak Music** | ✅ (in-world audio needs `xsound`) | Search and stream the free [Audius](https://audius.co) catalog, playlists, and playing music in the world from a boombox. |
| **Settings** | ✅ | Display and appearance, sounds, notifications, SIM, device PIN, wallpapers and accessibility. |
| **App Store** | ✅ | Install and remove optional apps. |
| **My card** | ✅ | Character details, job and supported licenses. |

### Economy and city life

| App | Built in | Details |
|---|---|---|
| **Wenmo** | ✅ | Bank transfers to online players by phone number, with history. Each transfer is recorded in a journal, so a crash can't pay out twice. Use `phone_doctor` to see unresolved transfers. |
| **Crypto** | ✅ | Fictional in-game coins (`Config.Crypto`) bought with bank money. Not real cryptocurrency. |
| **Yellow Pages** | ✅ | Classified listings with categories and images; they expire after 48 hours by default. |
| **Services** | ✅ | Directory of on-duty emergency, tow and other jobs (configurable). |
| **News / Binsbergen** | ✅ | Two article networks; reporters (`NewsJobs`) can write and edit. |
| **DOJ** | ✅ | Availability of judges and lawyers (`DOJJobs`). |
| **Pinger** | ✅ | Ask another player for their location; they must accept. |
| **Job Center** | ✅ | Group contracts with lobbies, step-by-step tasks, check-ins and rewards paid through the framework bank. |
| **Job Creator** | ✅ (permission) | Build and edit Job Center contracts in game, with revisions and an audit history (`peak.phone.jobs`). |
| **Vehicles** | ✅ list + track | Lists owned vehicles from the framework tables and tracks live vehicles. Spawning and selling need a [garage adapter](integrations.md#garage-and-news-hooks). |

### Apps that need extra gameplay resources

These apps come from the original Peak Studios server stack. Each one stays hidden behind a **capability check** until a resource that provides its data is running. To use one, either run a matching resource or write an adapter (see [integrations.md](integrations.md)).

| App | Needs |
|---|---|
| Housing | A housing provider (`peak-housing`) |
| Employment | A business provider (`peak-businesses`, `peak-financials`) |
| Bus Driver | `peak-busdriver` or an adapter |
| Lumberjack | `peak-lumberjack` or an adapter |
| Racing, Time Trials | `peak-racing` or an adapter |
| Showroom (Cars) | `peak-businesses` + `peak-vehicles` or an adapter |
| Guber | `peak-guber` or an adapter |
| BankBusters, TierUp | `peak-heists` or an adapter |
| Debt | `peak-misc` or an adapter |

## Known limitations

- **Payphones** aren't implemented (the settings in `config.lua` are unused).
- **FaceTime and KiloGram live** depend on the player's GPU and FiveM's browser (CEF) support for capturing the game view, and on a working TURN relay.
- **Count-only inventories** (no metadata) can't track unique phones and SIMs.
- Music comes from a public third-party catalog (Audius); availability isn't guaranteed and no music rights are included.
- The phone uses its own tables for phone numbers. Other resources that read `charinfo.phone` from the framework should use the [phone number exports](integrations.md#phone-number-and-sim-api) instead.
