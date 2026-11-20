"""World + lamps for day and night. All light objects live in collection LIGHTS
(no meshes -> not exported). Emissive mesh strips are driven separately by
materials.set_emission_night.
"""
import bpy, math
from mathutils import Vector


def clear_lights():
    for o in list(bpy.data.objects):
        if o.users_collection and o.name.startswith("L_"):
            bpy.data.objects.remove(o, do_unlink=True)
    if bpy.data.worlds:
        bpy.data.worlds.remove(bpy.data.worlds[0])


def _world():
    w = bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld"); out.location = (500, 0)
    bg = nt.nodes.new("ShaderNodeBackground"); bg.location = (250, 0)
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return w, nt, bg


def setup(mode, sky_strength=None, sun_strength=None):
    """mode: 'day' | 'night' | 'bake_day' | 'bake_night'"""
    clear_lights()
    bake = mode.startswith("bake")
    view_mode = "day" if mode.endswith("day") else "night"
    w, nt, bg = _world()

    if view_mode == "day":
        # Analytic sky: sun low from south (window side, plan +y), west a bit.
        sky = nt.nodes.new("ShaderNodeTexSky"); sky.location = (-200, 100)
        sky.sky_type = 'SINGLE_SCATTERING'
        sky.sun_elevation = math.radians(52)
        sky.sun_rotation = math.radians(165)
        sky.air_density = 1.0; sky.aerosol_density = 8.0
        sstr = sky_strength if sky_strength is not None else (0.9 if not bake else 1.2)
        sky.sun_intensity = sstr
        bg.inputs["Strength"].default_value = 0.18 if not bake else 0.05
        nt.links.new(sky.outputs[0], bg.inputs["Color"])
        _sun((600, 1120, 420), (470, 480, 60), 4.0 if not bake else 5.5)
        # soft fill from north windows / interior bounce
        _area((350, 360, 250), (350, 600, 80), 120, 1.2, (1.0, 0.96, 0.9))
    else:
        bg.inputs["Color"].default_value = (0.012, 0.018, 0.04, 1.0)
        bg.inputs["Strength"].default_value = 0.5 if not bake else 0.15
        _night_lamps(bake)
    return bake


def _sun(loc, target, energy):
    d = bpy.data.lights.new("L_sun", 'SUN'); d.energy = energy
    d.angle = math.radians(2.5); d.color = (1.0, 0.95, 0.85)
    o = bpy.data.objects.new("L_sun", d)
    bpy.context.scene.collection.objects.link(o)
    o.location = _b(loc)
    p = o.location - _b(target)
    o.rotation_euler = p.to_track_quat('-Z', 'Y').to_euler()
    return o


def _area(loc, target, size, energy, color):
    d = bpy.data.lights.new("L_fill", 'AREA'); d.energy = energy; d.size = size / 100.0
    d.color = color
    o = bpy.data.objects.new("L_fill", d)
    bpy.context.scene.collection.objects.link(o)
    o.location = _b(loc)
    p = o.location - _b(target)
    o.rotation_euler = p.to_track_quat('-Z', 'Y').to_euler()
    return o


def _point(loc, energy, radius=0.12, color=(1.0, 0.82, 0.58), name="L_pt"):
    d = bpy.data.lights.new(name, 'POINT'); d.energy = energy; d.shadow_soft_size = radius
    d.color = color
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location = _b(loc)
    return o


def _b(p):
    return Vector((p[0] / 100.0, -p[1] / 100.0, p[2] / 100.0))


def _night_lamps(bake):
    k = 1.0 if bake else 1.0
    # three track heads over living area
    for x in (600, 780):
        for t in (0.2, 0.5, 0.8):
            y = 450 + (740 - 450) * t
            d = bpy.data.lights.new("L_track", 'SPOT'); d.energy = 260 * k
            d.spot_size = math.radians(34); d.spot_blend = 0.55
            d.shadow_soft_size = 0.05; d.color = (1.0, 0.80, 0.55)
            o = bpy.data.objects.new("L_track", d)
            bpy.context.scene.collection.objects.link(o)
            o.location = _b((x, y, 262))
            o.rotation_euler = (math.radians(180), 0, 0)   # -Z -> world down
    # cove: several warm points near ceiling perimeter
    for (x, y) in [(300, 470), (480, 700), (760, 700), (940, 500), (560, 360), (320, 690), (720, 470)]:
        _point((x, y, 252), 26 * k, 0.3, name="L_cove")
    # dining pendant
    _point((340, 590, 200), 150 * k, 0.18, name="L_pendant")
    # floor lamp
    _point((545, 745, 142), 110 * k, 0.2, name="L_floor")
    # foyer fill + bar under-cabinet
    _point((470, 250, 250), 40 * k, 0.4, name="L_foyer")
    _point((258, 350, 120), 60 * k, 0.15, name="L_bar")
