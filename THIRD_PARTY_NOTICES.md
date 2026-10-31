# Third-party notices

Peak Duo is © Peak Studios and licensed under the [GNU GPL v3.0](LICENSE). It includes or uses the third-party components below, which keep their own licenses.

## Bundled code

| Component | Where | License |
|---|---|---|
| [Svelte](https://svelte.dev) runtime | `web/legacy/bundle.original.js`, `web/public/build/duo-legacy.js` | MIT |
| [Svelte Material UI](https://sveltematerialui.com) (checkbox, form field, ripple, slider) | legacy bundle + `web/public/build/smui.css` | Apache-2.0 |
| [CKEditor 5](https://ckeditor.com/ckeditor-5/) balloon editor, © CKSource Holding sp. z o.o. | legacy bundle | GPL-2.0-or-later |
| [Luxon](https://moment.github.io/luxon/) | legacy bundle | MIT |
| [jQuery](https://jquery.com) | legacy bundle | MIT |
| [PeerJS](https://peerjs.com) (archived code, not loaded at runtime) | legacy bundle | MIT |

The original dependency versions are recorded in `web/legacy/package.root.original.json` and `web/package.json`.

## Icons

`web/public/duo/legacy-icons.css` contains SVG masks derived from **[Font Awesome Free](https://fontawesome.com)** by Fonticons, Inc., licensed under **CC BY 4.0** ([license](https://fontawesome.com/license/free)). The full upstream license text is in [`licenses/font-awesome-free.txt`](licenses/font-awesome-free.txt). No font files are redistributed.

The iOS-style app icons in `web/public/images/ios/` and the Duo shell artwork are original Peak Studios work.

## Maps

By default, the Maps app loads GTA V atlas tiles at runtime from **[GTA V Map Leaflet](https://github.com/SToXiT/gta-v-map-leaflet_-fire_borne)** (pinned revision `00e4c30b797aa3993435664769a905c14224a1a2`). The tiles aren't included in this repository. The project's code is MIT licensed, © 2021 Raul202; see [`licenses/gta-v-map-leaflet-MIT.txt`](licenses/gta-v-map-leaflet-MIT.txt). The map imagery depicts Grand Theft Auto V and belongs to its rights holders. `tools/vendor-atlas.py` can download the tiles for offline hosting; check that this is allowed for your use.

## Services used at runtime (optional, configured by the server owner)

- **[Audius](https://audius.co)** public API: music search and streaming in Peak Music. No music is included or licensed by this project.
- **[FiveManage](https://fivemanage.com)**: photo and video hosting (needs your own API key).
- **[Cloudflare Realtime TURN](https://developers.cloudflare.com/realtime/turn/)** or **[coturn](https://github.com/coturn/coturn)**: relays for video calls and live streams.

## Game and trademark notice

Peak Duo is a modification for **Grand Theft Auto V** running on [Cfx.re FiveM](https://fivem.net). It isn't affiliated with or endorsed by Rockstar Games, Take-Two Interactive or Cfx.re. The 3D handset and animations in `extras/` are original Peak Studios work; they include no game meshes.

The app names are fictional parodies (Y, KiloGram, Wenmo, Binge and others). *Apple*, *iOS*, *iPhone* and *FaceTime* are trademarks of Apple Inc., used only to describe the design style. This project is not affiliated with Apple.
