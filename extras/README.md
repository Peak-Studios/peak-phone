# Extras

| Folder | What it is | Install? |
|---|---|---|
| `peak-duo-prop/` | The Peak Duo handset model, archetype and fold/unfold animations | **Yes.** Copy it to `resources/peak-duo-prop` and `ensure` it before `peak-phone`. |
| `peak-sim-assets/` | SIM card and tray models, SIM insert/remove animations and the playback adapter | **Yes.** Copy it to `resources/peak-sim-assets` and `ensure` it after `peak-duo-prop`. |
| `peak-duo-source/` | Editable Blender source of the handset, textures and authoring/validation scripts | No (source only) |
| `sharedrop-source/` | Blender source and authoring data for the ShareDrop hand animations | No (source only) |

Animation timing in `peak-duo-prop` must match `shared/duo_prop.lua` in `peak-phone`. Update the two together.

The source folders contain no GTA character meshes. Rebuilding the assets needs your own game reference exports, Blender, Sollumz and CodeWalker (see each folder's README).
