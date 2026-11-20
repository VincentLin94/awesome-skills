"""Geometry builders shared by build_scene.py.
Plan coords (cm) -> blender coords (m) via P(). All meshes are created with UV0 in metres
(box/rect: x/y span; floor polygons: planar metric coordinates), so web texture repeat
needs only a scale multiplier; furniture parts: face size in metres.
Every mesh also carries a UV1 placeholder (filled by bake.py) and custom props
lm_atlas ('arch'|'furn'), mat_id, part name.
"""
import bmesh, bpy, math
from mathutils import Matrix, Vector


def _assign(me, mat_id):
    m = bpy.data.materials.get(mat_id)
    if m is not None and m.name not in [x.name for x in me.materials]:
        me.materials.append(m)


def P(x, y, z=0.0):
    return (x / 100.0, -y / 100.0, z / 100.0)


def _bm():
    bm = bmesh.new()
    return bm


def new_mesh(name, verts, faces, uv0m=None, objname=None, mat_id=None, atlas=None):
    """verts: blender-space metric tuples. faces: index tuples. uv0m: [(u,v) per vert] optional."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if uv0m is not None:
        uv = me.uv_layers.new(name="UVMap")
        for loop in me.loops:
            uv.data[loop.index].uv = uv0m[loop.vertex_index]
    else:
        _box_uv_metres(me)
    lm = me.uv_layers.new(name="LM")
    ob = bpy.data.objects.new(objname or name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat_id:
        ob["mat_id"] = mat_id
    if atlas:
        ob["lm_atlas"] = atlas
    return ob


def _box_uv_metres(me):
    """Projected planar UV per face: face-local X/Z or X/Y span in metres, shared vert gets per-loop uv."""
    uv = me.uv_layers.new(name="UVMap")
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        for loop in f.loops:
            co = loop.vert.co
            if abs(n.z) > 0.5:
                uvco = (co.x, co.y)          # top/bottom
            elif abs(n.y) > 0.5:
                uvco = (co.x, co.z)          # ±Y faces
            else:
                uvco = (co.y, co.z)
            loop[uvl].uv = uvco
    bm.to_mesh(me); bm.free()


# ----------------------------------------------------------------------------
def box(name, cx, cy, cz_cm, sx_cm, sy_cm, sz_cm, mat_id, atlas, rot_deg=0.0, bevel=0.0, seg=2):
    """center cx,cy plan cm; cz_cm = center height cm; sizes cm; rot clockwise deg."""
    sx, sy, sz = sx_cm / 100.0, sy_cm / 100.0, sz_cm / 100.0
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sy, sz)), verts=bm.verts)
    if bevel > 0:
        b = min(bevel / 100.0, sx * 0.45, sy * 0.45, sz * 0.45)
        try:
            geom = bmesh.ops.bevel(bm, geom=bm.verts[:], offset=b, segments=seg, profile=0.5,
                                  affect='VERTICES', harden_normals=True)
        except Exception:
            pass
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    _box_uv_metres(me); me.uv_layers.new(name="LM")
    _assign(me, mat_id)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = P(cx, cy, cz_cm)
    ob.rotation_euler[2] = -math.radians(rot_deg)     # plan CW -> blender CCW about Z
    ob["mat_id"] = mat_id; ob["lm_atlas"] = atlas
    return ob


def local_box(parent, name, lx, ly, lz, sx, sy, sz, mat_id, bevel=0.0, seg=2):
    """Add a box as child of parent; all args in metres; local origin at floor center."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sy, sz)), verts=bm.verts)
    if bevel > 0:
        b = min(bevel, sx * 0.45, sy * 0.45, sz * 0.45)
        try:
            bmesh.ops.bevel(bm, geom=bm.verts[:], offset=b, segments=seg, profile=0.5,
                           affect='VERTICES', harden_normals=True)
        except Exception:
            pass
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    _box_uv_metres(me); me.uv_layers.new(name="LM")
    _assign(me, mat_id)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.location = Vector((lx, -ly, lz))          # local uses plan convention: x east, y south
    ob["mat_id"] = mat_id
    ob["lm_atlas"] = parent.get("lm_atlas", "furn")
    return ob


def cylinder(name, cx, cy, z0_cm, r_cm, h_cm, mat_id, atlas, rot_deg=0.0, verts=24, r2_cm=None):
    bm = bmesh.new()
    if r2_cm is None:
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                              radius1=r_cm / 100.0, radius2=r_cm / 100.0, depth=h_cm / 100.0)
    else:
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                              radius1=r_cm / 100.0, radius2=r2_cm / 100.0, depth=h_cm / 100.0)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    _box_uv_metres(me); me.uv_layers.new(name="LM")
    _assign(me, mat_id)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = P(cx, cy, z0_cm + h_cm / 2.0)
    ob.rotation_euler[2] = -math.radians(rot_deg)
    ob["mat_id"] = mat_id; ob["lm_atlas"] = atlas
    return ob


def local_cyl(parent, name, lx, ly, lz, r, h, mat_id, verts=24, r2=None, axis='Z'):
    bm = bmesh.new()
    if r2 is None:
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r, radius2=r, depth=h)
    else:
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r, radius2=r2, depth=h)
    if axis == 'X':
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'), verts=bm.verts)
    elif axis == 'Y':
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'), verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    _box_uv_metres(me); me.uv_layers.new(name="LM")
    _assign(me, mat_id)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent; ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.location = Vector((lx, -ly, lz))
    ob["mat_id"] = mat_id; ob["lm_atlas"] = parent.get("lm_atlas", "furn")
    return ob


def local_sphere(parent, name, lx, ly, lz, rx, ry, rz, mat_id, seg=24, rings=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector((rx, ry, rz)), verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    _box_uv_metres(me); me.uv_layers.new(name="LM")
    _assign(me, mat_id)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent; ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.location = Vector((lx, -ly, lz))
    ob["mat_id"] = mat_id; ob["lm_atlas"] = parent.get("lm_atlas", "furn")
    return ob


def floor_poly(name, plan_poly, z_cm, mat_id, atlas, up=True, thickness_cm=None):
    """Floor/ceiling slab from plan polygon (cm). UV0 = planar metric coords."""
    bm = bmesh.new()
    pts = [P(x, y, 0) for x, y in plan_poly]
    vs = [bm.verts.new((x, y, 0)) for x, y, _ in pts]
    if up:
        f = bm.faces.new(vs)
    else:
        f = bm.faces.new(list(reversed(vs)))
    bm.normal_update()
    if thickness_cm:
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        bmesh.ops.translate(bm, vec=Vector((0, 0, -thickness_cm / 100.0)), verts=[e for e in r['geom'] if hasattr(e, 'co')])
    uvl = bm.loops.layers.uv.verify()
    for f2 in bm.faces:
        for loop in f2.loops:
            loop[uvl].uv = (loop.vert.co.x, loop.vert.co.y)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if not me.uv_layers.get("UVMap"):
        me.uv_layers.new(name="UVMap")
    me.uv_layers["UVMap"].active_render = True
    if not me.uv_layers.get("LM"):
        me.uv_layers.new(name="LM")
    _assign(me, mat_id)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location.z = z_cm / 100.0
    ob["mat_id"] = mat_id; ob["lm_atlas"] = atlas
    return ob
