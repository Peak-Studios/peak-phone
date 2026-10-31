# Native DUI screen overlays

`../../stream/peak_duo_live.ytyp` registers 32 lightweight screen drawables for
16 independent local DUI slots. These meshes use the original handset display
topology, including rounded corners and cover camera cutouts. Each surface is
inset 0.05 mm and offset 0.08 mm outward from the original display. The handset
housing and its static texture dictionary are unchanged.

For slot `01` through `16`, attach `peak_duo_screen_body_01` to the existing body
and `peak_duo_screen_leaf_01` to the existing leaf at zero local translation and
rotation. The leaf overlay follows the leaf entity through folding. All overlays
have outward winding and no collision geometry. The body's cover faces −Y;
the two inner panels face +Y.

Replace texture `peak_duo_live_01` in dictionary `peak_duo_live` with that slot's
DUI runtime texture. Each slot owns a separate texture name; no handset housing
texture is replaced. Remove the replacement and overlay entities when releasing
the slot. Streamed fallback textures are opaque black, 64 × 64, with seven mip
levels. Runtime DUI replaces the entire texture, including its resolution.

The 2048 × 1024 DUI atlas stores the expanded inner display in U 0–0.5 and the
folded cover in U 0.5–0.75; the remaining quarter is black. Rendered labeled
slot overlays confirm logical LEFT on the visual-left leaf uses U 0.25–0 and
logical RIGHT on the visual-right body uses U 0.5–0.25. The cover maps U 0.5–0.75
forward so its text reads left-to-right when closed. This keeps the inner and cover as separate DUI
regions so each can hand off with its own fold-synchronized blur and dim. All
screens map their upper edge to texture V=0 in the exported GTA buffers. Material
`emissive.sps` uses multiplier 1.

Add `stream/peak_duo_live.ytyp` to the resource's `files` and register it with
`data_file 'DLC_ITYP_REQUEST' 'stream/peak_duo_live.ytyp'`.

## Rebuild and validate

Use the same Blender 5.2, Sollumz 2.9, szio, and CodeWalker dev46 toolchain as the
handset authoring pipeline:

```powershell
& $blender --background --factory-startup --python-exit-code 1 --python scripts/author_live_screens.py -- --toolchain $toolchain
& ./scripts/convert_live_screens.ps1 -CodeWalker $codewalker
python scripts/verify_live_screens.py
```

`source/peak-duo-live-screens.blend` contains all slot meshes arranged for source
inspection. Root preview translations do not exist in the exported model geometry;
runtime attachments use zero offsets. `scripts/verify_live_screens.py`
checks exported UV orientation, outward triangle winding, shader texture isolation,
archetype dictionary references, absence of collision geometry, and all four LODs.

Connected FiveM clients still need to verify placement during folding, close-view
sharpness and brightness, different simultaneous phone contents, and slot cleanup.
