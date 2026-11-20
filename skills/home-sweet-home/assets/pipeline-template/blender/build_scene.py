"""Assemble the pilot scene: architecture + furniture + CC0 plants/materials."""
import bpy, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from common import load_home, MATS, OUT, write_materials_json
import materials as M
import architecture, furniture, assets

_assembled = False


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.length_unit = 'METERS'


def assemble(outdoor=True):
    global _assembled
    if _assembled:
        return
    reset()
    H = load_home()
    mats = M.build()
    architecture.build(H, mats)
    furniture.build(H)
    assets.build(H, outdoor=outdoor)
    os.makedirs(OUT, exist_ok=True)
    write_materials_json(os.path.join(OUT, "materials.json"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "living.blend"))
    _assembled = True
    return H


if __name__ == "__main__":
    H = assemble()
    print("objects:", len(bpy.data.objects), "meshes:", len(bpy.data.meshes))
