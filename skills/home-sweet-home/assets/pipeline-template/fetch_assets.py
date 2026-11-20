#!/usr/bin/env python3
"""Download CC0 assets from Poly Haven for the living-room pilot.
Usage: python3 fetch_assets.py <assets_dir>
Poly Haven rejects default urllib UA -> use curl with a UA string.
"""
import json, os, subprocess, sys

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "assets")
UA = "home-3d/1.0"

TEXTURES = {  # id: (resolution, maps)
    "laminate_floor_02": ("2k", ["Diffuse", "nor_gl", "Rough"]),
    "white_rough_plaster": ("1k", ["Diffuse", "nor_gl", "Rough"]),
    "white_plaster_02": ("1k", ["Diffuse", "nor_gl"]),
    "rough_linen": ("1k", ["Diffuse", "nor_gl", "Rough"]),
    "curly_teddy_natural": ("1k", ["Diffuse", "nor_gl", "Rough"]),
    "hessian_380": ("1k", ["Diffuse", "nor_gl", "Rough"]),
    "oak_veneer_01": ("1k", ["Diffuse", "nor_gl", "Rough"]),
    "marble_01": ("1k", ["Diffuse", "nor_gl", "Rough"]),
    "tiled_floor_001": ("1k", ["Diffuse", "nor_gl", "Rough"]),
}
HDRIS = {"kloofendal_48d_partly_cloudy_puresky": "2k", "evening_road_01_puresky": "2k"}
MODELS = {"pachira_aquatica_01": "1k", "potted_plant_02": "1k", "calathea_orbifolia_01": "1k",
          "ceramic_vase_02": "1k", "ceramic_vase_04": "1k", "potted_plant_04": "1k", "wooden_bowl_01": "1k"}


def curl(url, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return
    subprocess.run(["curl", "-sfL", "-A", UA, "-o", dst, url], check=True)


def files(asset):
    r = subprocess.run(["curl", "-sfL", "-A", UA, f"https://api.polyhaven.com/files/{asset}"],
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def pick(entry, res, ext_pref=("jpg", "png")):
    e = entry.get(res) or entry[sorted(entry.keys())[0]]
    for ext in ext_pref:
        if ext in e:
            return e[ext]["url"], ext
    k = next(iter(e)); return e[k]["url"], k


report = []
for tid, (res, maps) in TEXTURES.items():
    f = files(tid)
    for m in maps:
        if m not in f:
            report.append(f"MISSING {tid}:{m}"); continue
        url, ext = pick(f[m], res)
        curl(url, f"{OUT}/textures/{tid}_{m}.{ext}")
    report.append(f"tex {tid} {res}")

for hid, res in HDRIS.items():
    f = files(hid)
    url, ext = pick(f["hdri"], res, ("hdr", "exr"))
    curl(url, f"{OUT}/hdri/{hid}_{res}.{ext}")
    report.append(f"hdri {hid} {res}")

for mid, res in MODELS.items():
    f = files(mid)
    g = f["gltf"].get(res) or f["gltf"][sorted(f["gltf"])[0]]
    g = g["gltf"]
    base = f"{OUT}/models/{mid}"
    curl(g["url"], f"{base}/{mid}.gltf")
    for rel, inc in g.get("include", {}).items():
        curl(inc["url"], f"{base}/{rel}")
    report.append(f"model {mid} {res}")

print("\n".join(report))
