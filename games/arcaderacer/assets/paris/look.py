# The Paris kit's viewer: renders an exported glb in Blender's EEVEE under a low dusk sun and a
# twilight sky, so the asset is judged as itself before the game ever draws it. It imports the file,
# stands the objects named on the command line where the views want them, and writes one PNG a view:
#   street    a street of lots side by side at eye height, looking along it
#   bay       close on two bays of the first lot: balconies, windows, heads, the base
#   roofs     the roofscape from above at a slant: mansards, dormers, stacks
#   corner    the first corner lot from across its corner
#   lods      each lot's three levels side by side, front on
#   tower     the Eiffel Tower (with `eiffel.glb`) from 500 m; `towerfar` from 1100 m, `towerbase`
#             from under the arches
#   lamp      two street lamps (with `lamp.glb`) at eye height
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#       --python games/arcaderacer/assets/paris/look.py -- <file.glb> <out dir> <view> [<view> ...]
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT, VIEWS = args[0], args[1], args[2:]
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
scene = bpy.context.scene
objects = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
for o in objects.values():
    o.hide_render = True

for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        continue
scene.render.resolution_x, scene.render.resolution_y = 1600, 900
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0.3
try:
    scene.eevee.use_shadows = True
    scene.eevee.use_raytracing = True
except AttributeError:
    pass

world = bpy.data.worlds.new('dusk')
scene.world = world
world.use_nodes = True
nt = world.node_tree
sky = nt.nodes.new('ShaderNodeTexGradient')
coord = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
ramp = nt.nodes.new('ShaderNodeValToRGB')
nt.links.new(coord.outputs['Generated'], sep.inputs[0])
nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].position = 0.5
ramp.color_ramp.elements[0].color = (0.55, 0.3, 0.2, 1)
ramp.color_ramp.elements[1].position = 0.75
ramp.color_ramp.elements[1].color = (0.06, 0.08, 0.2, 1)
bg = nt.nodes['Background']
nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.4

sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
scene.collection.objects.link(sun)
sun.data.energy = 3.5
sun.data.color = (1.0, 0.62, 0.38)
sun.data.angle = math.radians(1.0)
# low in the west-south-west, over the camera's left shoulder in the street view
sun.rotation_euler = (math.radians(80), 0, math.radians(-55))

ground = bpy.data.meshes.new('ground')
ground.from_pydata([(-3000, -3000, 0), (3000, -3000, 0), (3000, 3000, 0), (-3000, 3000, 0)], [], [(0, 1, 2, 3)])
g = bpy.data.objects.new('ground', ground)
scene.collection.objects.link(g)
gm = bpy.data.materials.new('pavement')
gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.09, 0.085, 0.08, 1)
ground.materials.append(gm)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam


def look(at, frm, lens=28):
    cam.location = Vector(frm)
    cam.data.lens = lens
    cam.data.clip_end = 5000
    d = Vector(at) - Vector(frm)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def show(placements):
    """Each (name, x, y, yaw): a copy of that object stood there (blender coordinates)."""
    shown = []
    for name, x, y, yaw in placements:
        src = objects[name]
        o = src.copy()
        o.hide_render = False
        scene.collection.objects.link(o)
        o.location = (x, y, 0)
        # the importer leaves objects turning by quaternion, where an euler does nothing
        o.rotation_mode = 'XYZ'
        o.rotation_euler = (0, 0, yaw)
        shown.append(o)
    return shown


def width(name):
    xs = [v.co.x for v in objects[name].data.vertices]
    return max(xs) - min(xs)


def render(view, placements, at, frm, lens=28):
    shown = show(placements)
    look(at, frm, lens)
    scene.render.filepath = os.path.join(OUT, f'{view}.png')
    bpy.ops.render.render(write_still=True)
    for o in shown:
        bpy.data.objects.remove(o, do_unlink=True)
    print('rendered', scene.render.filepath)


lots = [n for n in sorted(objects) if n.startswith('lot') and n.endswith('_near')]
for view in VIEWS:
    if view == 'street':
        # the street's two sides: lots facing each other across 14 m
        row, x = [], 0.0
        for name in lots + lots:
            w = width(name)
            row.append((name, x + w / 2, 0.0, 0.0))
            x += w
        other, x = [], 0.0
        for name in reversed(lots + lots):
            w = width(name)
            other.append((name, x + w / 2, -14.0, math.pi))
            x += w
        render(view, row + other, (60, -4, 9), (6, -9, 1.7), 24)
    elif view == 'bay':
        name = lots[3]
        render(view, [(name, 0, 0, 0)], (-1.5, 0, 7.5), (2.5, -9, 4.5), 30)
    elif view == 'roofs':
        row, x = [], 0.0
        for name in lots:
            w = width(name)
            row.append((name, x + w / 2, 0.0, 0.0))
            x += w
        render(view, row, (x / 2, 6, 20), (x / 2 - 20, -30, 45), 30)
    elif view == 'corner':
        render(view, [('corner_b_near', 0, 0, 0)], (6, 6, 12), (-22, -22, 2), 26)
    elif view == 'cornera':
        render(view, [('corner_a_near', 0, 0, 0)], (6, 6, 12), (-22, -22, 2), 26)
    elif view == 'lods':
        name = lots[3][:-5]
        w = width(lots[3])
        render(view, [(f'{name}_near', -w * 1.1, 0, 0), (f'{name}_mid', 0, 0, 0), (f'{name}_far', w * 1.1, 0, 0)], (0, 0, 12), (0, -60, 8), 35)
    elif view == 'tower':
        render(view, [('eiffel', 0, 0, 0)], (0, 0, 150), (260, -420, 20), 26)
    elif view == 'towerfar':
        render(view, [('eiffel', 0, 0, 0)], (0, 0, 120), (-700, -900, 12), 45)
    elif view == 'towerbase':
        render(view, [('eiffel', 0, 0, 0)], (0, 0, 70), (55, -95, 2), 18)
    elif view == 'lamp':
        render(view, [('lamp', 0, 0, 0), ('lamp', 3, 6, 0)], (0.5, 1, 2.6), (2.2, -4.5, 1.7), 30)
