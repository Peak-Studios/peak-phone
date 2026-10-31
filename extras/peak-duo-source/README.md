# Peak Duo replacement handset

The shells and all three glasses are rebuilt from `scripts/handset_geometry.py`: matched 78.375 × 108 mm rounded panels with coplanar inner screens, a shared positive-X hinge, and a centered closed leaf. Six supplier side-button/rail meshes and the rear Peak badge are retained. The folded cover has near-square hinge-side corners, broad outer corners, and one upper-right circular selfie lens with a reserved status-safe area. Inner UVs map one wide lock-screen composition across complementary leaf/body halves; the cover uses its own portrait lock composition.

The game assets are in `../peak-duo-prop/stream`. `peak-phone` now loads `peak_duo_body` and `peak_duo_leaf`; the SIM animation adapter accepts the new body and seats its tray higher on the shorter shell. The old `peak_sim_phone_body.ydr` remains in `peak-sim-assets` for rollback but is not selected by the phone configuration.

## Rebuild

From this directory, with Python 3, Pillow, OpenCV, Blender 5.2, Sollumz 2.9.0 / szio 1.3.0.dev9, and CodeWalker dev46:

```powershell
python scripts/prepare_iphone_duo.py
& $blender --background --factory-startup --python-exit-code 1 --python scripts/author_iphone_duo.py -- --toolchain $toolchain
& ./scripts/convert.ps1 -CodeWalker $codewalker
python scripts/verify_assets.py
& $blender --background --factory-startup --python-exit-code 1 --python scripts/verify_iphone_duo.py
```

`$toolchain` contains `blender-addons/Sollumz` and `sollumz-python`; `$codewalker` contains CodeWalker.Core.dll and its SharpDX dependencies. The generated binary asset names are stable and the conversion reads them back through CodeWalker.

The current body/leaf total 8,324 triangles at each LOD (6,076 body and 2,248 leaf). Camera detail is simplified separately so shell and glass boundaries remain identical. The 181-angle sweep has no cross-half intersections and also checks equal dimensions, aligned top/bottom edges, opening side, and folded centering. Clothing and hand contact require connected-client QA.

The game atlas is 1024 × 1024 with full mipmaps. The initial 2048 atlas triggered a 32 MiB physical-memory warning on FXServer; the smaller atlas was rebuilt and round-trip validated for this candidate.

The held body uses the established hand attachment. Live UI textures cover the native glass; the atlas is only a startup fallback. The shared inner fallback is an orientation-neutral Aurora field, so it cannot show sideways text while the handset turns or before a matching live frame arrives. The folded cover retains its upright lock screen. Renders of the open, folded and rear handset are shown in the main README (`docs/images/handset-prop.webp`).

The unfolded inner glass has straight hinge edges with no center bezel gap. Both native surfaces meet at the same position and share the center UV boundary. Rendered labeled live overlays confirm logical LEFT on the leaf uses U [0,.25], logical RIGHT on the body uses U [.25,.5], and the folded cover uses U [.5,.75]. CodeWalker roundtrip validation checks shared edge heights and UVs. The single wide composition crosses the center in the updated Blender preview.

Mechanical audit: straight inner shell edges remove hinge-end notches. Recessed end knuckles/supports sit outside the active glass; the central display remains unobstructed. Static inner glass clearance is 0.5 mm when closed, and all 181 one-degree samples have zero cross-half surface intersections. The contact sheet includes front, rear and intermediate fold states. This is a game prop visual/clearance check, not a manufacturer CAD or engineering validation.
