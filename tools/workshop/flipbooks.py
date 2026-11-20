# flipbooks.py: every flipbook an effects file's `flipbooks` lists, baked into the pictures its
# particles play. It reads the whole file, makes nothing up, and writes what each entry says, beside
# the file:
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/workshop/flipbooks.py -- <effects file>
#
# A flipbook is never a simulation. It is one plane, `plane` units across and as tall as its frame's
# shape makes it, carrying a material whose node tree the entry writes out whole, `nodes`, rendered
# straight on by an orthographic camera that sees the plane edge to edge, `cell` pixels across and
# down, once a frame for `frames` frames. Time is one
# more input of the same procedural texture that draws the shape: every input of a node may be a value
# or `{ "keys": [[t, value], ...] }`, `t` 0 on the first frame and 1 on the last, the value between two
# keys straight between them and past the last key carried on along the last two. So a 4D noise's `W`
# moving through its keys is the shape changing, and a scale moving through its keys is it growing.
#
# An entry:
#
#   name      the flipbook's name: the sheet `<name>.json` written beside the file, which a layer
#             names as its `sheet`, and the key its particles find it by
#   clip      the name of its one clip, every frame in order
#   frames    how many frames it plays
#   loop      0 for a flipbook played once; else so many more frames are drawn past the last, each
#             laid over the frame as many from the first, more of it the nearer the first it is, so
#             the last frame runs back into the first
#   across    frames in a row of the picture, read left to right then top to bottom
#   cell      [across, down], the pixels of a frame: a beam's frame is long and low
#   plane     units across the plane, the node tree's Object coordinates running -plane/2 to +plane/2
#             across and down as far as the frame's shape gives, every pixel square
#   samples   Cycles' samples a pixel
#   fps       frames a second it is made for: each frame's `duration` in the sheet
#   pivot     the point of a frame, fractions across and down, its particle stands on
#   nodes     the node tree, in order: each `{ id, type, props?, inputs? }`, `type` a Blender shader
#             node's name, `props` its settings by name, `inputs` its inputs by name or by index
#             ("0", "1", "2" where a node has two of one name), each a value, a keyed value, or
#             `{ "link": "<id>.<output>" }`, the output of an earlier node by name
#   images    the pictures written, each `{ file, channels }`: `file` beside the effects file, four
#             `channels`, red, green, blue and alpha, each worked out from a field rendered from the
#             node tree, `field` `"<id>.<output>"`, by its `op`:
#               value    the field itself
#               alpha    how much it hides: 1 - e^(-absorb · field)
#               light    how much of a light reaches each pixel, from `dir`: "+x" the right, "-x" the
#                        left, "+y" the top, "-y" the bottom, through the field before it on the
#                        light's way, e^(-absorb · that field summed and divided by the pixels
#                        across); "+z" in
#                        front, which reaches all of it, 1; "-z" behind, through the field itself,
#                        e^(-absorb · field)
#               shade    the field as a height, smoothed over `smooth` pixels and times `height`, each
#                        pixel lit as it faces the light from `dir` but never below `wrap`, then times
#                        the light that reaches it through the field `through`, as `light` says,
#                        that light smoothed over `soften` pixels
#               volume   the field as how thick the smoke stands each way from the plane, up to
#                        `depth` pixels, of the density `through`, cut into `slices`; how much of the
#                        light from `dir` (as `light`'s) each slice gets through those before it,
#                        seen from in front through those in front of it, over how much the pixel
#                        hides, smoothed over `soften` pixels: lobes shadow the lobes behind them;
#                        `dir` "hidden" is how much of what is behind the pixel it hides
#               glow     the field spread evenly every way, three passes of the mean over `radius`
#                        pixels each side, times `gain`; with `keep`, the field where it is brighter
#               motion   where each pixel of the field moves to by the next frame, along `axis` x or
#                        y, in pixels, found over a square of `window` pixels round it: 0.5 still,
#                        0 `range` pixels left or up, 1 `range` pixels right or down; the last frame
#                        of a flipbook played once is still
#               const    `value` in every pixel
#
# The sheet `<name>.json` is the first image's: its frames, each `cell` pixels at its place, its
# pivot, its duration, and its clip. Every image of an entry is laid out the same.
import bpy
import json
import math
import os
import sys
import tempfile

import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
path = os.path.abspath(args[0])
with open(path) as f:
    config = json.load(f)
here = os.path.dirname(path)
scratch = tempfile.mkdtemp(prefix='flipbooks-')


def at(value, t):
    """A value at `t`, keyed or not."""
    if not isinstance(value, dict):
        return value
    keys = value['keys']
    if len(keys) == 1:
        return keys[0][1]
    i = 0
    while i < len(keys) - 2 and t > keys[i + 1][0]:
        i += 1
    (t0, a), (t1, b) = keys[i], keys[i + 1]
    k =(t - t0) / (t1 - t0)
    if isinstance(a, list):
        return [x + (y - x) * k for x, y in zip(a, b)]
    return a + (b - a) * k


def socket(sockets, key, where):
    if key.isdigit():
        return sockets[int(key)]
    if key not in sockets:
        raise SystemExit(f'{where} has no socket {key}: it has {[s.name for s in sockets]}')
    return sockets[key]


def stage(book):
    """A scene of the plane, the camera that sees it edge to edge, and its material's node tree."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = book['samples']
    scene.cycles.use_denoising = False
    w, h = book['cell']
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '32'
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('none')
    world.color = (0, 0, 0)
    scene.world = world

    # the plane's mesh is a square as wide as the plane, so it fills the frame however low it is;
    # the orthographic scale is the frame's longer side, here across
    if h > w:
        raise SystemExit(f"flipbook {book['name']} has a cell of {book['cell']}, taller than it is wide, and flipbooks.py lays frames out across")
    bpy.ops.mesh.primitive_plane_add(size=book['plane'], location=(0, 0, 0))
    plane = bpy.context.active_object
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = book['plane']
    eye = bpy.data.objects.new('cam', cam)
    eye.location = (0, 0, book['plane'] * 4)
    scene.collection.objects.link(eye)
    scene.camera = eye

    mat = bpy.data.materials.new(book['name'])
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    made = {}
    keyed = []
    for spec in book['nodes']:
        where = f"flipbook {book['name']} node {spec['id']}"
        node = tree.nodes.new(spec['type'])
        for k, v in spec.get('props', {}).items():
            setattr(node, k, v)
        made[spec['id']] = node
        for k, v in spec.get('inputs', {}).items():
            s = socket(node.inputs, k, where)
            if isinstance(v, dict) and 'link' in v:
                src, out = v['link'].split('.', 1)
                tree.links.new(socket(made[src].outputs, out, f"flipbook {book['name']} node {src}"), s)
            else:
                keyed.append((s, v))
    shine = tree.nodes.new('ShaderNodeEmission')
    pack = tree.nodes.new('ShaderNodeCombineXYZ')
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    tree.links.new(pack.outputs['Vector'], shine.inputs['Color'])
    tree.links.new(shine.outputs['Emission'], out.inputs['Surface'])
    plane.data.materials.append(mat)
    # every field an image reads, three to a render, one in each of red, green and blue
    fields = sorted({f for image in book['images'] for ch in image['channels'] for f in (ch.get('field'), ch.get('through')) if f and ch['op'] != 'const'})
    return scene, tree, made, keyed, pack, fields


def render(book, field, frame, cache, setup):
    key = (field, frame)
    if key in cache:
        return cache[key]
    scene, tree, made, keyed, pack, fields = setup
    t = frame / (book['frames'] - 1)
    for s, v in keyed:
        s.default_value = at(v, t)
    w, h = book['cell']
    for g in range(0, len(fields), 3):
        group = fields[g:g + 3]
        for i, f in enumerate(group):
            src, out = f.split('.', 1)
            tree.links.new(socket(made[src].outputs, out, f"flipbook {book['name']} field {f}"), pack.inputs[i])
        file = os.path.join(scratch, f"{book['name']}-{frame}.exr")
        scene.render.filepath = file
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(file)
        raw = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(raw)
        px = raw.reshape(h, w, 4)[::-1]
        for i, f in enumerate(group):
            cache[(f, frame)] = px[:, :, i].copy()
        bpy.data.images.remove(img)
        os.remove(file)
    return cache[key]


def field_at(book, field, frame, cache, setup):
    """A frame of a field, the frames past the last laid back over the first when it loops."""
    f = render(book, field, frame, cache, setup)
    loop = book['loop']
    if loop and frame < loop:
        w = frame / loop
        return f * w + render(book, field, book['frames'] + frame, cache, setup) * (1 - w)
    return f


def boxed(a, w):
    """The mean of each pixel's square of `w` pixels."""
    r = w // 2
    p = np.pad(a, r, mode='edge')
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    m, n = a.shape
    return (c[w:w + m, w:w + n] - c[:m, w:w + n] - c[w:w + m, :n] + c[:m, :n]) / (w * w)


def channel(book, ch, frame, cache, setup):
    op = ch['op']
    if op == 'const':
        return np.full((book['cell'][1], book['cell'][0]), ch['value'], dtype=np.float32)
    d = np.clip(field_at(book, ch['field'], frame, cache, setup), 0, None)
    if op == 'value':
        return d
    if op == 'alpha':
        return 1 - np.exp(-ch['absorb'] * d)
    if op == 'light':
        k, n = ch['absorb'], book['cell'][0]
        way = ch['dir']
        if way == '+z':
            return np.ones_like(d)
        if way == '-z':
            return np.exp(-k * d)
        axis = 1 if way[1] == 'x' else 0
        # light from the right or the bottom runs toward the lower index: sum from the far end
        flip = way in ('+x', '-y')
        a = np.flip(d, axis) if flip else d
        before = np.cumsum(a, axis) - a
        lit = np.exp(-k * before / n)
        return np.flip(lit, axis) if flip else lit
    if op == 'shade':
        # the field as a height: its slope, smoothed over `smooth` pixels, gives each pixel a facing,
        # and the light from `dir` falls on it as it faces it, never less than `wrap`; the light from
        # the side then passes through `through` before it, and from behind through `through` itself
        n = book['cell'][0]
        h = boxed(d, ch['smooth']) * ch['height']
        gy, gx = np.gradient(h)
        nz = 1 / np.sqrt(gx * gx + gy * gy + 1)
        nx, ny = -gx * nz, -gy * nz
        way = ch['dir']
        facing = {'+x': nx, '-x': -nx, '+y': -ny, '-y': ny, '+z': nz, '-z': -nz}[way]
        wrap = ch['wrap']
        lit = np.clip(wrap + (1 - wrap) * facing, 0, 1)
        t = np.clip(field_at(book, ch['through'], frame, cache, setup), 0, None)
        k = ch['absorb']
        if way == '-z':
            return lit * boxed(np.exp(-k * t), ch['soften'])
        if way == '+z':
            return lit
        axis = 1 if way[1] == 'x' else 0
        flip = way in ('+x', '-y')
        a = np.flip(t, axis) if flip else t
        before = np.cumsum(a, axis) - a
        through = np.exp(-k * before / n)
        return lit * boxed(np.flip(through, axis) if flip else through, ch['soften'])
    if op == 'volume':
        # the field as how thick the smoke stands in front of and behind the plane, up to `depth`
        # pixels each way, filled with `through`'s density, cut into `slices`: the light from `dir`
        # passes through every slice before it, the camera in front sees each slice through every
        # slice in front of it, and the pixel is the light it sees over how much it is hidden
        n, s, k = book['cell'][0], ch['slices'], ch['absorb']
        step = 2 * ch['depth'] / s
        key = ('volume', ch['field'], ch['through'], ch['depth'], s, k, frame)
        if key not in cache:
            rho = np.clip(field_at(book, ch['through'], frame, cache, setup), 0, None)
            z = ((np.arange(s) + 0.5) / s * 2 - 1).astype(np.float32)
            inside = (np.abs(z)[:, None, None] * ch['depth'] < (d * ch['depth'])[None]) * rho[None]
            t = (inside * (k / n)).astype(np.float32)
            front = np.flip(np.cumsum(np.flip(t, 0), 0), 0) - t
            cache[key] = (t, np.exp(-front * step), 1 - np.exp(-t.sum(0) * step))
        tau, seen, hidden = cache[key]
        way = ch['dir']
        if way == 'hidden':
            return hidden
        if way[1] == 'z':
            axis, flip, per = 0, way == '+z', step
        else:
            axis, flip, per = (2 if way[1] == 'x' else 1), way in ('+x', '-y'), 1
        a = np.flip(tau, axis) if flip else tau
        before = np.cumsum(a, axis) - a
        lit = np.exp(-before * per)
        lit = np.flip(lit, axis) if flip else lit
        got = (tau * step * lit * seen).sum(0)
        return boxed(np.where(hidden > 1e-4, got / np.maximum(hidden, 1e-4), 0), ch['soften'])
    if op == 'glow':
        # the field spread evenly every way: three passes of `radius` pixels' mean, times `gain`,
        # with the field itself kept where it is brighter when `keep`
        g = d
        for _ in range(3):
            g = boxed(g, 2 * ch['radius'] + 1)
        g = np.clip(g * ch['gain'], 0, 1)
        return np.maximum(g, d) if ch['keep'] else g
    if op == 'motion':
        last = book['frames'] - 1
        if frame == last and not book['loop']:
            return np.full_like(d, 0.5)
        e = np.clip(field_at(book, ch['field'], (frame + 1) % book['frames'], cache, setup), 0, None)
        gy, gx = np.gradient((d + e) / 2)
        gt = e - d
        w = ch['window']
        xx, yy, xy = boxed(gx * gx, w), boxed(gy * gy, w), boxed(gx * gy, w)
        xt, yt = boxed(gx * gt, w), boxed(gy * gt, w)
        det = xx * yy - xy * xy
        ok = np.abs(det) > 1e-9
        safe = np.where(ok, det, 1)
        vx = np.where(ok, (-yy * xt + xy * yt) / safe, 0)
        vy = np.where(ok, (xy * xt - xx * yt) / safe, 0)
        v = vx if ch['axis'] == 'x' else vy
        return np.clip(0.5 + 0.5 * v / ch['range'], 0, 1)
    raise SystemExit(f"flipbook {book['name']} has a channel of op {op}, which flipbooks.py does not have")


def write(book, image, cache, setup):
    (w, h), across, frames = book['cell'], book['across'], book['frames']
    down = math.ceil(frames / across)
    pic = np.zeros((down * h, across * w, 4), dtype=np.float32)
    if len(image['channels']) != 4:
        raise SystemExit(f"flipbook {book['name']} image {image['file']} gives {len(image['channels'])} channels, not 4")
    for i in range(frames):
        r, c = divmod(i, across)
        for k, ch in enumerate(image['channels']):
            pic[r * h:(r + 1) * h, c * w:(c + 1) * w, k] = channel(book, ch, i, cache, setup)
    img = bpy.data.images.new(image['file'], across * w, down * h, alpha=True)
    img.colorspace_settings.name = 'Non-Color'
    img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.ascontiguousarray(np.clip(pic[::-1], 0, 1)).ravel())
    img.filepath_raw = os.path.join(here, image['file'])
    img.file_format = 'PNG'
    img.save()
    print(f"wrote {image['file']}: {frames} frames, {across * w} x {down * h}")


def sheet(book):
    (w, h), across = book['cell'], book['across']
    frames = []
    for i in range(book['frames']):
        r, c = divmod(i, across)
        frames.append({
            'filename': f"{book['name']} {i}",
            'frame': {'x': c * w, 'y': r * h, 'w': w, 'h': h},
            'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h},
            'sourceSize': {'w': w, 'h': h},
            'pivot': {'x': book['pivot'][0], 'y': book['pivot'][1]},
            'duration': round(1000 / book['fps']),
        })
    down = math.ceil(book['frames'] / across)
    out = {
        'frames': frames,
        'meta': {
            'app': 'flipbooks.py', 'image': book['images'][0]['file'],
            'size': {'w': across * w, 'h': down * h},
            'frameTags': [{'name': book['clip'], 'from': 0, 'to': book['frames'] - 1}],
        },
    }
    with open(os.path.join(here, f"{book['name']}.json"), 'w') as f:
        f.write(json.dumps(out, indent=2) + '\n')
    print(f"wrote {book['name']}.json")


for book in config['flipbooks']:
    setup = stage(book)
    cache = {}
    for image in book['images']:
        write(book, image, cache, setup)
    sheet(book)
