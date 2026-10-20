# Renders each glb given side by side, posed on frame 10 of its `idle` animation, under two suns, to a
# PNG, so a bake's materials are seen as they are. A glb packed by gltfpack, as every bake of
# `anim.export.py` is, is first unpacked by `unpack_glb.mjs` beside this file (`node` on the PATH),
# since Blender's glTF importer refuses `EXT_meshopt_compression`.
#   Blender -b --factory-startup --python render_glb.py -- <out.png> <a.glb> [<b.glb> ...]
import bpy, sys, math, os, json, struct, subprocess, tempfile
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out, glbs = args[0], args[1:]
work = tempfile.mkdtemp(prefix='render-glb-')


def readable(g, i):
    """The glb itself, or an unpacked copy of it when gltfpack packed it."""
    data = open(g, 'rb').read()
    used = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]]).get('extensionsUsed', [])
    if 'EXT_meshopt_compression' not in used:
        return g
    plain = os.path.join(work, f'{i}.glb')
    subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'unpack_glb.mjs'), g, plain], check=True)
    return plain


bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for i, g in enumerate(glbs):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=readable(g, i))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    for o in new:
        if o.parent is None:
            o.location.x += i * 1.2
    idle = next(a for a in bpy.data.actions if a.name.startswith('idle'))
    arm.animation_data_create()
    for t in arm.animation_data.nla_tracks:
        t.mute = True
    arm.animation_data.action = idle
    slots = getattr(idle, 'slots', None)
    if slots:
        arm.animation_data.action_slot = slots[0]
sc.frame_set(10)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
cam.location = Vector(((len(glbs) - 1) * 0.6, -4.2, 1.1))
cam.rotation_euler = (math.radians(90), 0, 0)
cam.data.lens = 40
sc.camera = cam
for rot, e in (((math.radians(50), 0, math.radians(-30)), 3.0), ((math.radians(60), 0, math.radians(150)), 1.5)):
    l = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    l.data.energy = e
    l.rotation_euler = rot
    sc.collection.objects.link(l)
sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.38, 0.42, 1)
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1200, 900
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('RENDERED', out)
