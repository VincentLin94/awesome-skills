"""Camera presets + render settings."""
import bpy, math
from mathutils import Vector


def _b(p):
    return Vector((p[0] / 100.0, -p[1] / 100.0, p[2] / 100.0))


def _pc(p):
    """camera triple (x, height_cm, y_plan) -> blender"""
    return Vector((p[0] / 100.0, -p[2] / 100.0, p[1] / 100.0))


CAMS = {
    # plan cm triples (x,z_height_cm,y)
    "living":  ((232, 152, 738), (700, 100, 500), 28),
    "balcony": ((700, 150, 990), (430, 120, 560), 24),
    "dining":  ((150, 148, 700), (380, 105, 540), 30),
    "overview": ((1880, 1280, 1650), (620, 60, 560), 50),
}


def setup_camera(key):
    loc, look, lens = CAMS[key]
    d = bpy.data.cameras.new(f"C_{key}"); d.lens = lens
    d.sensor_width = 36
    o = bpy.data.objects.new(f"C_{key}", d)
    bpy.context.scene.collection.objects.link(o)
    o.location = _pc(loc)
    p = _pc(look) - o.location
    o.rotation_euler = p.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = o
    return o


def configure(engine='BLENDER_EEVEE', w=1600, h=1000, samples=64):
    sc = bpy.context.scene
    sc.render.engine = engine
    sc.render.resolution_x = w; sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
        sc.view_settings.exposure = 0.0
    except Exception:
        pass
    if engine.startswith('CYCLES'):
        sc.cycles.device = 'GPU'
        try:
            sc.cycles.samples = samples
            sc.cycles.use_denoising = True
        except Exception:
            pass
        try:
            sc.cycles.adaptive_threshold = 0.02
        except Exception:
            pass
    else:
        try:
            sc.eevee.taa_render_samples = samples
        except Exception:
            pass
