# Troubleshooting

Start every investigation with **`phone_doctor`** in the server console, then check the server console and the client F8 console for errors.

## The phone doesn't open

| Symptom | Fix |
|---|---|
| Nothing happens when I press M | The player probably bound M to something else earlier. Try `/phone`, or rebind under **Settings → Key Bindings → FiveM**. |
| "You don't have a phone" | Give the `phone` item, or check that `PhoneConfig.PhoneItem` matches your inventory's item name. |
| Error: `peak-bridge is not ready` | Start `peak-bridge` **after** your framework and inventory, and before `peak-phone`. |
| Error: `PhoneConfig.Framework does not match peak-bridge` | Set `PhoneConfig.Framework = 'auto'` or the correct framework. |
| The phone opens to a blank or transparent screen | Make sure the folder is named exactly `peak-phone`, then clear the FiveM cache (`%localappdata%/FiveM/FiveM.app/data/cache`) and reconnect. |
| Console says a dependency is missing | Install and `ensure` `peak-duo-prop` and `peak-sim-assets` (from `extras/`) **before** `peak-phone`. |

## Database

| Symptom | Fix |
|---|---|
| `Phone database initialization timed out` | `oxmysql` isn't connected. Check `mysql_connection_string`. |
| Errors about `CREATE` or `ALTER` permissions | Grant the database user `CREATE`, `ALTER` and `INDEX`, or import the SQL manually ([database.md](database.md)). |
| A required column or index is missing | Run with `AutoMigrate = true` once, or apply the changes from `bridge/schema.lua`. |

## Calls and video

| Symptom | Fix |
|---|---|
| A call connects but nobody hears anything | `pma-voice` must be started with `setr voice_enableCalls 1`. Run only one voice resource. |
| FaceTime says "TURN relay unavailable" | Configure TURN ([video-calls.md](video-calls.md)) and check the TURN line in `phone_doctor`. |
| Video stays black or blue | The player's GPU or FiveM browser can't capture the game view. Update the GPU driver and FiveM. Check F8 for WebRTC errors. |
| Video works on LAN but not for remote players | Open the TURN server's firewall ports, or check your Cloudflare TURN token. |

## Photos and media

| Symptom | Fix |
|---|---|
| The camera can't take photos | Start `screenshot-basic` and set `phone_media_api_key` with `set` (not `setr`). |
| Pasted image links are rejected | Only HTTPS links from `PhoneConfig.Media.AllowedHosts` are accepted. Add your host there. |
| Music won't play in the world | Start `xsound`. Some Audius tracks can be unavailable. |

## Money

| Symptom | Fix |
|---|---|
| A Wenmo transfer is "pending" or uncertain | `phone_doctor` lists unresolved operations. Compare them with your framework's bank history before taking any action; don't retry them blindly. |
| Transfers fail with "recipient offline" | Wenmo only sends to online players. |

## Apps show "needs …" or are missing

Apps such as Housing, Racing, Guber or BankBusters need extra gameplay resources (see [features.md](features.md#apps-that-need-extra-gameplay-resources)). Until a provider is running, they stay hidden or show a message that explains what's missing.

## Still stuck?

Open an [issue](https://github.com/Peak-Studios/peak-phone/issues/new/choose) and include:

- your framework and version, inventory and `peak-bridge` version
- your FiveM server artifact number
- the full `phone_doctor` output
- the relevant server console and F8 errors
