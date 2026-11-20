# stations.py: render a model from camera stations listed in .json files, one png per station.
#
#   blender -b --python scripts/stations.py -- --glb horse.glb --views a.json [--views b.json ...] [--out dir]
#       [--pose pose.json] [--sheet sheet.png] [--cols 3] [--ref photo.jpg [--crop x,y,w,h]] ...
#
# --glb takes a .glb, .gltf or .fbx. --out defaults to ./stations. Each png is <views>-<station>.png.
# A views file is a list of stations (or {"stations": [...]}, with optional "width", "height"):
#   {"name": "front", "pos": [0, 1.5, 4], "target": [0, 1, 0], "fov": 40}
#   {"name": "side",  "pos": [4, 1.5, 0], "yaw": 90, "pitch": -10}
# Coordinates are the glb's frame (+y up, -z forward). "target" aims the camera at a point; otherwise
# "yaw" (degrees about +y, 0 looks down -z) and "pitch" (degrees, up positive) aim it. "fov" is the
# vertical field of view in degrees (default 40). "ortho": <width in metres> makes it orthographic.
#
# --pose turns the model's bones before rendering: {"<bone>": [x, y, z]}, degrees about the bone's own
# axes, from its rest. A bone the model has not got stops the run.
# --sheet writes every station of the run into one picture, side by side in rows of --cols, each the
# size of the first views file's stations. Each --ref is a picture put first on that sheet, to compare
# the renders with; a --crop after it keeps only that part of it (pixels, from its top left).

import bpy, sys, os, json, math, struct
import numpy as np
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:]
views, glb, out, pose, sheet, cols, refs = [], None, 'stations', None, None, 3, []
i = 0
while i < len(argv):
    if argv[i] == '--views':
        views.append(argv[i + 1])
    elif argv[i] == '--glb':
        glb = argv[i + 1]
    elif argv[i] == '--out':
        out = argv[i + 1]
    elif argv[i] == '--pose':
        pose = argv[i + 1]
    elif argv[i] == '--sheet':
        sheet = argv[i + 1]
    elif argv[i] == '--cols':
        cols = int(argv[i + 1])
    elif argv[i] == '--ref':
        refs.append([argv[i + 1], None])
    elif argv[i] == '--crop':
        if not refs:
            sys.exit('--crop comes after the --ref it cuts')
        refs[-1][1] = [int(v) for v in argv[i + 1].split(',')]
    else:
        sys.exit(f'unknown argument {argv[i]}')
    i += 2
if not glb or not views:
    sys.exit('need --glb <file> and at least one --views <file.json>')
os.makedirs(out, exist_ok=True)


def B(v):  # glb frame (+y up) to Blender's (+z up)
    return Vector((v[0], -v[2], v[1]))


bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
ext = os.path.splitext(glb)[1].lower()
if ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(glb))
else:
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(glb))

# A glb's surface that is cut out by its alpha (alphaMode MASK) is cut out here as glTF says it is:
# where the colour map's alpha times the point's own colour's alpha is over the surface's cutoff.
# Blender's import leaves the point's alpha out, which draws every shell of a shell fur solid.
if ext == '.glb':
    with open(glb, 'rb') as f:
        raw = f.read()
    doc = json.loads(raw[20:20 + struct.unpack('<I', raw[12:16])[0]])
    cutoffs = {m.get('name'): m.get('alphaCutoff', 0.5) for m in doc.get('materials', []) if m.get('alphaMode') == 'MASK'}
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.data.color_attributes:
            continue
        for mat in ob.data.materials:
            name = next((n for n in cutoffs if n and mat.name.startswith(n)), None)
            if name is None:
                continue
            tree = mat.node_tree
            shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
            # The colour map: the picture found by walking back from the surface's colour.
            seen, front, picture = set(), [shader.inputs['Base Color']], None
            while front and picture is None:
                socket = front.pop()
                for link in socket.links:
                    node = link.from_node
                    if node.type == 'TEX_IMAGE':
                        picture = node
                    elif node.name not in seen:
                        seen.add(node.name)
                        front.extend(node.inputs)
            if picture is None:
                continue
            own = tree.nodes.new('ShaderNodeVertexColor')
            own.layer_name = ob.data.color_attributes[0].name
            both, over = tree.nodes.new('ShaderNodeMath'), tree.nodes.new('ShaderNodeMath')
            both.operation, over.operation = 'MULTIPLY', 'GREATER_THAN'
            tree.links.new(picture.outputs['Alpha'], both.inputs[0])
            tree.links.new(own.outputs['Alpha'], both.inputs[1])
            tree.links.new(both.outputs[0], over.inputs[0])
            over.inputs[1].default_value = cutoffs[name]
            tree.links.new(over.outputs[0], shader.inputs['Alpha'])

if pose:
    with open(pose) as f:
        turns = json.load(f)
    rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if not rigs:
        sys.exit(f'--pose: {glb} has no bones')
    for name, deg in turns.items():
        if name not in rigs[0].pose.bones:
            sys.exit(f'--pose: {glb} has no bone {name}')
        bone = rigs[0].pose.bones[name]
        bone.rotation_mode = 'XYZ'
        bone.rotation_euler = [math.radians(d) for d in deg]

# The light: a sky that is bright blue overhead and a mid grey toward the ground (what a deck or the sea
# gives back), so a surface shows which way it faces by how bright it is and an underside still reads; a hard sun from high and to one side that casts shadows; ray-traced light
# between surfaces, so a corner, a duct or a gap under a part goes dark as it does outdoors. The camera
# sees a plain backdrop a shade darker than a light-grey model, so the model's outline always reads.
world = bpy.data.worlds.new('sky')
sc.world = world
world.use_nodes = True
nodes, links = world.node_tree.nodes, world.node_tree.links
bg = next(n for n in nodes if n.type == 'BACKGROUND')
out_node = next(n for n in nodes if n.type == 'OUTPUT_WORLD')
coord = nodes.new('ShaderNodeTexCoord')
sep = nodes.new('ShaderNodeSeparateXYZ')
ramp = nodes.new('ShaderNodeValToRGB')
links.new(coord.outputs['Generated'], sep.inputs[0])
links.new(sep.outputs['Z'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.40, (0.30, 0.31, 0.33, 1)
ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.75, (0.55, 0.68, 0.90, 1)
links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0
backdrop = nodes.new('ShaderNodeBackground')
backdrop.inputs['Color'].default_value = (0.13, 0.15, 0.18, 1)
path = nodes.new('ShaderNodeLightPath')
mix = nodes.new('ShaderNodeMixShader')
links.new(path.outputs['Is Camera Ray'], mix.inputs['Fac'])
links.new(bg.outputs['Background'], mix.inputs[1])
links.new(backdrop.outputs['Background'], mix.inputs[2])
links.new(mix.outputs['Shader'], out_node.inputs['Surface'])
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 5.0
sun.data.angle = math.radians(1.5)
sun.data.use_shadow = True
sc.collection.objects.link(sun)
sun.rotation_euler = Euler((math.radians(40), math.radians(15), math.radians(35)))
try:
    sc.render.engine = 'BLENDER_EEVEE'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.eevee.use_raytracing = True
sc.eevee.use_shadows = True
sc.eevee.fast_gi_method = 'AMBIENT_OCCLUSION_ONLY'
sc.eevee.taa_render_samples = 64
sc.view_settings.view_transform = 'Khronos PBR Neutral'
sc.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.sensor_fit = 'VERTICAL'
cam.data.clip_start, cam.data.clip_end = 0.01, 1000

shots, tile = [], None
for vpath in views:
    with open(vpath) as f:
        doc = json.load(f)
    stations = doc['stations'] if isinstance(doc, dict) else doc
    w = doc.get('width', 1280) if isinstance(doc, dict) else 1280
    h = doc.get('height', 720) if isinstance(doc, dict) else 720
    tile = tile or (w, h)
    sc.render.resolution_x, sc.render.resolution_y = w, h
    tag = os.path.splitext(os.path.basename(vpath))[0]
    for k, s in enumerate(stations):
        name = s.get('name', str(k))
        eye = B(s['pos'])
        cam.location = eye
        if 'target' in s:
            cam.rotation_euler = (B(s['target']) - eye).to_track_quat('-Z', 'Y').to_euler()
        else:
            yaw, pitch = math.radians(s.get('yaw', 0)), math.radians(s.get('pitch', 0))
            d = (-math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch))
            cam.rotation_euler = B(d).to_track_quat('-Z', 'Y').to_euler()
        if 'ortho' in s:
            cam.data.type = 'ORTHO'
            cam.data.ortho_scale = s['ortho']
        else:
            cam.data.type = 'PERSP'
            cam.data.angle = math.radians(s.get('fov', 40))
        sc.render.filepath = os.path.abspath(os.path.join(out, f'{tag}-{name}.png'))
        bpy.ops.render.render(write_still=True)
        shots.append(sc.render.filepath)
        print(f'STATION {sc.render.filepath}')


# A picture's pixels, top row first, and only the part `crop` keeps.
def pixels(path, crop=None):
    img = bpy.data.images.load(os.path.abspath(path))
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[::-1]
    if crop:
        x, y, cw, ch = crop
        a = a[y:y + ch, x:x + cw]
    return a


# A picture made to fit a tile, whole, in its middle.
def fitted(a, tw, th):
    h, w = a.shape[:2]
    s = min(tw / w, th / h)
    nw, nh = max(1, int(w * s)), max(1, int(h * s))
    ys = np.clip((np.arange(nh) / s).astype(int), 0, h - 1)
    xs = np.clip((np.arange(nw) / s).astype(int), 0, w - 1)
    t = np.empty((th, tw, 4), np.float32)
    t[...] = (0.2, 0.2, 0.2, 1.0)
    oy, ox = (th - nh) // 2, (tw - nw) // 2
    t[oy:oy + nh, ox:ox + nw] = a[ys][:, xs]
    return t


if sheet:
    tw, th = tile
    tiles = [fitted(pixels(p, c), tw, th) for p, c in refs] + [fitted(pixels(p), tw, th) for p in shots]
    rows = math.ceil(len(tiles) / cols)
    page = np.empty((rows * th, cols * tw, 4), np.float32)
    page[...] = (0.2, 0.2, 0.2, 1.0)
    for n, t in enumerate(tiles):
        r, c = divmod(n, cols)
        page[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = t
    img = bpy.data.images.new('sheet', cols * tw, rows * th)
    img.pixels.foreach_set(page[::-1].ravel())
    img.filepath_raw = os.path.abspath(sheet)
    img.file_format = 'PNG'
    img.save()
    print(f'SHEET {img.filepath_raw}')
