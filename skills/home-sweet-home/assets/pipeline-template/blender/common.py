"""Shared spec for the living-room pilot: material table + helpers.
Used by build_scene.py / bake.py / render.py (Blender) and exported as materials.json for the web viewer.
Coordinates: plan (cm, x east, y south) -> Blender (m, X east, Y north, Z up) = (x/100, -y/100, z/100).
glTF export (Y-up) -> three.js (X east, Y up, Z south) — same as the main home viewer.
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # living-pilot/
HOME_JSON = os.path.join(os.path.dirname(ROOT), "home-3d", "src", "home.json")
ASSETS = os.path.join(ROOT, "assets")
TEX = os.path.join(ASSETS, "textures")
OUT = os.path.join(ROOT, "out")

INCLUDE_ROOMS = ["living", "foyer", "kitchen", "balcony"]


def P(x, y, z=0.0):
    """plan cm -> blender metres"""
    return (x / 100.0, -y / 100.0, z / 100.0)


def srgb2lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex2lin(h):
    h = h.lstrip("#")
    return tuple(srgb2lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)


# ---------------------------------------------------------------------------
# Material table (single source of truth for Blender AND three.js)
#   tex      : texture set prefix in assets/textures (Poly Haven id); maps: _Diffuse/_detail, _nor_gl, _Rough
#   detail   : use grayscale *_detail.jpg (mean≈0.85) instead of colour diffuse -> tint drives colour
#   tile     : metres covered by one texture repeat (UV0 is in metres)
#   tint     : sRGB hex multiplied with the texture (or flat colour when no tex)
#   rough    : roughness (multiplied with rough map when present)
#   metal    : metalness
#   nstr     : normal map strength
#   kind     : 'opaque' | 'glass' | 'sheer' | 'emissive' | 'shade' (translucent emissive lamp shade)
#   emit     : emission colour hex (night only) ; estr = strength for Blender (W/m² style) ; web uses emitWeb
#   lm       : receives a baked lightmap (False for glass / emitters / plants)
# ---------------------------------------------------------------------------
MATS = {
    "floor_oak":       dict(tex="laminate_floor_02", tile=1.7, tint="#F4E9DA", rough=0.85, nstr=0.6),
    "wall_terracotta": dict(tint="#EBD5C0", rough=0.95),
    "wall_keep":       dict(tint="#F0EBE3", rough=0.95),
    "ceiling":         dict(tint="#F6F3EE", rough=0.97),
    "skirting":        dict(tint="#EEE8DF", rough=0.45),
    "door_paint":      dict(tint="#EFEBE5", rough=0.38),
    "oak":             dict(tex="oak_veneer_01", tile=1.2, tint="#FFFFFF", rough=0.6, nstr=0.4),
    "walnut":          dict(tex="oak_veneer_01", tile=1.2, tint="#8F6F57", rough=0.55, nstr=0.4),
    "linen_cream":     dict(tint="#E8DFD0", rough=0.96),
    "linen_terracotta": dict(tint="#C99377", rough=0.96),
    "linen_sage":      dict(tint="#A6B19C", rough=0.96),
    "linen_oat":       dict(tint="#DCCDB6", rough=0.96),
    "boucle":          dict(tint="#F1E9DC", rough=1.0),
    "jute":            dict(tint="#D8C6A8", rough=1.0),
    "marble":          dict(tex="marble_01", tile=1.0, tint="#FFFFFF", rough=0.25, nstr=0.2),
    "tile_grey":       dict(tex="tiled_floor_001", tile=1.2, tint="#D9D5CE", rough=0.6, nstr=0.4),
    "tile_warm":       dict(tex="tiled_floor_001", tile=1.2, tint="#E3D2BC", rough=0.65, nstr=0.4),
    "cabinet_white":   dict(tint="#ECE9E4", rough=0.4),
    "parapet":         dict(tint="#DDD8D0", rough=0.95),
    "black_metal":     dict(tint="#1F1E1D", rough=0.45, metal=0.7),
    "alu_dark":        dict(tint="#3A3936", rough=0.4, metal=0.8),
    "brass":           dict(tint="#C2A36E", rough=0.3, metal=1.0),
    "steel":           dict(tint="#CFCFCC", rough=0.22, metal=1.0),
    "ceramic":         dict(tint="#EDE7DD", rough=0.28),
    "ceramic_dark":    dict(tint="#4A4542", rough=0.35),
    "tv_screen":       dict(tint="#0A0A0B", rough=0.06),
    "plastic_black":   dict(tint="#202020", rough=0.5),
    "art":             dict(tex="art_canvas", tile=1.0, tint="#FFFFFF", rough=0.8, uvfit=True),
    "glass":           dict(tint="#E9EFEF", rough=0.03, kind="glass", lm=False),
    "sheer":           dict(tint="#F7F4EE", rough=1.0, kind="sheer"),
    "led":             dict(tint="#FFE2B8", kind="emissive", emit="#FFC98A", estr=12.0, lm=False),
    "lens":            dict(tint="#FFF3DE", kind="emissive", emit="#FFD8A0", estr=40.0, lm=False),
    "shade_linen":     dict(tint="#F1E7D6", kind="shade", emit="#FFD3A0", estr=3.0, lm=False),
    "paper":           dict(tint="#F6EFE3", kind="shade", emit="#FFD6A6", estr=3.5, lm=False),
    "ground":          dict(tint="#6E7566", rough=1.0, lm=False),
}


def lm_atlas_of(objname):
    return "arch" if objname.startswith("A_") else "furn"


def load_home():
    with open(HOME_JSON, encoding="utf-8") as f:
        return json.load(f)


def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xi:
                inside = not inside
    return inside


def poly_area(poly):
    a = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def inset_rect_poly(poly, d):
    """Inset a rectilinear (axis-aligned) polygon by d (cm). Works for convex & concave L-shapes."""
    n = len(poly)
    s = 1.0 if poly_area(poly) > 0 else -1.0          # orientation in plan coords (y down)
    lines = []
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy) or 1.0
        # inward normal for positive-area (CW on screen with y-down) polygons is (-dy, dx)/L * s
        nx, ny = -dy / L * s, dx / L * s
        lines.append(((x1 + nx * d, y1 + ny * d), (x2 + nx * d, y2 + ny * d)))
    out = []
    for i in range(n):
        (a1, a2), (b1, b2) = lines[i - 1], lines[i]
        out.append(_intersect(a1, a2, b1, b2))
    return out


def _intersect(p1, p2, p3, p4):
    x1, y1 = p1; x2, y2 = p2; x3, y3 = p3; x4, y4 = p4
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9:
        return p2
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


def dedupe_poly(poly):
    """drop collinear / duplicate vertices"""
    out = []
    n = len(poly)
    for i in range(n):
        a, b, c = poly[i - 1], poly[i], poly[(i + 1) % n]
        if abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6:
            continue
        cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cross) < 1e-6:
            continue
        out.append(b)
    return out


def write_materials_json(path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(MATS, f, ensure_ascii=False, indent=1)
