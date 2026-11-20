"""Architecture: floors, walls w/ openings, frames, sliding doors, parapets, ceiling,
cove LED strips, track heads, ground, outdoor light cards. Reads home.json.
All object names prefixed A_ -> atlas 'arch'.
"""
import bpy, math
from mathutils import Matrix
from common import load_home, MATS, P
import geo as G

WALL_H = 280.0
CEIL_H = 275.0
INC = {"living", "foyer", "kitchen", "balcony"}


def _room_map(H):
    return {r["id"]: r for r in H["rooms"]}


def build(H, mats):
    M = mats
    rooms = _room_map(H)
    # ---- ground plane (outside balcony) ----
    G.box("A_ground", 435, 1220, -160, 1300, 1400, 10, "ground", None, bevel=0)

    # ---- floors: one inset slab per included room ----
    for rid in INC:
        r = rooms[rid]
        poly = r["poly"]
        mat = {"oak": "floor_oak"}.get(r.get("floor"), "floor_oak")
        if rid in ("kitchen",):
            mat = "tile_grey"
        if rid == "balcony":
            mat = "tile_warm"
        G.floor_poly(f"A_floor_{rid}", poly, 0, mat, "arch", up=True, thickness_cm=8)

    # ---- walls (split by openings), side-material assignment ----
    for w in H["walls"]:
        _wall(w, rooms, M)
        if w.get("parapet"):
            L = math.hypot(w["b"][0] - w["a"][0], w["b"][1] - w["a"][1])
            ang = _ang(w)
            cx, cy = (w["a"][0] + w["b"][0]) / 2, (w["a"][1] + w["b"][1]) / 2
            G.box(f"A_rail_{w['id']}_glass", cx, cy, w["parapet"] + 48, L - 8, 2, 96,
                  "glass", "arch", rot_deg=ang, bevel=0)
            G.box(f"A_rail_{w['id']}_top", cx, cy, w["parapet"] + 98, L, 6, 4,
                  "alu_dark", "arch", rot_deg=ang, bevel=0.2)
            for k in range(int(L // 150) + 1):
                tt = 4 + 150 * k
                x, y = _at(w, min(tt, L - 4))
                G.box(f"A_rail_{w['id']}_p{k}", x, y, w["parapet"] + 48, 5, 6, 96,
                      "alu_dark", "arch", rot_deg=ang, bevel=0.2)

    # ---- ceiling + cove for indoor rooms ----
    for rid in ("living", "foyer", "kitchen"):
        r = rooms[rid]
        G.floor_poly(f"A_ceil_{rid}", r["poly"], CEIL_H, "ceiling", "arch", up=False, thickness_cm=6)
    # balcony no ceiling; studio/master etc. not in pilot

    _cove(rooms)
    _tracks(H)

    # ---- outdoor backdrop behind the balcony (soft sky/trees seen through glass) ----
    _backdrop()


def _side_room(w, rooms):
    """Return (leftMat, rightMat) for wall a->b (left = north side when walking east)."""
    ax, ay = w["a"]; bx, by = w["b"]
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy) or 1
    nx, ny = dy / L, -dx / L          # plan left normal (north for an east-heading wall)
    def at(tx, ty):
        for rid in INC:
            r = rooms[rid]
            from common import point_in_poly
            if point_in_poly(tx, ty, r["poly"]):
                return _wall_mat(rid, r, w)
        return None
    lm = at(ax + nx * 16, ay + ny * 16)
    rm = at(ax - nx * 16, ay - ny * 16)
    return lm, rm


def _wall_mat(rid, r, w):
    if rid == "kitchen":
        return "wall_keep"
    if rid == "balcony":
        return "parapet"
    return {"wall_terracotta": "wall_terracotta", "wall_warmwhite": "wall_keep",
            "wall_keep": "wall_keep"}.get(r.get("wall"), "wall_keep")


def _solid_segments(w):
    """Yield (t0,t1,kind) solid runs; openings in between. kind determines material pieces."""
    L = math.hypot(w["b"][0] - w["a"][0], w["b"][1] - w["a"][1])
    ops = sorted(w.get("openings", []), key=lambda o: o["at"])
    cur = 0.0
    for o in ops:
        t0 = max(0.0, o["at"] - o["w"] / 2.0)
        t1 = min(L, o["at"] + o["w"] / 2.0)
        if t0 > cur:
            yield cur, t0, "full", None
        yield t0, t1, "open", o
        cur = t1
    if cur < L:
        yield cur, L, "full", None


def _ang(w):
    return math.degrees(math.atan2(w["b"][1] - w["a"][1], w["b"][0] - w["a"][0]))


def _at(w, t):
    ax, ay = w["a"]
    L = math.hypot(w["b"][0] - ax, w["b"][1] - ay) or 1
    return ax + (w["b"][0] - ax) * t / L, ay + (w["b"][1] - ay) * t / L


def _wall(w, rooms, M):
    t = w["t"]
    ang = _ang(w)
    L = math.hypot(w["b"][0] - w["a"][0], w["b"][1] - w["a"][1])
    lm, rm = _side_room(w, rooms)
    if not lm and not rm:
        return
    matl = lm or rm
    matr = rm or lm
    parapet = w.get("parapet")

    for t0, t1, kind, o in _solid_segments(w):
        segL = t1 - t0
        if segL <= 0.5:
            continue
        cx, cy = _at(w, (t0 + t1) / 2.0)
        dx, dy = (w["b"][0] - w["a"][0]) / L * segL, (w["b"][1] - w["a"][1]) / L * segL
        # plan-oriented box: use rotation so local X = along wall
        rot = ang
        if kind == "full":
            if parapet:
                _double_face_box(f"A_w_{w['id']}_{int(t0)}", cx, cy, parapet / 2, segL, t, parapet,
                                 rot, matl, matr)
            else:
                _double_face_box(f"A_w_{w['id']}_{int(t0)}", cx, cy, WALL_H / 2, segL, t, WALL_H,
                                 rot, matl, matr)
            continue
        # opening pieces
        sill = o.get("sill", 0)
        top = sill + o["h"]
        if sill > 0.5:
            _double_face_box(f"A_w_{w['id']}_{int(t0)}_sill", cx, cy, sill / 2, segL, t, sill, rot, matl, matr)
        if top < WALL_H - 0.5:
            _double_face_box(f"A_w_{w['id']}_{int(t0)}_head", cx, cy, (top + WALL_H) / 2, segL, t, WALL_H - top,
                             rot, matl, matr)
        _opening_frame(w, o, t0, t1, cx, cy, rot, matl, matr)


def _double_face_box(name, cx, cy, zc, sx, sy, sz, rot, matl, matr):
    """A wall piece: core box + two 2cm skins offset in PLAN coords, one material per face."""
    G.box(name, cx, cy, zc, sx, sy, sz, "wall_keep", "arch", rot_deg=rot, bevel=0)
    ang = math.radians(rot)
    nx, ny = math.sin(ang), -math.cos(ang)         # plan left normal (matches _side_room)
    th = sy
    for side, mat in ((1, matl), (-1, matr)):
        G.box(name + ("_L" if side > 0 else "_R"),
              cx + nx * (th / 2 - 1) * side, cy + ny * (th / 2 - 1) * side,
              zc, sx, 2, sz, mat, "arch", rot_deg=rot, bevel=0)


def _opening_frame(w, o, t0, t1, cx, cy, rot, matl, matr):
    Lw = t1 - t0
    kind = o["type"]
    if kind in ("window", "bay"):
        sill = o.get("sill", 90); h = o["h"]
        if kind == "bay":
            _bay(w, o, rot)
        # frame: sill slab + head + 2 jambs + mullion + glass
        G.box(f"A_fr_{w['id']}_{int(t0)}_glass", cx, cy, sill + h / 2, max(Lw - 6, 4), 2, h - 8,
              "glass", "arch", rot_deg=rot, bevel=0)
        for k, (off, szx) in enumerate([(-Lw / 2 + 2.5, 5), (Lw / 2 - 2.5, 5)]):
            G.box(f"A_fr_{w['id']}_{int(t0)}_j{k}", _at(w, t0 + off)[0], _at(w, t0 + off)[1],
                  sill + h / 2, 5, 8, h, "door_paint", "arch", rot_deg=rot, bevel=0.4, seg=2)
        G.box(f"A_fr_{w['id']}_{int(t0)}_head", cx, cy, sill + h - 2.5, Lw, 8, 5, "door_paint",
              "arch", rot_deg=rot, bevel=0.4)
        G.box(f"A_fr_{w['id']}_{int(t0)}_sillf", cx, cy, sill + 2.5, Lw, 8, 5, "door_paint",
              "arch", rot_deg=rot, bevel=0.4)
        if Lw > 120:
            G.box(f"A_fr_{w['id']}_{int(t0)}_mul", cx, cy, sill + h / 2, 6, 6, h - 8,
                  "door_paint", "arch", rot_deg=rot, bevel=0.3)
    elif kind == ("door", "entry"):
        _panel_door(w, o, t0, t1, rot)
    elif kind == "slider":
        _slider(w, o, t0, t1, rot)


def _panel_door(w, o, t0, t1, rot):
    """Hinged leaf built in closed position then mesh-rotated 35° around the hinge vertical axis."""
    Lw = o["w"]; h = o["h"]
    cx, cy = _at(w, o["at"])
    G.box(f"A_dr_{w['id']}_frame", cx, cy, h / 2, Lw + 10, 8, 8, "door_paint", "arch", rot_deg=rot, bevel=0.4)
    G.box(f"A_dr_{w['id']}_lj", _at(w, t0 + 3)[0], _at(w, t0 + 3)[1], h / 2, 6, 8, h, "door_paint",
          "arch", rot_deg=rot, bevel=0.4)
    G.box(f"A_dr_{w['id']}_rj", _at(w, t1 - 3)[0], _at(w, t1 - 3)[1], h / 2, 6, 8, h, "door_paint",
          "arch", rot_deg=rot, bevel=0.4)

    hinge_b = o.get("hinge") == "b"
    swing = o.get("swingTo")
    hx, hy = _at(w, (t1 - 2) if hinge_b else (t0 + 2))
    dx, dy = (w["b"][0] - w["a"][0]), (w["b"][1] - w["a"][1])
    L = math.hypot(dx, dy) or 1
    ux, uy = dx / L, dy / L
    half = (Lw - 4) / 2.0
    leaf_cx = hx + ux * half
    leaf_cy = hy + uy * half
    leaf = G.box(f"A_dr_{w['id']}_leaf", leaf_cx, leaf_cy, h / 2, Lw - 4, 4, h - 4, "oak",
                 "arch", rot_deg=rot, bevel=0.2)
    # rotate mesh around plan hinge point (clockwise/open angle); open away from living side
    import bmesh
    from mathutils import Vector
    sign = -1 if swing in ("N", "W") else 1
    open_ang = math.radians(38) * sign
    bm = bmesh.new(); bm.from_mesh(leaf.data)
    pivot = Vector(G.P(hx, hy, 0))
    bx_, by_ = _at(w, (t0 + 4) if hinge_b else (t1 - 4))
    # transform world->local of leaf first is messy; instead rotate whole object about world pivot:
    bm.free()
    _rotate_about_world_z(leaf, Vector(G.P(hx, hy, 0)), -open_ang)   # blender Z rotation sign
    # free-edge handle
    fx, fy = _at(w, (t0 + 4) if hinge_b else (t1 - 4))
    G.box(f"A_dr_{w['id']}_handle", fx, fy, 105, 4, 6, 14, "black_metal", "arch", rot_deg=rot, bevel=0.3)


def _rotate_about_world_z(ob, pivot, ang):
    me = ob.data
    inv = ob.matrix_world.copy()
    # Bake object transform to world, rotate about pivot in world space, keep matrix identity offset.
    ob.location = ob.location
    m = ob.matrix_world
    R = Matrix.Rotation(ang, 4, 'Z')
    T1 = Matrix.Translation(pivot)
    mw_new = T1 @ R @ T1.inverted() @ m
    ob.matrix_world = mw_new


def _slider(w, o, t0, t1, rot):
    Lw = o["w"]; h = o["h"]
    cx, cy = _at(w, o["at"])
    n = 4 if Lw > 300 else 2
    # fixed outer frame
    G.box(f"A_sl_{w['id']}_top", cx, cy, h - 3, Lw, 10, 6, "alu_dark", "arch", rot_deg=rot, bevel=0.2)
    G.box(f"A_sl_{w['id']}_bot", cx, cy, 3, Lw, 10, 6, "alu_dark", "arch", rot_deg=rot, bevel=0.2)
    for k in range(n + 1):
        tt = t0 + Lw * k / n
        x, y = _at(w, tt)
        G.box(f"A_sl_{w['id']}_v{k}", x, y, h / 2, 5, 10, h, "alu_dark", "arch", rot_deg=rot, bevel=0.2)
    # glass panes; center two offset & open when n==4
    for k in range(n):
        a = t0 + Lw * k / n; b = t0 + Lw * (k + 1) / n
        off = 0
        if n == 4 and k in (1, 2):
            off = 12 * (1 if k == 1 else -1)
        xm, ym = _at(w, (a + b) / 2)
        ang = math.radians(rot); nx, ny = -math.sin(ang), math.cos(ang)
        G.box(f"A_sl_{w['id']}_g{k}", xm + nx * off, ym + ny * off, h / 2, Lw / n - 4, 2, h - 10,
              "glass", "arch", rot_deg=rot, bevel=0)


def _bay(w, o, rot):
    # simple cantilevered bay window block (sill slab + side returns + glass + top)
    cx, cy = _at(w, o["at"]); depth = o.get("depth", 40); Lw = o["w"]
    ang = math.radians(rot); nx, ny = -math.sin(ang), math.cos(ang)
    G.box(f"A_bay_{w['id']}_sill", cx + nx * depth / 2, cy + ny * depth / 2, o.get("sill", 45) - 4,
          Lw, depth, 8, "wall_keep", "arch", rot_deg=rot, bevel=0.3)
    G.box(f"A_bay_{w['id']}_top", cx + nx * depth / 2, cy + ny * depth / 2,
          o.get("sill", 45) + o["h"] + 2, Lw, depth, 10, "wall_keep", "arch", rot_deg=rot, bevel=0.3)
    G.box(f"A_bay_{w['id']}_glass", cx + nx * depth, cy + ny * depth, o.get("sill", 45) + o["h"] / 2,
          Lw, 3, o["h"], "glass", "arch", rot_deg=rot, bevel=0)


def _cove(rooms):
    # warm LED strips along ceiling perimeter of living room, 12cm in from walls
    r = rooms["living"]
    from common import inset_rect_poly, dedupe_poly
    poly = dedupe_poly(inset_rect_poly(r["poly"], 12))
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        seg = math.hypot(x2 - x1, y2 - y1)
        if seg < 30:
            continue
        ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
        G.box(f"A_cove_{i}", (x1 + x2) / 2, (y1 + y2) / 2, CEIL_H - 12, seg, 4, 3,
              "led", "arch", rot_deg=ang, bevel=0)


def _tracks(H):
    # magnetic tracks from home.json; emitters + heads
    for i, tr in enumerate(H.get("lighting", {}).get("tracks", [])):
        ax, ay = tr["a"]; bx, by = tr["b"]
        seg = math.hypot(bx - ax, by - ay)
        ang = math.degrees(math.atan2(by - ay, bx - ax))
        G.box(f"A_track_{i}", (ax + bx) / 2, (ay + by) / 2, CEIL_H - 6, seg, 3, 4,
              "black_metal", "arch", rot_deg=ang, bevel=0.3)
        for k in range(3):
            t = (k + 0.5) / 3
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            G.box(f"A_track_{i}_head{k}", x, y, CEIL_H - 13, 7, 7, 10, "lens", "arch",
                  rot_deg=0, bevel=0.5)


def _backdrop():
    # soft vertical plane beyond south balcony -> distant greenery, unlit emissive handled by HDRI instead.
    pass
