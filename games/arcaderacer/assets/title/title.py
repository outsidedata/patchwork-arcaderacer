# The title's words in 3D, title/title.glb, exported plain by this script and packed by the bake
# (`assets/arcaderacer.bake.ts`); run alone:
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python \
#     games/arcaderacer/assets/title/title.py -- [--look <dir>] <out.glb>
# With `--look`, it writes into <dir> a front and a three-quarter Eevee render of each word of the
# exported glb, for looking at before the game draws them.
#
# The words are the title card's (`assets/arcaderacer.json`, `titlecard`): the game's name, `name.text`,
# and each course's `word`. One node each, named `name` and the course's scene, in Orbitron Black
# (Orbitron-Black.ttf beside this file, the wght 900 instance of the Google Fonts variable font, SIL
# Open Font License, Orbitron-OFL.txt), extruded and bevelled, one metre tall at the capitals' outline
# (the bevel grows it by its depth all round), leaning forward SLANT degrees like a racer's badge (each
# point moved along the line by its height times tan SLANT), centred on its own origin by its bounds,
# standing upright and facing +z in glTF (the camera's way). Two materials, by the way each face points,
# whose finish the title card's look sets per word:
#   face   the fronts and backs of the letters.
#   side   the walls and the bevel.
# It prints SIZE, TRIS and MATS lines for each word and asserts them.
import bpy, bmesh, sys, os, math, json
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
look = argv[argv.index('--look') + 1] if '--look' in argv else None
out = argv[-1]
here = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(here, '..', 'arcaderacer.json')) as f:
    card = json.load(f)['titlecard']
WORDS = [('name', card['name']['text'])] + [(c['scene'], c['word']) for c in card['courses']]

CAPS = 1.0          # metres, the capitals' height
EXTRUDE = 0.09      # metres each side of the middle
BEVEL = 0.03
BEVEL_SEGMENTS = 4
SPACING = 1.06      # letter spacing, Blender's text `space_character`
GAP = 1.6           # the gap between two words of one node, Blender's text `space_word`
SLANT = 12          # degrees the letters lean forward

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
font = bpy.data.fonts.load(os.path.join(here, 'Orbitron-Black.ttf'))

face = bpy.data.materials.new('face')
side = bpy.data.materials.new('side')


def word(node, text):
    curve = bpy.data.curves.new(node, 'FONT')
    curve.body = text
    curve.font = font
    curve.space_character = SPACING
    curve.space_word = GAP
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.resolution_u = 6
    obj = bpy.data.objects.new(node, curve)
    scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    # Scaled so the capitals are CAPS tall, measured on the flat outline; the extrusion and the bevel
    # are given in the curve's own units, so they come out EXTRUDE and BEVEL metres once it is scaled.
    bpy.context.view_layer.update()
    k = CAPS / obj.dimensions.y
    curve.extrude = EXTRUDE / k
    curve.bevel_depth = BEVEL / k
    curve.bevel_resolution = BEVEL_SEGMENTS
    obj.scale = (k,) * 3
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(scale=True)
    # Leaning forward: x moved on by y·tan SLANT while it still lies flat (the curve's y is up the letters).
    obj.data.transform(Matrix.Shear('XZ', 4, (math.tan(math.radians(SLANT)), 0)))
    # Standing up, facing Blender −y, which is glTF +z.
    obj.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    # Centred on its origin by its bounds.
    bpy.context.view_layer.update()
    corners = [Vector(c) for c in obj.bound_box]
    obj.data.transform(Matrix.Translation(-(sum(corners, Vector()) / 8)))
    obj.data.materials.append(face)
    obj.data.materials.append(side)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for f in bm.faces:
        f.material_index = 0 if abs(f.normal.y) > 0.985 else 1
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


for i, (node, text) in enumerate(WORDS):
    obj = word(node, text)
    # Laid out down the file so the look renders see each apart; the game places each node itself.
    obj.location = (0, 0, -2.5 * i)

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_apply=True)

# The asserts, on the exported file read back.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=out)
meshes = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
assert sorted(meshes) == sorted(n for n, _ in WORDS), sorted(meshes)
for node, text in WORDS:
    m = meshes[node]
    pts = [Vector(c) for c in m.bound_box]
    lo = Vector((min(q.x for q in pts), min(q.y for q in pts), min(q.z for q in pts)))
    hi = Vector((max(q.x for q in pts), max(q.y for q in pts), max(q.z for q in pts)))
    size = hi - lo
    print(f'SIZE {node} "{text}" x={size.x:.3f} y={size.y:.3f} z={size.z:.3f} (Blender axes: x across, z up, y depth)')
    assert abs(size.z - (CAPS + 2 * BEVEL)) < 0.01, f'{node}: capitals {size.z:.3f} tall, want {CAPS + 2 * BEVEL}'
    assert abs(size.y - 2 * (EXTRUDE + BEVEL)) < 0.01, f'{node}: depth {size.y:.3f}'
    assert max(abs(v) for v in (lo + hi) / 2) < 1e-3, f'{node}: not centred on its origin: {(lo + hi) / 2}'
    tris = sum(len(poly.vertices) - 2 for poly in m.data.polygons)
    print(f'TRIS {node} {tris}')
    assert tris < 40000, f'{node}: too many triangles for a title'
    mats = sorted(s.material.name for s in m.material_slots)
    print(f'MATS {node} {mats}')
    assert mats == ['face', 'side'], mats
    front = sum(1 for poly in m.data.polygons if m.material_slots[poly.material_index].material.name == 'face' and poly.normal.y < -0.985)
    assert front > 0, f'{node}: no front faces'

if look:
    os.makedirs(look, exist_ok=True)
    scene = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    world = bpy.data.worlds.new('w')
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.45, 0.6, 1)
    scene.world = world
    key = bpy.data.lights.new('key', 'AREA'); key.energy = 900; key.size = 4
    cam = bpy.data.cameras.new('cam'); cam.lens = 50
    c = bpy.data.objects.new('cam', cam); scene.collection.objects.link(c); scene.camera = c
    kl = bpy.data.objects.new('key', key); scene.collection.objects.link(kl)
    for node, _ in WORDS:
        m = meshes[node]
        for other in meshes.values():
            other.hide_render = other is not m
        mid = m.matrix_world.translation
        kl.location = mid + Vector((-4, -6, 5))
        kl.rotation_euler = (mid - kl.location).to_track_quat('-Z', 'Y').to_euler()
        for name, at in [('front', (0, -20, 0.4)), ('three-quarter', (-10, -16, 3))]:
            c.location = mid + Vector(at)
            c.rotation_euler = (mid - c.location).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = os.path.join(look, f'{node}-{name}.png')
            bpy.ops.render.render(write_still=True)
    print('LOOK', look)
