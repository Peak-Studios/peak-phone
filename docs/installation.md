# Installation

This guide installs Peak Duo on a new server or one that already runs a phone resource. Do the install on a **staging server** first.

## 1. Before you start

- Back up your **database** and confirm you can restore it. On first start, the phone creates and upgrades its own tables.
- Back up your current phone resource and `server.cfg`.
- Run only **one** phone resource. Stop and remove any other phone that uses the same `phone` item (lb-phone, qb-phone, gksphone and so on).

## 2. Dependencies

Install and start these **before** the phone:

| Resource | Why |
|---|---|
| OneSync (`set onesync on`) | Required |
| [`ox_lib`](https://github.com/overextended/ox_lib) | Shared utilities |
| [`oxmysql`](https://github.com/overextended/oxmysql) | Database |
| Your framework: `qb-core`, `qbx_core` or `es_extended` | Identity, jobs, money |
| Your inventory | The `phone` and `simcard` items |
| [`peak-bridge`](https://github.com/Peak-Studios/peak-bridge) | Connects the phone to your framework, inventory and bank |
| [`pma-voice`](https://github.com/AvarianKnight/pma-voice) | Voice calls and FaceTime audio |

Optional extras:

| Resource | Enables |
|---|---|
| `screenshot-basic` + a FiveManage API key | Taking photos with the Camera and uploading them |
| `xsound` | Music playing in the world (boombox) |
| A TURN service | FaceTime video calls; see [video-calls.md](video-calls.md) |

## 3. Get the files

Download the latest release from the [Releases page](https://github.com/Peak-Studios/peak-phone/releases), or clone the repository:

```sh
git clone https://github.com/Peak-Studios/peak-phone.git
```

Put **three** resources in your server's `resources` folder:

```text
resources/
├── peak-phone/        <- this repository (folder name must be exactly "peak-phone")
├── peak-duo-prop/     <- copy of peak-phone/extras/peak-duo-prop
└── peak-sim-assets/   <- copy of peak-phone/extras/peak-sim-assets
```

You can delete the `tests/`, `tools/`, `docs/` and `extras/` folders from your **server copy** of `peak-phone`. They aren't loaded at runtime.

> [!IMPORTANT]
> Events, exports and NUI callbacks use the resource name `peak-phone`. If you rename the folder, the phone breaks.

## 4. Inventory items

The phone needs an item called `phone` (change it with `PhoneConfig.PhoneItem` in `shared/settings.lua`). Physical SIM cards use `simcard`.

| Inventory | Example file |
|---|---|
| ox_inventory | [`config-examples/ox-items.lua`](../config-examples/ox-items.lua) |
| qb-inventory / QBCore shared items | [`config-examples/qb-items.lua`](../config-examples/qb-items.lua) |
| ESX (database items) | [`config-examples/esx-items.sql`](../config-examples/esx-items.sql) |

An item image for the SIM card is in `config-examples/images/simcard.png`.

Unique phones (each with its own PIN, owner and SIM) need an inventory that supports **item metadata**. Without metadata the phone runs in count-only compatibility mode: phones still work, but physical device and SIM ownership is not tracked. See `PhoneConfig.Devices.InventoryMode`.

## 5. server.cfg

Merge the following into your **existing** `server.cfg`. Don't replace the whole file. A commented version is in [`config-examples/server.cfg`](../config-examples/server.cfg).

```cfg
# Framework + inventory first (already in your config)
ensure ox_lib
ensure oxmysql
# ensure qb-core / qbx_core / es_extended
# ensure your-inventory
ensure peak-bridge

setr voice_enableCalls 1
ensure pma-voice

ensure peak-duo-prop
ensure peak-sim-assets
ensure peak-phone

# Optional: camera uploads
# ensure screenshot-basic
# set phone_media_api_key "YOUR_FIVEMANAGE_API_KEY"

# Optional: allow admins to use the Job Creator
# add_ace group.admin peak.phone.jobs allow
```

> [!WARNING]
> Put API keys and secrets in convars set with **`set`**, never `setr` or `sets`. `setr` and `sets` values are sent to every client.

## 6. First start

1. Start the server. With `AutoMigrate = true` (the default), the phone creates its tables. The first start needs a database user with `CREATE` and `ALTER` permissions.
2. In the **server console**, run:

   ```text
   phone_doctor
   ```

   It reports the version, database status, detected framework, dependency states (`ox_lib`, `oxmysql`, `peak-bridge`, voice, `xsound`, `screenshot-basic`), unresolved Wenmo transfers, Job Center status and TURN configuration.
3. Join the server and give your character a `phone` item with your usual admin command.
4. Press <kbd>M</kbd> (or type `/phone`) to open the phone, and <kbd>E</kbd> to fold or unfold it. <kbd>F6</kbd> or <kbd>Left Alt</kbd> switches between the phone cursor and game controls while the phone is open.

> Players who already used <kbd>M</kbd> for something else keep their own key binding. They can change it in **Settings → Key Bindings → FiveM** in the pause menu.

## 7. Recommended checks

Before you open the phone to players, test with **two** characters:

- [ ] Each character gets a phone number; calls connect, both sides hear audio, and both can hang up
- [ ] Messages arrive in real time; group chats work
- [ ] Wenmo transfers move bank money and both sides see them
- [ ] Photos work (if you set up `screenshot-basic` and FiveManage)
- [ ] A video call connects (if you set up TURN)
- [ ] Restarting `peak-phone` while players are online doesn't cause errors in F8 or the server console

## Upgrading from `fw-phone` (Peak Duo 2.x)

Version 3.0.0 renames the resource from `fw-phone` to `peak-phone`. All events (`fw-phone:*` → `peak-phone:*`) and exports (`exports['fw-phone']` → `exports['peak-phone']`) changed with it.

1. Back up the database, the old `fw-phone` folder and `server.cfg`.
2. Stop `fw-phone`, delete its folder, and install `peak-phone` as described above.
3. In `server.cfg`, replace `ensure fw-phone` with `ensure peak-phone`.
4. Copy your settings from the old `config.lua`, `sv_config.lua`, `shared/settings.lua` and `jobs/settings.lua` into the new files. Don't copy the old files over the new ones.
5. Search your other resources for `fw-phone` and change them to `peak-phone`.

Database table names didn't change, so your existing phone data carries over. Client-side settings saved on players' PCs (wallpaper, Home layout) are stored under the new resource name, so players start with the defaults.

## Uninstalling

Stop and remove the three resources. The phone's database tables stay in place. Before you drop them, see [database.md](database.md) for the full list.
