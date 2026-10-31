"""Print hierarchy, bounds, and materials of a GLB with Blender."""
import json
import sys
from pathlib import Path

import bpy

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=path)

rows = []
for obj in bpy.data.objects:
    row = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "location": list(obj.location),
        "rotation": list(obj.rotation_euler),
        "scale": list(obj.scale),
        "bounds_world": [
            [min((obj.matrix_world @ __import__('mathutils').Vector(corner))[i] for corner in obj.bound_box) for i in range(3)],
            [max((obj.matrix_world @ __import__('mathutils').Vector(corner))[i] for corner in obj.bound_box) for i in range(3)],
        ] if obj.type == "MESH" else None,
        "triangles": len(obj.data.polygons) if obj.type == "MESH" else 0,
        "materials": [mat.name if mat else None for mat in obj.data.materials] if obj.type == "MESH" else [],
    }
    rows.append(row)
print("GLB_INSPECTION=" + json.dumps({
    "objects": rows,
    "images": [{"name": img.name, "size": list(img.size), "channels": img.channels} for img in bpy.data.images],
    "materials": [{"name": mat.name, "images": [{"name": n.image.name if n.image else None, "color": n.image.colorspace_settings.name if n.image else None} for n in mat.node_tree.nodes if n.type == "TEX_IMAGE"] if mat.use_nodes else [], "base_color": next((list(n.inputs['Base Color'].default_value) for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)} for mat in bpy.data.materials],
}), file=open(Path(__file__).resolve().parents[1] / "evidence" / "import-inspection.json", "w", encoding="utf-8"))
