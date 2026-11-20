"""Place CC0 Poly Haven plant glTFs + outdoor greenery.
Imported assets keep their own PBR materials (tagged keep=True -> no lightmap, no export textures).
"""
import bpy, os, math
from common import load_home, ASSETS

# furniture 'plant' items -> (model dir, keep suffix filter, target height cm)
PLANT_MAP = {
    "琴叶榕": ("pachira_aquatica_01", ("d",), 165.0),
    "绿植": ("potted_plant_02", (), 72.0),
}
NAME_FALLBACK = {
    805: ("pachira_aquatica_01", ("d",), 165.0),
    845: ("calathea_orbifolia_01", ("b",), 60.0),
    410: ("potted_plant_02", (), 62.0),
    36: ("potted_plant_02", (), 80.0),
}


def build(H, outdoor=True):
    items = [f for f in H["furniture"] if f["kind"] == "plant"]
    n = 0
    for f in items:
        if f["room"] not in ("living", "foyer", "balcony"):
            continue
        n += 1
        key, keep, target_h = _pick(f)
        _place(f"F_plant_{n}", f["x"], f["y"], f.get("rot", 0), key, keep, target_h,
               extra_scale=f.get("s", 1.0))
    if outdoor:
        _outdoor_trees()


def _pick(f):
    if f["name"] == "琴叶榕":
        return PLANT_MAP["琴叶榕"]
    nf = NAME_FALLBACK.get(f["x"])
    if nf:
        return nf
    return ("potted_plant_02", (), 70.0)


def _import(model_id, keep_suffixes):
    path = os.path.join(ASSETS, "models", model_id, f"{model_id}.gltf")
    before = set(bpy.data.objects)
    mats_before = set(bpy.data.materials)
    bpy.ops.import_scene.gltf(filepath=path)
    new_objs = [o for o in bpy.context.scene.objects if o not in before]
    for m in bpy.data.materials:
        if m not in mats_before:
            m["keep"] = True
    if not keep_suffixes:
        # potted_plant_02 / 04 style: drop shadow/ground catchers only
        for o in list(new_objs):
            if o.type == 'MESH' and "ground" in o.name.lower():
                _remove(o)
                new_objs.remove(o)
        roots = [o for o in new_objs if o.parent is None]
        return new_objs, roots
    # multi-variant scans: keep only named variant letters
    keep_objs = []
    for o in list(new_objs):
        nm = o.name
        letter = None
        for suf in ("_a", "_b", "_c", "_d", "_e"):
            if nm.endswith(suf) or suf + "." in nm or suf + "_" in nm:
                letter = suf[1]
        if letter is None:
            keep_objs.append(o)            # shared root etc.
        elif letter in keep_suffixes:
            keep_objs.append(o)
        else:
            _remove(o)
    roots = [o for o in keep_objs if o.parent is None]
    return keep_objs, roots


def _remove(o):
    for c in list(o.children):
        _remove(c)
    bpy.data.objects.remove(o, do_unlink=True)


def _bbox(objs):
    import mathutils
    zs = []
    mins = [1e9, 1e9]; maxs = [-1e9, -1e9]
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            zs.append(w.z)
            mins[0] = min(mins[0], w.x); mins[1] = min(mins[1], w.y)
            maxs[0] = max(maxs[0], w.x); maxs[1] = max(maxs[1], w.y)
    return mins, maxs, (min(zs), max(zs))


def _place(name, x, y, rot, model_id, keep_suffixes, target_h, extra_scale=1.0, z=0.0):
    objs, roots = _import(model_id, keep_suffixes)
    if not roots:
        return
    # normalize: measure world bbox of variant, recenter to origin floor, scale to target
    mins, maxs, (z0, z1) = _bbox(objs)
    s = (target_h / 100.0) / max(z1 - z0, 1e-6)
    cx = (mins[0] + maxs[0]) / 2; cy = (mins[1] + maxs[1]) / 2
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    root.location = (x / 100.0, -y / 100.0, z / 100.0)
    root.rotation_euler[2] = -math.radians(rot)
    root["lm_atlas"] = "none"
    # normalization empty in root local space: shift + scale imported model
    off = bpy.data.objects.new(name + "_norm", None)
    bpy.context.scene.collection.objects.link(off)
    off.parent = root
    from mathutils import Matrix
    off.matrix_parent_inverse = Matrix.Identity(4)
    off.location = (-cx, -cy, -z0)
    off.scale = (s, s, s)
    # reparent imported roots under off, preserving their world transform
    for o in roots:
        wm = o.matrix_world.copy()
        o.parent = off
        o.matrix_parent_inverse = off.matrix_world.inverted()
        o.matrix_world = wm
    # tag meshes: no lightmap
    for o in objs:
        if o.type == 'MESH':
            o["lm_atlas"] = "none"
            o["asset_plant"] = True
    return root


def _outdoor_trees():
    # greenery beyond the south balcony (only seen through glass; not exported, no lightmap UV needed)
    spots = [(260, 1130, 240), (560, 1180, 280), (820, 1150, 230), (120, 1080, 190), (700, 1260, 260)]
    for i, (x, y, h) in enumerate(spots):
        _place(f"X_tree_{i}", x, y, 0, "pachira_aquatica_01", ("c", "d"), h)
    # hedge strip
    for i, x in enumerate(range(60, 900, 90)):
        _place(f"X_hedge_{i}", x, 1075, 0, "calathea_orbifolia_01", ("c",), 70)
    # tag outdoor objects so export/bake can skip
    for o in bpy.data.objects:
        if o.name.startswith("X_"):
            o["outdoor"] = True
            if o.type == 'MESH':
                o["lm_atlas"] = "none"
