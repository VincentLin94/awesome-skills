"""Export living.glb: no lights/world; our materials replaced by white placeholders
keeping their names (viewer rebuilds PBR); plant materials stay intact.
"""
import bpy, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from common import OUT, MATS

bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, "living.blend"))

# remove lights
for o in list(bpy.data.objects):
    if o.name.startswith("L_"):
        bpy.data.objects.remove(o, do_unlink=True)
# no world
bpy.context.scene.world = None

# placeholder materials: white, but keep glass/sheer/emissive hints through name + alpha
for key, spec in MATS.items():
    m = bpy.data.materials.get(key)
    if not m:
        continue
    kind = spec.get("kind", "opaque")
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if kind == "glass":
        bsdf.inputs["Base Color"].default_value = (0.9, 0.95, 0.95, 1)
        bsdf.inputs["Roughness"].default_value = 0.05
        bsdf.inputs["Transmission Weight"].default_value = 1.0
        bsdf.inputs["Alpha"].default_value = 1.0
    elif kind == "sheer":
        bsdf.inputs["Base Color"].default_value = (0.95, 0.93, 0.9, 1)
        bsdf.inputs["Roughness"].default_value = 0.9
        bsdf.inputs["Alpha"].default_value = 0.35
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass

# select only mesh objects
for o in bpy.context.scene.objects:
    o.select_set(o.type == 'MESH')
glb = os.path.join(OUT, "living.glb")
bpy.ops.export_scene.gltf(
    filepath=glb, export_format='GLB', use_selection=True,
    export_apply=True, export_texcoords=True, export_extras=True,
    export_image_format='JPEG', export_image_quality=82,
    export_cameras=False, export_yup=True)
print("GLB", glb, os.path.getsize(glb) // 1024, "KB")
