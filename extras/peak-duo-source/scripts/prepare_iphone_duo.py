"""Build a compact game texture atlas and trace the supplied Peak emblem."""
from io import BytesIO
from pathlib import Path
import json
import math
import struct

import cv2
import numpy as np
from PIL import Image
from render_lock_screen import render as render_lock_screen

ROOT = Path(__file__).resolve().parents[1]
GLB = ROOT / "source" / "iphone-duo.glb"
LOGO = ROOT / "source" / "peak-logo-original.png"
OUT = ROOT / "source" / "textures"
OUT.mkdir(parents=True, exist_ok=True)

raw = GLB.read_bytes()
length, kind = struct.unpack_from("<II", raw, 12)
assert kind == 0x4E4F534A
doc = json.loads(raw[20:20 + length])
offset = 20 + length
offset += 8
bin_chunk = raw[offset:]

def embedded_image(index):
    entry = doc["images"][index]
    view = doc["bufferViews"][entry["bufferView"]]
    start = view.get("byteOffset", 0)
    return Image.open(BytesIO(bin_chunk[start:start + view["byteLength"]])).convert("RGBA")

inspect = json.loads((ROOT / "evidence" / "import-inspection.json").read_text().split("=", 1)[1])
by_name = {m["name"]: m for m in inspect["materials"]}
atlas = Image.new("RGBA", (1024, 1024), (32, 35, 40, 255))
mapping = {}
for index, mat in enumerate(doc["materials"]):
    name = mat["name"]
    info = by_name[name]
    img_name = next((entry["name"] for entry in info["images"] if entry["color"] == "sRGB"), None)
    if img_name is None:
        color = tuple(round(max(0, min(1, c)) * 255) for c in info["base_color"])
        tile = Image.new("RGBA", (128, 128), color)
    else:
        tile = embedded_image(int(img_name.split("_")[1])).resize((128, 128), Image.Resampling.LANCZOS)
    col, row = index % 8, index // 8
    atlas.paste(tile, (col * 128, row * 128))
    mapping[name] = {"col": col, "row": row, "image": img_name}
atlas.paste(Image.new("RGBA", (128, 128), (34, 205, 139, 255)), (128, 4 * 128))
mapping["__peak_logo__"] = {"col": 1, "row": 4, "image": None}
lock_screen = render_lock_screen(camera_safe=True)
lock_screen.save(OUT / "peak_lock_screen.png")
atlas.paste(lock_screen, (640, 512))
mapping["__lock_screen__"] = {"rect": [640, 512, 1024, 1024], "image": "peak_lock_screen.png"}
inner_lock_screen = render_lock_screen((384, 256), orientation_safe=True)
inner_lock_screen.save(OUT / "peak_inner_lock_screen.png")
atlas.paste(inner_lock_screen, (256, 512))
mapping["__inner_lock_screen__"] = {"rect": [256, 512, 640, 768], "image": "peak_inner_lock_screen.png"}
atlas.save(OUT / "iphone_duo_atlas.png")

def dds(image, path):
    image = image.convert("RGBA")
    width, height = image.size
    mip_count = 1 + int(math.log2(max(width, height)))
    header = [124, 0x2100F, height, width, width * 4, 0, mip_count] + [0] * 11 + [32, 0x41, 0, 32, 0xff0000, 0xff00, 0xff, 0xff000000, 0x401008, 0, 0, 0, 0]
    with path.open("wb") as file:
        file.write(b"DDS " + struct.pack("<31I", *header))
        for _ in range(mip_count):
            file.write(image.tobytes("raw", "BGRA"))
            image = image.resize((max(1, image.width // 2), max(1, image.height // 2)), Image.Resampling.LANCZOS)

dds(atlas, OUT / "iphone_duo_atlas.dds")

rgba = np.array(Image.open(LOGO).convert("RGB"))
green = rgba[:, :, 1]
mask = np.uint8((green > 165) & (green > rgba[:, :, 0] * 1.35)) * 255
contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
main = max(range(len(contours)), key=lambda i: cv2.contourArea(contours[i]))
paths = []
for i, contour in enumerate(contours):
    if i != main and (hierarchy[0][i][3] != main or cv2.contourArea(contour) < 1000):
        continue
    simplified = cv2.approxPolyDP(contour, 6.0, True)[:, 0, :]
    paths.append({"hole": i != main, "points": simplified.tolist()})
(OUT / "peak_logo_contours.json").write_text(json.dumps(paths))
(OUT / "iphone_duo_atlas.json").write_text(json.dumps(mapping, indent=2))
print("prepared", len(mapping), "material tiles and", len(paths), "Peak logo contours")
