"""PBR material builder (Blender 4.x/5.x Principled, Cycles).
Node layout keeps a BAKE_MIX node (factor 0 = textured final, 1 = flat emissive-free albedo for bake).
Web viewer rebuilds the equivalent graph from common.MATS; the glTF export carries no our-textures.
"""
import bpy, os
from common import MATS, TEX, hex2lin


def img(path, noncolor=False):
    im = bpy.data.images.load(path, check_existing=True)
    try:
        im.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    except TypeError:
        pass
    return im


_cache = {}


def tex_paths(prefix):
    d = {}
    for tag, suffixes in (("diff", ("_Diffuse", "_detail")), ("nrm", ("_nor_gl",)), ("rgh", ("_Rough",))):
        for s in suffixes:
            for ext in ("jpg", "png"):
                p = os.path.join(TEX, f"{prefix}{s}.{ext}")
                if os.path.exists(p):
                    d[tag] = p; break
        # fall back: Poly Haven downloads may keep _1k suffix in name? no.
    return d


def build():
    mats = {}
    for key, spec in MATS.items():
        mats[key] = _build_one(key, spec)
    return mats


def _new_principled(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (300, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m, nt, out, bsdf


def _build_one(key, spec):
    kind = spec.get("kind", "opaque")
    m, nt, out, bsdf = _new_principled(key)
    tint = hex2lin(spec.get("tint", "#FFFFFF"))

    if kind == "emissive":
        em = nt.nodes.new("ShaderNodeEmission"); em.location = (300, -200)
        em.inputs["Color"].default_value = hex2lin(spec["emit"])
        em.inputs["Strength"].default_value = spec.get("estr", 10.0)
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
        m["kind"] = "emissive"; m["estr"] = spec.get("estr", 10.0)
        return m

    bsdf.inputs["Metallic"].default_value = spec.get("metal", 0.0)
    bsdf.inputs["Roughness"].default_value = spec.get("rough", 0.6)

    if kind == "shade":
        bsdf.inputs["Emission Color"].default_value = hex2lin(spec["emit"])
        bsdf.inputs["Emission Strength"].default_value = spec.get("estr", 3.0)
        m["kind"] = "shade"; m["estr"] = spec.get("estr", 3.0)

    color_node = None
    prefix = spec.get("tex")
    paths = tex_paths(prefix) if prefix else {}
    if prefix == "art_canvas":
        p = os.path.join(os.path.dirname(TEX), "art_canvas.jpg")
        if os.path.exists(p):
            t = nt.nodes.new("ShaderNodeTexImage"); t.location = (-600, 100); t.image = img(p)
            color_node = t.outputs["Color"]

    if "diff" in paths:
        t = nt.nodes.new("ShaderNodeTexImage"); t.location = (-600, 100); t.image = img(paths["diff"])
        color_node = t.outputs["Color"]
    if "nrm" in paths:
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.location = (-600, -150); tn.image = img(paths["nrm"], True)
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.location = (-200, -250)
        nm.inputs["Strength"].default_value = spec.get("nstr", 0.7)
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if "rgh" in paths:
        tr = nt.nodes.new("ShaderNodeTexImage"); tr.location = (-600, -380); tr.image = img(paths["rgh"], True)
        mul = nt.nodes.new("ShaderNodeMath"); mul.operation = 'MULTIPLY'; mul.location = (-200, -420)
        mul.inputs[0].default_value = spec.get("rough", 0.8)
        nt.links.new(tr.outputs["Color"], mul.inputs[1])
        nt.links.new(mul.outputs[0], bsdf.inputs["Roughness"])

    # BAKE_MIX: factor 0 -> textured/real colour; factor 1 -> flat tint (albedo bake, emission-free)
    rgb = nt.nodes.new("ShaderNodeRGB"); rgb.location = (-600, -560)
    rgb.outputs["Color"].default_value = tint
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.name = "BAKE_MIX"
    mix.location = (-100, 120); mix.inputs[0].default_value = 0.0
    if color_node is not None:
        nt.links.new(color_node, mix.inputs[6])
    else:
        mix.inputs[6].default_value = tint
    nt.links.new(rgb.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])

    if kind == "glass":
        bsdf.inputs["Transmission Weight"].default_value = 1.0
        bsdf.inputs["IOR"].default_value = 1.45
        bsdf.inputs["Roughness"].default_value = 0.04
        bsdf.inputs["Alpha"].default_value = 1.0
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass
        try: m.blend_method = 'BLEND'
        except Exception: pass
        m["kind"] = "glass"
    elif kind == "sheer":
        bsdf.inputs["Alpha"].default_value = 0.32
        bsdf.inputs["Sheen Weight"].default_value = 0.3
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass
        try: m.blend_method = 'BLEND'
        except Exception: pass
        m["kind"] = "sheer"
    else:
        m["kind"] = "opaque"
    m["mat_id"] = key
    return m


def set_bake_mode(on):
    """on=True: flat albedo, no emission (Diffuse bake). False: restore final look."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        mix = m.node_tree.nodes.get("BAKE_MIX")
        if mix:
            mix.inputs[0].default_value = 1.0 if on else 0.0
        if m.get("kind") in ("shade",) and not m.is_grease_pencil:
            bsdf = next((n for n in m.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
            if bsdf:
                bsdf.inputs["Emission Strength"].default_value = 0.0 if on else m.get("estr", 3.0)
        if m.get("kind") == "emissive":
            for n in m.node_tree.nodes:
                if n.bl_idname == "ShaderNodeEmission":
                    n.inputs["Strength"].default_value = 0.0 if on else m.get("estr", 10.0)


def set_emission_night(on):
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        if m.get("kind") == "shade":
            bsdf = next((n for n in m.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
            if bsdf:
                bsdf.inputs["Emission Strength"].default_value = m.get("estr", 3.0) if on else 0.0
        elif m.get("kind") == "emissive":
            for n in m.node_tree.nodes:
                if n.bl_idname == "ShaderNodeEmission":
                    n.inputs["Strength"].default_value = m.get("estr", 10.0) if on else 0.0


def strip_for_export():
    """Replace our materials with plain white before glTF export (viewer reattaches real ones)."""
    keys = set(MATS.keys())
    for m in bpy.data.materials:
        if m.name in keys:
            nt = m.node_tree; nt.nodes.clear()
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
            nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
