# Video calls (FaceTime) and live streams

FaceTime and KiloGram live stream **the game camera**, not a webcam or the desktop. Video is sent peer-to-peer over WebRTC through a **TURN relay**, so players' IP addresses stay hidden from each other. The FiveM server only authorizes the call and passes small signaling messages; it never relays video frames.

```text
GTA script camera (front / rear)
  → FiveM shared game-render texture
  → canvas capture → WebRTC video track
  → TURN relay
  → the other player's phone
```

By default, call audio goes through **`pma-voice`** (`PhoneConfig.Video.AudioMode = 'voice'`), so FiveM never asks for microphone permission. If you set `AudioMode = 'webrtc'`, audio goes over WebRTC instead, and players must allow microphone access in FiveM.

You need **one** TURN provider. Pick either option below.

## Option A: Cloudflare Realtime TURN (easiest)

1. In the Cloudflare dashboard, open **Realtime → TURN Server** and create a TURN key.
2. Copy the **Token ID** and **API token**.
3. Add them to `server.cfg` with `set`, **never `setr` or `sets`**:

   ```cfg
   set phone_turn_provider "cloudflare"
   set phone_turn_key_id "YOUR_TURN_TOKEN_ID"
   set phone_turn_api_token "YOUR_TURN_API_TOKEN"
   ```

4. Restart and run `phone_doctor`. The TURN line should say `configured`.

The server requests short-lived credentials from Cloudflare for each call and revokes them when the call ends. The API token never leaves the server. Cloudflare charges for relay bandwidth beyond its free allowance; check their pricing.

## Option B: Self-hosted coturn

1. Install [coturn](https://github.com/coturn/coturn) on a server with a public IP and a domain name (for example `turn.example.com`).
2. Get a TLS certificate (Let's Encrypt works).
3. Start from [`config-examples/turnserver.conf.example`](../config-examples/turnserver.conf.example). Set your domain, certificate paths and a long **random** `static-auth-secret`. The example already blocks relaying to private networks.
4. Open the firewall ports: `3478` (UDP/TCP), `5349` (TCP), and the relay range `49160-49260` (UDP).
5. Add this to `server.cfg`:

   ```cfg
   set phone_turn_provider "coturn"
   set phone_turn_shared_secret "THE_SAME_SECRET_AS_static-auth-secret"
   set phone_turn_urls '["turn:turn.example.com:3478?transport=udp","turns:turn.example.com:5349?transport=tcp"]'
   ```

The phone generates time-limited credentials (the coturn REST API scheme) for each call. Never run coturn as an open relay without authentication.

## Settings

In `shared/settings.lua` → `PhoneConfig.Video`:

| Option | Default | Description |
|---|---|---|
| `Enabled` | `true` | Turn FaceTime on or off |
| `Width` / `Height` / `FPS` | `640` / `360` / `20` | Outgoing video size and frame rate |
| `Bitrate` | `800000` | Target bits per second |
| `RequireTURN` / `RelayOnly` | `true` / `true` | Only connect through TURN (hides player IPs). Recommended. |
| `AudioMode` | `'voice'` | `voice` (pma-voice) or `webrtc` (needs microphone permission) |
| `SuppressDuplicateProximity` | `true` | Mutes the other caller's nearby proximity voice so you don't hear them twice |

Keep `CallMaxSeconds` at or below the default `3600`; the TURN credential lifetime is based on it.

KiloGram live streams use the same TURN settings. Their own options are in `shared/kilogram-live.lua`.

## Testing a call

Use two players, ideally on different networks:

- [ ] The call connects and both players see each other's game camera
- [ ] Audio works in both directions without echo or doubling
- [ ] Mute, camera off, and front/rear camera switch work
- [ ] Folding the phone or opening another app beside the call keeps it running
- [ ] Hanging up, declining, a busy line and an unanswered call all clean up correctly

## Security notes

- Only players in an accepted call receive TURN credentials, and those credentials expire.
- The server validates the size and shape of signaling messages (SDP and ICE) before forwarding them.
- `pma-voice` lets clients change their own call channel. The phone's call authorization doesn't harden `pma-voice` itself; if private voice channels matter on your server, review your voice resource too.
