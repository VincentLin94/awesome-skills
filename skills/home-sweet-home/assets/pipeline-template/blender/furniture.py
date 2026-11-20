"""Procedural furniture from home.json items (living/foyer/kitchen/balcony).
Each item -> parent empty F_<id> at plan pos with rotation; parts as children.
Plants/decor glTF are placed by assets.py. Names prefixed F_ -> atlas 'furn'.
"""
import bpy, math
from common import load_home
import geo as G

ROOMS = {"living", "foyer", "kitchen", "balcony"}


def build(H):
    items = [f for f in H["furniture"] if f["room"] in ROOMS and f["kind"] != "plant"]
    seen = {}
    for i, f in enumerate(items):
        n = seen[f["kind"]] = seen.get(f["kind"], 0) + 1
        root = _root(f"F_{f['kind']}_{n}", f["x"], f["y"], f.get("rot", 0))
        fn = _BUILDERS.get(f["kind"])
        if fn:
            fn(root, f)
        else:
            _generic(root, f)


def _root(name, x, y, rot):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o.location = G.P(x, y, 0)
    o.rotation_euler[2] = -math.radians(rot)
    o["lm_atlas"] = "furn"
    return o


def _B(p, name, lx, ly, lz, sx, sy, sz, mat, bevel=0.0, seg=2):
    return G.local_box(p, name, lx / 100.0, ly / 100.0, lz / 100.0,
                       sx / 100.0, sy / 100.0, sz / 100.0, mat, bevel=bevel / 100.0, seg=seg)


def _C(p, name, lx, ly, lz, r, h, mat, verts=20, r2=None, axis='Z'):
    return G.local_cyl(p, name, lx / 100.0, ly / 100.0, lz / 100.0, r / 100.0, h / 100.0,
                       mat, verts=verts, r2=None if r2 is None else r2 / 100.0, axis=axis)


def _S(p, name, lx, ly, lz, rx, ry, rz, mat, seg=24, rings=14):
    return G.local_sphere(p, name, lx / 100.0, ly / 100.0, lz / 100.0,
                          rx / 100.0, ry / 100.0, rz / 100.0, mat, seg=seg, rings=rings)


# ---------------------------------------------------------------- sofas
def _sofa(p, f):
    w, d = f["w"], f["d"]
    _B(p, "base", 0, 3, 22, w - 8, d - 14, 24, "linen_cream", bevel=4, seg=3)
    n = 3
    for k in range(n):
        x = -w / 2 + 18 + k * (w - 36) / (n - 1)
        _B(p, f"seat{k}", x, 10, 40, (w - 40) / n - 2, d - 34, 18, "linen_cream", bevel=5, seg=4)
    _B(p, "back", 0, -d / 2 + 11, 45, w - 6, 22, 48, "linen_cream", bevel=5, seg=4)
    _B(p, "armL", -w / 2 + 7, 0, 38, 14, d - 8, 32, "linen_cream", bevel=5, seg=4)
    _B(p, "armR", w / 2 - 7, 0, 38, 14, d - 8, 32, "linen_cream", bevel=5, seg=4)
    for lx, ly, mat in ((-55, -18, "linen_terracotta"), (0, -22, "linen_oat"), (52, -16, "linen_sage")):
        c = _B(p, f"pillow{lx}", lx, ly, 60, 38, 12, 34, mat, bevel=5, seg=4)
        c.rotation_euler[0] = math.radians(-8)
    for lx in (-w / 2 + 12, w / 2 - 12):
        for ly in (-d / 2 + 12, d / 2 - 12):
            _B(p, "leg", lx, ly, 4, 5, 5, 8, "walnut", bevel=1)


def _armchair(p, f):
    w, d = f["w"], f["d"]
    _B(p, "base", 0, 2, 20, w - 8, d - 12, 22, "boucle", bevel=4, seg=3)
    _B(p, "seat", 0, 8, 38, w - 18, d - 28, 18, "boucle", bevel=6, seg=5)
    _B(p, "back", 0, -d / 2 + 10, 44, w - 6, 20, 50, "boucle", bevel=6, seg=5)
    _B(p, "armL", -w / 2 + 7, 0, 36, 14, d - 8, 28, "boucle", bevel=6, seg=5)
    _B(p, "armR", w / 2 - 7, 0, 36, 14, d - 8, 28, "boucle", bevel=6, seg=5)


def _coffeetable(p, f):
    r, h = f["r"], f["h"]
    _C(p, "top", 0, 0, h - 2, r, 4, "oak", verts=48)
    for k in range(3):
        a = math.radians(90 * k)
        _B(p, f"leg{k}", math.cos(a) * r * 0.62, math.sin(a) * r * 0.62, 8, 5, 5, h - 6, "walnut", bevel=1)
    _C(p, "tray", -r * 0.3, r * 0.2, h + 0.6, 11, 1.2, "ceramic_dark", verts=32)
    for k in range(3):
        b = _B(p, f"book{k}", -r * 0.3 + k * 1.2, r * 0.2, h + 2 + k * 1.4, 24, 17, 2.5,
               ["oak", "linen_sage", "linen_terracotta"][k], bevel=0.3)
        b.rotation_euler[2] = math.radians(2 * k)


# ---------------------------------------------------------------- media wall
def _tvwall(p, f):
    pass  # material decision only; surface is the architecture wall


def _tvstand(p, f):
    w, d, h, e = f["w"], f["d"], f["h"], f.get("elev", 0)
    _B(p, "body", 0, 0, e + h / 2, w, d, h, "walnut", bevel=0.8, seg=2)
    _B(p, "front", 0, d / 2 - 1, e + h / 2, w - 2, 2, h - 2, "oak", bevel=0.4)
    for k in range(3):
        _B(p, f"gap{k}", -w / 3 + k * w / 3, d / 2, e + h / 2, 0.6, 1, h - 4, "plastic_black")
    _C(p, "vase", w * 0.32, -2, e + h, 7, 22, "ceramic", verts=28)


def _tv(p, f):
    w, h, e = f["w"], f["h"], f["elev"]
    _B(p, "frame", 0, 0, e + h / 2, w + 4, 6, h + 4, "plastic_black", bevel=0.6)
    _B(p, "screen", 0, -0.3, e + h / 2, w, 2, h, "tv_screen", bevel=0.4)


# ---------------------------------------------------------------- dining
def _dining(p, f):
    w, d, h = f["w"], f["d"], f["h"]
    _B(p, "top", 0, 0, h - 2, w, d, 4, "oak", bevel=0.8)
    for lx in (-w / 2 + 8, w / 2 - 8):
        for ly in (-d / 2 + 8, d / 2 - 8):
            _B(p, "leg", lx, ly, 36, 6, 6, h - 4 - 36, "walnut", bevel=0.6)
    # 4 chairs, two per long side
    for row, (ly, fac) in enumerate(((d / 2 + 32, 180), (-d / 2 - 32, 0))):
        for k, lx in enumerate((-w * 0.28, w * 0.28)):
            ch = bpy.data.objects.new(f"F_chair_{row}_{k}", None)
            bpy.context.scene.collection.objects.link(ch)
            ch.parent = p; ch.matrix_parent_inverse = __import__('mathutils').Matrix.Identity(4)
            ch.location = (lx / 100.0, -ly / 100.0, 0)
            ch.rotation_euler[2] = -math.radians(fac)
            ch["lm_atlas"] = "furn"
            _chair(ch)


def _chair(ch):
    _B(ch, "seat", 0, 0, 45, 44, 44, 8, "linen_cream", bevel=3, seg=3)
    _B(ch, "back", 0, -19, 72, 44, 6, 46, "oak", bevel=1.5)
    for lx in (-18, 18):
        for ly in (-18, 18):
            _B(ch, "leg", lx, ly, 22, 4.5, 4.5, 44, "walnut", bevel=0.5)


def _pendant(p, f):
    r = f["r"]; e = f["elev"]
    _C(p, "cord", 0, 0, 275, 0.5, 275 - (e - r * 0.8), "black_metal", verts=8)
    sh = _S(p, "shade", 0, 0, e - r * 0.8, r, r * 0.82, r, "paper", seg=32, rings=18)


# ---------------------------------------------------------------- bar
def _bar(p, f):
    w, d, h = f["w"], f["d"], f["h"]
    _B(p, "cab", 0, 0, h / 2 - 2, w, d - 4, h - 4, "oak", bevel=0.8)
    _B(p, "top", 0, 0, h - 1.5, w + 4, d + 4, 3, "marble", bevel=0.6)
    for k in range(3):
        _B(p, f"door{k}", -w / 3 + k * w / 3, -d / 2 - 0.2, h / 2 - 2, 0.6, 1, h - 10, "walnut")
    # coffee machine
    _B(p, "machine", w * 0.28, -6, h + 11, 32, 28, 22, "plastic_black", bevel=2, seg=3)
    _C(p, "cup1", w * 0.28 - 8, 10, h + 1.5, 3.5, 7, "ceramic", verts=20)
    _C(p, "cup2", w * 0.28 + 2, 10, h + 1.5, 3.5, 7, "ceramic", verts=20)
    # two stools on the room side (south)
    for k, lx in enumerate((-w * 0.25, w * 0.25)):
        st = bpy.data.objects.new(f"F_stool_{k}", None)
        bpy.context.scene.collection.objects.link(st)
        st.parent = p; st.matrix_parent_inverse = __import__('mathutils').Matrix.Identity(4)
        st.location = (lx / 100.0, -(d / 2 + 30) / 100.0, 0); st["lm_atlas"] = "furn"
        _C(st, "post", 0, 0, 8, 2.5, 62, "black_metal", verts=16)
        _C(st, "ring", 0, 0, 16, 16, 2, "black_metal", verts=28)
        _C(st, "seat", 0, 0, 70, 19, 5, "linen_oat", verts=32)


def _art(p, f):
    w, h, e = f["w"], f["h"], f["elev"]
    _B(p, "frame", 0, 0, e + h / 2, w + 5, 3.5, h + 5, "walnut", bevel=0.4)
    _B(p, "canvas", 0, -0.2, e + h / 2, w - 2, 2, h - 2, "art", bevel=0.2)


def _floorlamp(p, f):
    h = f["h"]
    _C(p, "base", 0, 0, 1, 13, 2, "black_metal", verts=28)
    _C(p, "pole", 0, 0, h / 2, 1.4, h - 4, "black_metal", verts=10)
    _C(p, "shade", 0, 6, h - 14, 8, 20, "shade_linen", verts=28, r2=14)
    _B(p, "arm", 0, 3, h - 4, 3, 12, 2, "black_metal", bevel=0.5)


def _curtain(p, f):
    w, h = f["w"], f["h"]
    _C(p, "rail", 0, 0, h + 6, 1.2, w + 12, "black_metal", verts=8, axis='X')
    half = w / 2
    for s in (-1, 1):
        for k in range(3):
            c = _B(p, f"fold{s}_{k}", s * (half * 0.28 + k * half * 0.16), 2 + (k % 2) * 2,
                   h / 2, half * 0.3, 2.5, h - 4, "sheer", bevel=0.8, seg=2)
            c.rotation_euler[2] = math.radians(s * (3 if k % 2 else -3))


def _mirror(p, f):
    w, h, e = f["w"], f["h"], f["elev"]
    _B(p, "frame", 0, 0, e + h / 2, w + 5, 3.5, h + 5, "black_metal", bevel=0.4)
    _B(p, "glass", 0, -0.2, e + h / 2, w - 1, 2, h - 1, "steel", bevel=0.2)


def _cabinet(p, f):
    w, d, h = f["w"], f["d"], f["h"]
    _B(p, "body", 0, 0, h / 2, w, d, h, "oak", bevel=0.8)
    for k in range(2):
        _B(p, f"door{k}", (-w / 4 + k * w / 2), d / 2 + 0.1, h / 2, w / 2 - 1, 2, h - 2, "door_paint", bevel=0.4)
        _B(p, f"handle{k}", (-w / 4 + k * w / 2) + (8 if k == 0 else -8), d / 2 + 1.2, h / 2,
           2, 2.5, 22, "brass", bevel=0.5)


# ---------------------------------------------------------------- kitchen
def _counter(p, f):
    w, d, h = f["w"], f["d"], f["h"]
    _B(p, "body", 0, 0, (h - 4) / 2, w, d - 2, h - 4, "cabinet_white", bevel=0.6)
    _B(p, "top", 0, 0, h - 2, w + 2, d + 2, 4, "marble", bevel=0.5)
    n = max(2, int(w // 55))
    for k in range(n):
        x = -w / 2 + w * (k + 0.5) / n
        _B(p, f"front{k}", x, d / 2 + 0.1, 34, w / n - 3, 2, 58, "cabinet_white", bevel=0.3)
        _B(p, f"handle{k}", x, d / 2 + 1.2, 60, 18, 1.5, 2, "steel", bevel=0.3)
    if f.get("feature") == "cooktop":
        _B(p, "hob", -w * 0.12, -2, h + 0.6, 56, 44, 1.2, "plastic_black", bevel=0.3)
        for lx, ly, r in ((-12, -10, 8), (12, -10, 6), (-12, 10, 6), (12, 10, 9)):
            _C(p, "burner", -w * 0.12 + lx, -2 + ly, h + 1.4, r, 1.2, "black_metal", verts=24)
    if f.get("feature") == "sink":
        _B(p, "basin", w * 0.1, 0, h + 0.4, 52, 36, 2, "steel", bevel=1.5)
        _B(p, "basin2", w * 0.1, 0, h - 3, 46, 30, 7, "steel", bevel=1.5)
        _C(p, "faucet1", w * 0.1 + 20, -d / 2 + 6, h + 2, 1.6, 22, "brass", verts=12)
        _C(p, "faucet2", w * 0.1 + 14, -d / 2 + 6, h + 22, 1.6, 14, "brass", verts=12, axis='X')


def _fridge(p, f):
    w, d, h = f["w"], f["d"], f["h"]
    _B(p, "body", 0, 0, h / 2, w, d, h, "cabinet_white", bevel=1.2, seg=3)
    _B(p, "door1", 0, d / 2 + 0.2, h * 0.72, w - 2, 2, h * 0.52, "door_paint", bevel=0.5)
    _B(p, "door2", 0, d / 2 + 0.2, h * 0.24, w - 2, 2, h * 0.40, "door_paint", bevel=0.5)
    _B(p, "gap", 0, d / 2 + 1, h * 0.47, w - 2, 1.5, 1, "plastic_black")
    _B(p, "handle1", -w / 2 + 6, d / 2 + 2, h * 0.72, 2.5, 3, 70, "steel", bevel=0.5)
    _B(p, "handle2", -w / 2 + 6, d / 2 + 2, h * 0.24, 2.5, 3, 55, "steel", bevel=0.5)


def _lounge(p, f):
    _B(p, "seat", 0, 0, 30, 62, 58, 14, "boucle", bevel=6, seg=5)
    _B(p, "back", 0, -24, 58, 62, 12, 48, "boucle", bevel=6, seg=5)
    _B(p, "armL", -28, 0, 44, 10, 54, 22, "black_metal", bevel=2)
    _B(p, "armR", 28, 0, 44, 10, 54, 22, "black_metal", bevel=2)
    for lx in (-22, 22):
        for ly in (-20, 20):
            _C(p, "leg", lx, ly, 4, 2, 26, "black_metal", verts=10)


def _watersys(p, f):
    w, d, h = f["w"], f["d"], f["h"]
    _B(p, "body", 0, 0, h / 2, w, d, h, "cabinet_white", bevel=0.8)
    _B(p, "door", 0, d / 2 + 0.2, h / 2, w - 2, 2, h - 4, "door_paint", bevel=0.3)
    for k in range(3):
        _B(p, f"vent{k}", w / 2 - 3, 0, h * 0.55 + k * 9, 2, d - 4, 5, "plastic_black")


def _rug(p, f):
    _B(p, "rug", 0, 0, 0.25, f["w"], f["d"], 0.5, "jute", bevel=0.5)


def _generic(p, f):
    w = f.get("w", 40); d = f.get("d", 40); h = f.get("h", 40)
    _B(p, "box", 0, 0, (f.get("elev", 0) + h / 2), w, d, h, "oak", bevel=1)


_BUILDERS = {
    "sofa": _sofa, "armchair": _armchair, "coffeetable": _coffeetable,
    "tvwall": _tvwall, "tvstand": _tvstand, "tv": _tv, "dining": _dining,
    "pendant": _pendant, "bar": _bar, "art": _art, "floorlamp": _floorlamp,
    "curtain": _curtain, "mirror": _mirror, "cabinet": _cabinet,
    "counter": _counter, "fridge": _fridge, "lounge": _lounge, "watersys": _watersys,
    "rug": _rug,
}
