These authoring scripts reproduce the mirrored fold and SIM motion. They need
Blender 5.2, Sollumz, the local CodeWalker toolchain and a freemode
reference rig exported from your own game files. Private skin meshes must never be added
to this repository.

Set `PEAK_AUTHORING_WORKSPACE` to your local authoring workspace and
`PEAK_ANIMATION_OUTPUT` to a separate staging directory. Create `source`,
`intermediates` and `evidence` within that staging directory. Place your grip-rotation reports (`grip-rotation-male.json` and the female
equivalent) in the staged evidence directory, keeping the attachment rotation
matched to the actual runtime profiles in `shared/duo_prop.lua`.

For each of `male` and `female`, run Blender in background mode with
`--python author_fold.py -- male` and `--python author_motion.py -- male`.
Fold authoring loads the public handset blend in this repository. SIM authoring
uses a locally fitted hand scene with the current public handset
collision geometry and runtime attachment before solving the new tray motion.

Convert the four staged YCD XML dictionaries with CodeWalker's XmlYcd.GetYcd
and Save, then reload their bytes with RpfFile.LoadResourceFile at resource
version 46. Copy the new trayHandAttachment report values into BOTH the runtime
profiles and peak-sim-assets/profiles.lua. A successful binary reload does not
prove FiveM clothing clearance or animation blending.
