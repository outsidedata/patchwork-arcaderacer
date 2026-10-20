# What the Paris asset scripts share (`haussmann.py`, `eiffel.py`): colours, pixels in and out of
# Blender images, height fields to normal maps, faces built by hand into one mesh with their UVs and
# vertex colours, a facade edge's frame, and the materials made of them. Nothing here is drawn on
# its own; each script imports it from beside itself.
import math

import bpy
import numpy as np

UP = (0.0, 0.0, 1.0)
WHITE = (1.0, 1.0, 1.0, 1.0)


# ---------------------------------------------------------------------------------------- colour

def lin(hexs, a=1.0):
    """An sRGB hex colour as linear RGBA, as a vertex colour is stored."""
    hexs = hexs.lstrip('#')
    c = [int(hexs[k:k + 2], 16) / 255 for k in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (a,)


def shade(k):
    return (k, k, k, 1.0)


# ---------------------------------------------------------------------------------------- pixels

def load(path, size):
    """An image file's pixels, rows bottom up, its encoded values as they are."""
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    if img.size[0] != size or img.size[1] != size:
        img.scale(size, size)
    a = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(size, size, 4)


def image(name, rgba, colour=True):
    """A packed Blender image of an (h, w, 4) array, rows bottom up: sRGB values for a colour map,
    raw ones for a normal or roughness map."""
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    img.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32).ravel())
    img.file_format = 'PNG'
    img.pack()
    return img


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def normal_map(height, px_per_m, strength=1.0):
    """A tangent-space normal map (OpenGL, +y up the image) of a periodic height field in metres."""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * px_per_m / 2
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * px_per_m / 2
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(height)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def periodic_noise(n, size, terms, rng, scale=1.0):
    """Smooth noise that repeats every `size` pixels: a sum of waves of whole periods."""
    yy, xx = np.mgrid[0:n, 0:n] / n
    out = np.zeros((n, n))
    for _ in range(terms):
        fx, fy = rng.integers(-4, 5), rng.integers(1, 5)
        out += np.sin(2 * np.pi * (fx * xx + fy * yy) + rng.uniform(0, 2 * np.pi)) / math.hypot(fx, fy)
    return out / terms * scale


def segment_distance(px, py, ax, ay, bx, by):
    """Each pixel's distance to the segment a-b."""
    vx, vy = bx - ax, by - ay
    t = np.clip(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1)
    return np.hypot(px - ax - t * vx, py - ay - t * vy)


def strokes_to_maps(strokes, shape, px_per_m, colour, strength=0.8):
    """Thin round bars, each (distance to its centre line, half thickness), drawn as a colour map
    with an anti-aliased alpha and a normal map of their round backs."""
    d = np.stack([s[0] - s[1] for s in strokes])
    win = np.argmin(d, axis=0)
    edge = np.take_along_axis(d, win[None], 0)[0]
    half = np.take_along_axis(np.stack([np.broadcast_to(s[1], shape) for s in strokes]), win[None], 0)[0]
    centre = edge + half
    alpha = np.clip(0.5 - edge * px_per_m, 0, 1)
    height = np.sqrt(np.clip(1 - (centre / half) ** 2, 0, 1)) * half
    nrm = normal_map(height, px_per_m, strength)
    out = np.zeros(shape + (4,))
    out[..., :3] = np.array(colour)
    out[..., 3] = alpha
    return out, np.concatenate([nrm, np.ones(shape + (1,))], -1)


# -------------------------------------------------------------------------------------- geometry

def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


def newell(pts):
    n = [0.0, 0.0, 0.0]
    for k in range(len(pts)):
        a, b = pts[k], pts[(k + 1) % len(pts)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return tuple(n)


def box_uv(tile):
    """Box-projected UVs in metres, one frame per dominant axis, `tile` metres a repeat."""
    def project(verts, idx):
        pts = [verts[k] for k in idx]
        n = newell(pts)
        ax = max(range(3), key=lambda k: abs(n[k]))
        if ax == 2:
            return [(p[0] / tile, p[1] / tile) for p in pts]
        if ax == 1:
            return [(p[0] / tile, p[2] / tile) for p in pts]
        return [(p[1] / tile, p[2] / tile) for p in pts]
    return project


class Build:
    """Faces of one object: each its own corners, a material index, its UVs or none (projected by
    the material's own projection when the mesh is made), a vertex colour and whether it is smooth."""

    def __init__(self):
        self.verts = []
        self.faces = []

    def poly(self, pts, mat, want=None, uv=None, col=WHITE, smooth=False):
        """A convex or concave polygon; with `want`, wound so its normal faces that way."""
        pts = [tuple(float(c) for c in p) for p in pts]
        if want is not None and dot(newell(pts), want) < 0:
            pts.reverse()
            if uv is not None:
                uv = list(reversed(uv))
        base = len(self.verts)
        self.verts.extend(pts)
        self.faces.append((list(range(base, base + len(pts))), mat, uv, col, smooth))

    def tris(self):
        return sum(len(f[0]) - 2 for f in self.faces)

    def mesh(self, name, mats, uv_of=None, tone=None):
        """The Blender mesh: `uv_of[mat](verts, idx)` gives a face's UVs when it has none, and
        `tone(mat, z)` scales a corner's vertex colour by its height."""
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.verts, [], [f[0] for f in self.faces])
        for m in mats:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', [f[1] for f in self.faces])
        me.polygons.foreach_set('use_smooth', [f[4] for f in self.faces])
        uvs, cols = [], []
        for f in self.faces:
            idx, mat, uv, col, _ = f
            if uv is None:
                uv = uv_of[mat](self.verts, idx) if uv_of and mat in uv_of else [(0.0, 0.0)] * len(idx)
            uvs.extend(c for p in uv for c in p)
            for k in idx:
                g = tone(mat, self.verts[k][2]) if tone else 1.0
                cols.extend((col[0] * g, col[1] * g, col[2] * g, col[3]))
        layer = me.uv_layers.new(name='UVMap')
        layer.data.foreach_set('uv', uvs)
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        attr.data.foreach_set('color', cols)
        me.color_attributes.active_color = attr
        me.validate()
        me.update()
        return me


class Frame:
    """A facade edge's frame: `u` along it from its start, `v` out of the wall toward the street,
    `z` up."""

    def __init__(self, a, b):
        self.a = a
        dx, dy = b[0] - a[0], b[1] - a[1]
        self.length = math.hypot(dx, dy)
        self.t = (dx / self.length, dy / self.length)
        self.n = (self.t[1], -self.t[0])
        self.t3 = (self.t[0], self.t[1], 0.0)
        self.n3 = (self.n[0], self.n[1], 0.0)

    def p(self, u, v, z):
        return (self.a[0] + self.t[0] * u + self.n[0] * v, self.a[1] + self.t[1] * u + self.n[1] * v, z)

    def dir(self, du, dv, dz):
        return (self.t[0] * du + self.n[0] * dv, self.t[1] * du + self.n[1] * dv, dz)


def arc(cu, cz, r, a0, a1, n):
    """n + 1 points round a circle from angle a0 to a1."""
    return [(cu + r * math.cos(a0 + (a1 - a0) * k / n), cz + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]


# ------------------------------------------------------------------------------------- materials

def principled(name):
    """A one-sided Principled material (three culls the backs) and its node tree and BSDF."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree
    return m, nt, nt.nodes['Principled BSDF']


def multiply(nt, a, b):
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    nt.links.new(a, mix.inputs['A'])
    if isinstance(b, tuple):
        mix.inputs['B'].default_value = b
    else:
        nt.links.new(b, mix.inputs['B'])
    return mix.outputs['Result']


def vertex_tinted(nt, bsdf, colour_socket):
    """Base colour = what is given × the vertex colour, so Blender draws what three draws."""
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(multiply(nt, colour_socket, attr.outputs['Color']), bsdf.inputs['Base Color'])


def texture(nt, img):
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    return tex


def normal_mapped(nt, bsdf, img, strength=1.0):
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = strength
    nt.links.new(texture(nt, img).outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])


def textured(name, colour, normal, roughness, tint=None, metallic=0.0, normal_strength=1.0):
    """A material of a colour, a normal and a roughness map, the colour tinted and vertex coloured."""
    m, nt, bsdf = principled(name)
    src = texture(nt, colour).outputs['Color']
    if tint is not None:
        src = multiply(nt, src, tint)
    vertex_tinted(nt, bsdf, src)
    normal_mapped(nt, bsdf, normal, normal_strength)
    nt.links.new(texture(nt, roughness).outputs['Color'], bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value = metallic
    return m


def masked(name, colour, normal, roughness=0.5, metallic=0.0, emission=None, strength=1.0):
    """A two-sided alpha-masked material (bars, lattices): its colour map's alpha clipped at a half,
    vertex coloured, with an emissive map when given."""
    m, nt, bsdf = principled(name)
    tex = texture(nt, colour)
    vertex_tinted(nt, bsdf, tex.outputs['Color'])
    clip = nt.nodes.new('ShaderNodeMath')
    clip.operation = 'ROUND'
    nt.links.new(tex.outputs['Alpha'], clip.inputs[0])
    nt.links.new(clip.outputs['Value'], bsdf.inputs['Alpha'])
    normal_mapped(nt, bsdf, normal, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission is not None:
        nt.links.new(texture(nt, emission).outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = strength
    m.use_backface_culling = False
    m.surface_render_method = 'DITHERED'
    return m


def export(path):
    """The scene as a glb: y up, JPEG maps (PNG where alpha is needed), vertex colours, and each
    object's custom properties as its node's extras."""
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=False,
                              export_image_format='JPEG', export_jpeg_quality=90, export_vertex_color='ACTIVE',
                              export_extras=True)
