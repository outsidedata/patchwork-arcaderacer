# What each FBX is: its armature, bone names, meshes and their materials, height, hip height,
# armature scale, action and images. Printed as one JSON line after "PROBE".
#   Blender -b --factory-startup --python probe_fbx.py -- <fbx> [<fbx> ...]
import bpy, sys, os, json
from mathutils import Vector

paths = sys.argv[sys.argv.index('--') + 1:]
out = {}
for p in paths:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.expanduser(p))
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    zs = [(m.matrix_world @ Vector(c)).z for m in meshes for c in m.bound_box]
    a = arms[0] if arms else None
    hips = next((b for b in a.pose.bones if b.name.endswith('Hips')), None) if a else None
    out[p] = {
        'armatures': [x.name for x in arms],
        'bones': [b.name for b in a.data.bones] if a else [],
        'meshes': [(m.name, len(m.data.vertices), [s.material.name if s.material else None for s in m.material_slots]) for m in meshes],
        'height': [min(zs), max(zs)] if zs else None,
        'hips_z': (a.matrix_world @ hips.head).z if hips else None,
        'scale': list(a.scale) if a else None,
        'action': a.animation_data.action.name if a and a.animation_data and a.animation_data.action else None,
        'images': [(i.name, list(i.size)) for i in bpy.data.images],
    }
print('PROBE ' + json.dumps(out))
