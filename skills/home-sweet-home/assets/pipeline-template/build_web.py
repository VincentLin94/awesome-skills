#!/usr/bin/env python3
"""Package textures + glb into assets.js (data URIs) for file:// use, and emit lights.js
(mirrors blender/lights.py positions). No baked lightmaps: lighting is real-time.
"""
import base64, io, json, os, shutil
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "assets", "textures")
OUT = os.path.join(HERE, "out")
WEB = os.path.join(HERE, "web")
os.makedirs(WEB, exist_ok=True)

NEED = [
    "laminate_floor_02_Diffuse.jpg", "laminate_floor_02_nor_gl.jpg", "laminate_floor_02_Rough.jpg",
    "oak_veneer_01_Diffuse.jpg", "oak_veneer_01_nor_gl.jpg", "oak_veneer_01_Rough.jpg",
    "white_plaster_02_detail.jpg", "white_plaster_02_nor_gl.jpg",
    "rough_linen_detail.jpg", "rough_linen_nor_gl.jpg",
    "curly_teddy_natural_Diffuse.jpg", "curly_teddy_natural_nor_gl.jpg",
    "hessian_380_detail.jpg", "hessian_380_nor_gl.jpg",
    "marble_01_Diffuse.jpg", "marble_01_nor_gl.jpg", "marble_01_Rough.jpg",
    "tiled_floor_001_Diffuse.jpg", "tiled_floor_001_nor_gl.jpg",
    "art_canvas.jpg",
]


def jpg_uri(path, max_w=1024, q=80):
    im = Image.open(path).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, int(im.height * max_w / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, format="JPEG", quality=q)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


assets = {"tex": {}}
for f in NEED:
    p = os.path.join(TEX, f)
    if os.path.exists(p):
        assets["tex"][os.path.splitext(f)[0]] = jpg_uri(p)
    else:
        print("MISSING TEX", f)
with open(os.path.join(OUT, "living.glb"), "rb") as f:
    assets["glb"] = "data:model/gltf-binary;base64," + base64.b64encode(f.read()).decode()

with open(os.path.join(WEB, "assets.js"), "w", encoding="utf-8") as f:
    f.write("window.ASSETS=" + json.dumps(assets, ensure_ascii=False) + ";")
mats = json.load(open(os.path.join(OUT, "materials.json"), encoding="utf-8"))
with open(os.path.join(WEB, "materials.js"), "w", encoding="utf-8") as f:
    f.write("window.MATS=" + json.dumps(mats, ensure_ascii=False) + ";")

# lights (plan cm triples; same layout as blender/lights.py)
LIGHTS = {
    "day": {
        "sun": {"p": [600, 420, 1120], "t": [470, 60, 480], "i": 3.2, "color": [1.0, 0.95, 0.85], "size": 0.04},
        "hemi": {"sky": [0.78, 0.85, 0.92], "ground": [0.78, 0.72, 0.62], "i": 0.55},
        "fill": {"p": [350, 250, 360], "t": [350, 60, 600], "i": 0.9, "size": 1.2, "color": [1.0, 0.97, 0.92]}
    },
    "night": {
        "spots": [[x, y, 262] for x in (600, 780) for y in (508, 595, 682)],
        "cove": [[300, 252, 470], [480, 252, 700], [760, 252, 700], [940, 252, 500],
                 [560, 252, 360], [320, 252, 690], [720, 252, 470]],
        "points": [
            {"p": [340, 200, 590], "i": 14, "d": 0.18, "color": [1.0, 0.83, 0.6]},
            {"p": [545, 142, 745], "i": 9, "d": 0.2, "color": [1.0, 0.83, 0.6]},
            {"p": [470, 250, 250], "i": 4, "d": 0.4, "color": [1.0, 0.86, 0.66]},
            {"p": [258, 120, 350], "i": 5, "d": 0.15, "color": [1.0, 0.85, 0.65]}
        ]
    }
}
with open(os.path.join(WEB, "lights.js"), "w", encoding="utf-8") as f:
    f.write("window.LIGHTS=" + json.dumps(LIGHTS) + ";")
print("assets.js MB:", round(os.path.getsize(os.path.join(WEB, "assets.js")) / 1048576, 1))
