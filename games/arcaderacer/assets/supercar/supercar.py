# A Countach-inspired wedge supercar with gull-wing doors, built from nothing in its own scene.
# Units are metres. The car's nose points at -Y (glTF +Z forward), its left side is +X, up is +Z.
# Every surface of the body comes from one loft: a section of eight rows a side, each row's
# (s, z) a curve along the length l. Doors, glass and roof are cut from that one skin, so every
# seam lines up by construction.
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#       --python games/arcaderacer/assets/supercar/supercar.py [-- out.blend]
# With `out.blend` it saves the scene there, which export_glb.py turns into the game's glb.

import bpy, bmesh, math, os, sys
from math import radians, sin, cos, pi
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

NAME = "supercar"
L_TAIL, L_NOSE = -1.91, 2.23


def V(l, s, z):
    return Vector((s, -l, z))


# ---------------------------------------------------------------- curves

def pchip_slopes(xs, ys):
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    if n == 2:
        return [d[0], d[0]]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1 = 2 * h[i] + h[i - 1]
            w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def end(h0, h1, d0, d1):
        mm = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
        if mm * d0 <= 0:
            return 0.0
        if d0 * d1 <= 0 and abs(mm) > abs(3 * d0):
            return 3 * d0
        return mm

    m[0] = end(h[0], h[1], d[0], d[1])
    m[-1] = end(h[-1], h[-2], d[-1], d[-2])
    return m


class Curve:
    """Monotone cubic through keys (x, y); a key (x, y, 'c') is a corner where the curve may kink."""

    def __init__(self, keys):
        keys = sorted(keys, key=lambda k: k[0])
        self.xs = [k[0] for k in keys]
        pieces, cur = [], [keys[0]]
        for k in keys[1:]:
            cur.append(k)
            if len(k) > 2 and k[2] == 'c':
                pieces.append(cur)
                cur = [k]
        if len(cur) > 1:
            pieces.append(cur)
        self.data = []
        for p in pieces:
            xs = [k[0] for k in p]
            ys = [k[1] for k in p]
            self.data.append((xs, ys, pchip_slopes(xs, ys)))

    def __call__(self, x):
        for xs, ys, m in self.data:
            if x <= xs[-1]:
                break
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = 0
        while x > xs[i + 1]:
            i += 1
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1])


def lin(keys):
    return Curve([(k[0], k[1], 'c') for k in keys])


# The side silhouette: one straight line from the nose through the windscreen to the roof.
TOP = Curve([(-1.91, 0.89), (-1.30, 0.895), (-0.95, 0.90), (-0.80, 0.93, 'c'), (-0.55, 1.055, 'c'),
             (-0.30, 1.07), (-0.02, 1.06, 'c'), (0.90, 0.8515, 'c'), (2.23, 0.55)])
# Roof edge, A-pillar, rear buttress top.
R2S = Curve([(-1.91, 0.74), (-1.40, 0.71), (-0.80, 0.62), (-0.55, 0.565, 'c'), (-0.02, 0.555, 'c'),
             (0.90, 0.70, 'c'), (1.25, 0.67), (1.75, 0.60), (2.23, 0.50)])
R2Z = Curve([(-1.91, 0.93), (-1.40, 0.955), (-0.80, 1.00), (-0.55, 1.035, 'c'), (-0.02, 1.035, 'c'),
             (0.90, 0.81, 'c'), (1.25, 0.760), (1.75, 0.648), (2.23, 0.538)])
# The gull-wing hinge line on the roof: straight at 0.22 from the centre between -0.55 and -0.02.
R1S = Curve([(-1.91, 0.30), (-0.80, 0.24), (-0.55, 0.22, 'c'), (-0.02, 0.22, 'c'), (0.90, 0.28), (2.23, 0.17)])
# Belt line / window base / hood edge.
R3S = Curve([(-1.91, 0.90), (-1.25, 0.92), (-0.55, 0.865), (0.0, 0.81), (0.5, 0.82), (0.90, 0.84),
             (1.25, 0.845), (1.75, 0.81), (2.0, 0.77), (2.23, 0.67)])
R3Z = Curve([(-1.91, 0.90), (-1.25, 0.90), (-0.55, 0.86), (0.0, 0.80), (0.5, 0.79), (0.90, 0.79),
             (1.25, 0.745), (1.50, 0.69), (1.75, 0.632), (2.0, 0.575), (2.23, 0.515)])
# Shoulder crease: the half width of the car.
W = Curve([(-1.91, 0.965), (-1.85, 0.978), (-1.60, 0.993), (-1.25, 1.0), (-0.80, 0.99), (-0.45, 0.962),
           (0.0, 0.935), (0.5, 0.925), (0.9, 0.928), (1.25, 0.93), (1.5, 0.925), (1.85, 0.895),
           (2.08, 0.86), (2.18, 0.81), (2.23, 0.74)])
# The side crease runs nearly level from the top of one arch to the other; above it the door's
# upper flank slopes in to the belt, the plane the NACA duct sits on.
R4Z = Curve([(-1.91, 0.80), (-1.25, 0.74), (-0.45, 0.70), (0.30, 0.685), (0.90, 0.70), (1.25, 0.705),
             (1.50, 0.675), (1.75, 0.61), (2.0, 0.55), (2.23, 0.48)])
# The bottom edge of the skin: sill, and the hexagonal wheel arches cut into it, 6-8 cm off the tyre.
BOT = lin([(-1.91, 0.30), (-1.64, 0.30), (-1.62, 0.42), (-1.42, 0.665), (-1.08, 0.665), (-0.88, 0.42),
           (-0.86, 0.18), (-0.70, 0.16), (0.70, 0.16), (0.86, 0.18), (0.88, 0.40), (1.08, 0.645),
           (1.42, 0.645), (1.62, 0.40), (1.64, 0.26), (1.78, 0.25), (2.23, 0.25)])
CURVES = [TOP, R2S, R2Z, R1S, R3S, R3Z, W, R4Z, BOT]


def ring(l):
    """Right half section at l, rows R0 (roof centre) .. R7 (skin turned under), as (s, z)."""
    t = TOP(l)
    s2, z2 = R2S(l), R2Z(l)
    s1 = R1S(l)
    z1 = t + (z2 - t) * (s1 / s2) ** 2
    s3, z3 = R3S(l), R3Z(l)
    w, z4 = W(l), R4Z(l)
    z6 = BOT(l)
    s6 = w - 0.05
    z5 = z6 + 0.5 * (z4 - z6)
    s5 = w - 0.012
    return [(0.0, t), (s1, z1), (s2, z2), (s3, z3), (w, z4), (s5, z5), (s6, z6), (s6 - 0.05, z6 - 0.02)]


# The nose face leans back under the sharp hood edge: over the last 18 cm each row below the
# crease is drawn back by up to RAKE[row].
RAKE = [0.0, 0.0, 0.0, 0.0, 0.015, 0.05, 0.09, 0.10]


def rake(l, row):
    f = min(max((l - 2.05) / (L_NOSE - 2.05), 0.0), 1.0)
    return -RAKE[row] * f * f * (3 - 2 * f)


def row_point(l, row, side):
    s, z = ring(l)[row]
    return V(l + rake(l, row), side * s, z)


# The section between the rows is curved, not straight, so a highlight rolls across a panel
# instead of sitting on it flat. Rows that are not character lines get no crease of their own:
#   bands 0-1 (roof, hood, windscreen, deck) are one parabola from the centre to R2, the same one
#     R1 already sits on, so the top is a single smooth crown across;
#   bands 4-5 (the lower flank) are one quadratic curve from the crease R4 through R5 to the sill R6;
#   bands 2-3 (side glass / cowl / buttress side, and the shoulder plane the NACA sits on) lie
#     between real character lines and each bows outward by CROWN metres at its middle.
# SUBS is how many segments each band is drawn with.
CROWN = [0.0, 0.0, 0.006, 0.012, 0.0, 0.0, 0.0]
SUBS = [4, 3, 3, 4, 3, 2, 1]


def band_pt(l, b, u, r=None):
    """(s, z, dl) at fraction u from row b to row b+1 of the section at l."""
    r = r or ring(l)
    (sa, za), (sb, zb) = r[b], r[b + 1]
    dl = rake(l, b) + (rake(l, b + 1) - rake(l, b)) * u
    if b in (0, 1):
        t, (s2, z2) = r[0][1], r[2]
        s = sa + (sb - sa) * u
        return s, t + (z2 - t) * (s / s2) ** 2, dl
    if b in (4, 5):
        p4, p5, p6 = (Vector(r[k]) for k in (4, 5, 6))
        c = 2 * p5 - 0.5 * (p4 + p6)
        T = 0.5 * u if b == 4 else 0.5 + 0.5 * u
        p = (1 - T) ** 2 * p4 + 2 * T * (1 - T) * c + T * T * p6
        return p.x, p.y, dl
    ds, dz = sb - sa, zb - za
    n = math.hypot(ds, dz)
    if n < 1e-9:
        return sa, za, dl
    c = CROWN[b] * min(1.0, n / 0.25) * 4 * u * (1 - u)
    return sa + ds * u - dz / n * c, za + dz * u + ds / n * c, dl


def section(l):
    """The right half at l, centre first: (s, z, dl, band of the segment after it, row or None)."""
    r = ring(l)
    pts = []
    for b in range(7):
        for k in range(SUBS[b]):
            s, z, dl = band_pt(l, b, k / SUBS[b], r)
            pts.append((s, z, dl, b, b if k == 0 else None))
    pts.append((r[7][0], r[7][1], rake(l, 7), None, 7))
    return pts


def nose_face(z):
    """Where the raked nose face is at height z: its l and its lean from vertical."""
    r = ring(L_NOSE)
    pts = sorted((r[k][1], L_NOSE + rake(L_NOSE, k)) for k in range(3, 8))
    for (z0, l0), (z1, l1) in zip(pts, pts[1:]):
        if z <= z1 or (z1, l1) == pts[-1]:
            t = (z - z0) / (z1 - z0)
            return l0 + (l1 - l0) * t, math.atan2(l1 - l0, z1 - z0)


# The door outline in side view (l, z), and its window inside it.
def door_front(z):
    return 0.70 + (z - 0.20) * (0.16 / 0.58)


def door_rear(z):
    return -0.40 + (z - 0.20) * (-0.10 / 0.835)


DOOR_BOTTOM = 0.20
GLASS_FRAME = 0.05
WS_TOP, WS_BASE = -0.02, 0.90         # windscreen
RW_TOP, RW_BASE = -0.55, -0.80        # rear window
HINGE_S = 0.22

# Wheels: (l, s, tyre radius, tyre width)
FRONT = (1.25, 0.768, 0.303, 0.225)
REAR = (-1.25, 0.78, 0.311, 0.345)
RIM_R = 0.1905

# ---------------------------------------------------------------- materials

M = {}


def material(name, color, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.03, alpha=1.0,
             emit=None, emit_strength=0.0, ior_level=0.5):
    m = bpy.data.materials.new("sc_" + name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = ior_level
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = coat_rough
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = 'BLENDED'
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    m.diffuse_color = (*color, 1.0)
    m.metallic = metal
    m.roughness = rough
    M[name] = m
    return m


def make_materials():
    material("paint", (0.42, 0.008, 0.006), rough=0.32, coat=1.0, coat_rough=0.03)
    material("glass", (0.008, 0.010, 0.012), rough=0.03, alpha=0.38, ior_level=1.0)
    material("black", (0.012, 0.012, 0.013), rough=0.55)           # matte black plastic
    material("trim", (0.02, 0.02, 0.022), rough=0.3)               # satin black
    material("inner", (0.03, 0.03, 0.03), rough=0.8)               # inside of the shell
    material("leather", (0.36, 0.17, 0.07), rough=0.55)            # tan seats
    material("cabin", (0.035, 0.032, 0.03), rough=0.7)             # dash, tunnel, door cards
    material("carpet", (0.02, 0.02, 0.02), rough=0.95)
    material("chrome", (0.8, 0.8, 0.8), metal=1.0, rough=0.2)
    material("steel", (0.5, 0.5, 0.52), metal=1.0, rough=0.32)
    material("frit", (0.008, 0.008, 0.009), rough=0.12)
    material("lip", (0.85, 0.85, 0.86), metal=1.0, rough=0.08)          # polished rim lip
    material("tyre",(0.018, 0.018, 0.018), rough=0.85)
    material("rim", (0.52, 0.52, 0.54), metal=1.0, rough=0.34)
    material("disc", (0.35, 0.35, 0.36), metal=1.0, rough=0.45)
    material("caliper", (0.75, 0.45, 0.05), metal=0.3, rough=0.4)
    material("lens_red", (0.5, 0.0, 0.0), rough=0.08, emit=(1.0, 0.02, 0.01), emit_strength=0.6)
    material("lens_amber", (0.8, 0.28, 0.0), rough=0.08, emit=(1.0, 0.35, 0.0), emit_strength=0.3)
    material("lens_clear", (0.8, 0.8, 0.8), metal=0.6, rough=0.05)
    material("lens_white", (0.9, 0.9, 0.9), rough=0.08)
    material("mirror", (0.95, 0.95, 0.95), metal=1.0, rough=0.02)
    material("gauge", (0.01, 0.01, 0.01), rough=0.3, emit=(1.0, 0.5, 0.1), emit_strength=0.4)
    material("floor", (0.03, 0.03, 0.033), rough=0.22)


# ---------------------------------------------------------------- scene

def fresh_scene():
    tmp = bpy.data.scenes.new(NAME + "_new")
    for win in bpy.context.window_manager.windows:
        win.scene = tmp
    old = bpy.data.scenes.get(NAME)
    if old:
        for ob in list(old.objects):
            bpy.data.objects.remove(ob, do_unlink=True)

        def kill(c):
            for ch in list(c.children):
                kill(ch)
            bpy.data.collections.remove(c)

        for ch in list(old.collection.children):
            kill(ch)
        bpy.data.scenes.remove(old)
    for coll in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for d in list(coll):
            if d.name.startswith("sc.") and d.users == 0:
                coll.remove(d)
    for m in list(bpy.data.materials):
        if m.name.startswith("sc_") and m.users == 0:
            bpy.data.materials.remove(m)
    for w in list(bpy.data.worlds):
        if w.name.startswith("sc_world") and w.users == 0:
            bpy.data.worlds.remove(w)
    tmp.name = NAME
    return tmp


def collection(sc, name):
    c = bpy.data.collections.new(name)
    sc.collection.children.link(c)
    return c


def finish_shading(bm, angle=30.0):
    lim = radians(angle)
    # the nose and tail faces are flat strips a car wide: smooth normals interpolated across one
    # from its four corners draw a dark X over it, so they are shaded flat
    caps = bm.faces.layers.int.get("band")
    for f in bm.faces:
        f.smooth = not (caps is not None and f[caps] == 9)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim:
            e.smooth = False


def make_object(name, bm, mats, coll, parent=None, loc=None, angle=30.0):
    finish_shading(bm, angle)
    me = bpy.data.meshes.new("sc." + name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(M[m])
    ob = bpy.data.objects.new("car." + name, me)
    coll.objects.link(ob)
    if parent:
        ob.parent = parent
    if loc is not None:
        ob.location = loc
    return ob


def bevel(ob, width, segments=2, angle=30.0, harden=True):
    b = ob.modifiers.new("bevel", 'BEVEL')
    b.width = width
    b.segments = segments
    b.limit_method = 'ANGLE'
    b.angle_limit = radians(angle)
    b.harden_normals = harden
    # sharp miters: arc and patch miters throw vertices metres away where the boolean's seams
    # meet a bevelled crease
    b.miter_outer = 'MITER_SHARP'
    return b


def solidify(ob, thickness, mat_offset=1, even=True):
    s = ob.modifiers.new("solidify", 'SOLIDIFY')
    s.thickness = thickness
    s.offset = -1.0
    s.use_even_offset = even
    s.use_quality_normals = True
    s.use_rim = True
    s.material_offset = mat_offset
    s.material_offset_rim = mat_offset
    return s


def boolean(ob, cutter):
    b = ob.modifiers.new("cut", 'BOOLEAN')
    b.operation = 'DIFFERENCE'
    b.solver = 'EXACT'
    b.object = cutter
    b.material_mode = 'TRANSFER'
    b.use_hole_tolerant = True
    return b


def hide_cutter(ob, sc):
    ob.hide_render = True
    ob.display_type = 'WIRE'
    ob.hide_set(True, view_layer=sc.view_layers[0])


# ---------------------------------------------------------------- primitives into a bmesh

def faces_of(verts):
    return list({f for v in verts for f in v.link_faces})


def add_box(bm, mat, size, mtx):
    verts = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=Vector(size), verts=verts)
    bmesh.ops.transform(bm, matrix=mtx, verts=verts)
    for f in faces_of(verts):
        f.material_index = mat
    return verts


def add_box_ls(bm, mat, l0, l1, s0, s1, z0, z1):
    """An axis-aligned box from car coordinates (l, s, z) ranges."""
    c = V((l0 + l1) / 2, (s0 + s1) / 2, (z0 + z1) / 2)
    return add_box(bm, mat, (abs(s1 - s0), abs(l1 - l0), abs(z1 - z0)), Matrix.Translation(c))


def add_cyl(bm, mat, r, depth, mtx, segs=24):
    verts = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                                  radius1=r, radius2=r, depth=depth, matrix=mtx)['verts']
    for f in faces_of(verts):
        f.material_index = mat
    return verts


def lathe(bm, prof, segs, mat, closed, mtx=None):
    """Revolve (x, r) around the X axis. r == 0 is a pole. An open profile ordered from -x to +x
    on its outside faces outward."""
    angs = [2 * pi * k / segs for k in range(segs)]
    rings, allv = [], []
    for x, r in prof:
        if r < 1e-7:
            v = bm.verts.new((x, 0.0, 0.0))
            rings.append([v] * segs)
            allv.append(v)
        else:
            rg = [bm.verts.new((x, r * cos(a), r * sin(a))) for a in angs]
            rings.append(rg)
            allv += rg
    n = len(prof)
    faces = []
    for i in list(range(n - 1)) + ([n - 1] if closed else []):
        A, B = rings[i], rings[(i + 1) % n]
        for k in range(segs):
            k2 = (k + 1) % segs
            u = []
            for v in (A[k], A[k2], B[k2], B[k]):
                if v not in u:
                    u.append(v)
            if len(u) >= 3:
                try:
                    f = bm.faces.new(u)
                except ValueError:
                    continue
                f.material_index = mat
                faces.append(f)
    if mtx is not None:
        bmesh.ops.transform(bm, matrix=mtx, verts=allv)
    return faces


def superellipse(a, b, n=28, e=4.0):
    pts = []
    for k in range(n):
        t = 2 * pi * k / n
        c, s = cos(t), sin(t)
        pts.append((a * math.copysign(abs(c) ** (2 / e), c), b * math.copysign(abs(s) ** (2 / e), s)))
    return pts


def loft_pod(bm, center, secs, mat):
    """A pod lofted through rounded-rectangle sections (y, half width, half height) along +Y
    (rearward), its nose closed to a point and its back left as one flat face, returned."""
    rings = [[bm.verts.new(center + Vector((x, y, z))) for x, z in superellipse(a, b)] for y, a, b in secs]
    n = len(rings[0])
    faces = []
    for A, B in zip(rings, rings[1:]):
        faces += [bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k])) for k in range(n)]
    nose = bm.verts.new(center + Vector((0.0, secs[0][0] - 0.012, 0.0)))
    faces += [bm.faces.new((rings[0][(k + 1) % n], rings[0][k], nose)) for k in range(n)]
    back = bm.faces.new(rings[-1])
    faces.append(back)
    for f in faces:
        f.material_index = mat
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces, back


def solid_from_grids(bm, top, bot, mat):
    """A closed solid between two grids of verts top[i][j] and bot[i][j]."""
    ni, nj = len(top), len(top[0])
    out = []
    for i in range(ni - 1):
        for j in range(nj - 1):
            out.append(bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1])))
            out.append(bm.faces.new((bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j])))
    for i in range(ni - 1):
        out.append(bm.faces.new((top[i][0], bot[i][0], bot[i + 1][0], top[i + 1][0])))
        out.append(bm.faces.new((top[i][-1], top[i + 1][-1], bot[i + 1][-1], bot[i][-1])))
    for j in range(nj - 1):
        out.append(bm.faces.new((top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j])))
        out.append(bm.faces.new((top[-1][j], bot[-1][j], bot[-1][j + 1], top[-1][j + 1])))
    for f in out:
        f.material_index = mat
    bmesh.ops.recalc_face_normals(bm, faces=out)
    return out


def append_mesh(bm, me, mat_of):
    """Copy a mesh datablock into bm, mapping its material slot names to bm indices."""
    vs = [bm.verts.new(v.co) for v in me.vertices]
    for p in me.polygons:
        try:
            f = bm.faces.new([vs[i] for i in p.vertices])
        except ValueError:
            continue
        name = me.materials[p.material_index].name[3:] if me.materials else None
        f.material_index = mat_of.get(name, 0)


# ---------------------------------------------------------------- the body loft

def stations():
    keys = sorted({x for c in CURVES for x in c.xs if L_TAIL <= x <= L_NOSE} | {L_TAIL, L_NOSE})
    out = list(keys)
    n = int(round((L_NOSE - L_TAIL) / 0.035))
    for k in range(n + 1):
        x = L_TAIL + (L_NOSE - L_TAIL) * k / n
        if min(abs(x - kx) for kx in keys) > 0.012:
            out.append(x)
    return sorted(out)


def build_loft():
    bm = bmesh.new()
    lay_band = bm.faces.layers.int.new("band")
    lay_part = bm.faces.layers.int.new("part")
    grid = []
    sec0 = section(L_TAIL)
    n = len(sec0) - 1                        # points a side, not counting the centre
    bands = [p[3] for p in sec0]             # band of the segment after each point
    row3 = next(i for i, p in enumerate(sec0) if p[4] == 3)
    for l in stations():
        sec = section(l)
        vs = [bm.verts.new(V(l, 0.0, sec[0][1]))]
        vs += [bm.verts.new(V(l + dl, s, z)) for s, z, dl, _, _ in sec[1:]]
        vs += [bm.verts.new(V(l + dl, -s, z)) for s, z, dl, _, _ in sec[1:]]
        grid.append(vs)

    def right(i):
        return i

    def left(i):
        return 0 if i == 0 else n + i

    for j in range(len(grid) - 1):
        a, b = grid[j], grid[j + 1]
        for i in range(n):
            for side in (right, left):
                p, q = side(i), side(i + 1)
                f = bm.faces.new((a[p], b[p], b[q], a[q]))
                f[lay_band] = bands[i]
    # the tail is one flat face; its top dips between the buttresses, so it cannot be strips.
    # the nose above the belt row is one flat face (nothing there is raked); below it, strips of
    # symmetric trapezoids, each flat although raked, which never fold because the rows fall
    # steadily from the belt to the chin.
    vs = grid[0]
    caps = [bm.faces.new([vs[left(i)] for i in range(n, 0, -1)] + [vs[i] for i in range(n + 1)])]
    vs = grid[-1]
    caps.append(bm.faces.new([vs[left(i)] for i in range(row3, 0, -1)] + [vs[i] for i in range(row3 + 1)]))
    caps += [bm.faces.new((vs[i], vs[i + 1], vs[left(i + 1)], vs[left(i)])) for i in range(row3, n)]
    for f in caps:
        f[lay_band] = 9
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    roof = min((f for f in bm.faces if f[lay_band] == 0),
               key=lambda f: abs(f.calc_center_median().y + 0.3))
    if roof.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def line_plane(l1, z1, l2, z2):
    d = Vector((0.0, -(l2 - l1), z2 - z1))
    return V(l1, 0.0, z1), Vector((1, 0, 0)).cross(d).normalized()


def split_loft(bm):
    """Cut the door and window outlines into the skin and label every face with its part."""
    planes = [
        line_plane(door_front(0.0), 0.0, door_front(1.2), 1.2),
        line_plane(door_rear(0.0), 0.0, door_rear(1.2), 1.2),
        line_plane(door_front(0.0) - GLASS_FRAME, 0.0, door_front(1.2) - GLASS_FRAME, 1.2),
        line_plane(door_rear(0.0) + GLASS_FRAME, 0.0, door_rear(1.2) + GLASS_FRAME, 1.2),
        (Vector((0, 0, DOOR_BOTTOM)), Vector((0, 0, 1))),
    ]
    for co, no in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        # a cut landing within 3 mm of a loft vertex goes through that vertex instead of
        # leaving a sliver face, which the solidify offset would blow out into a spike
        bmesh.ops.bisect_plane(bm, geom=geom, dist=0.003, plane_co=co, plane_no=no)
    bmesh.ops.dissolve_degenerate(bm, dist=0.002, edges=bm.edges[:])
    lay_band = bm.faces.layers.int["band"]
    lay_part = bm.faces.layers.int["part"]
    # parts: 0 body, 1 glass, 2 door +X, 3 door -X (door glass is material 1 inside a door)
    for f in bm.faces:
        c = f.calc_center_median()
        l, s, z = -c.y, c.x, c.z
        band = f[lay_band]
        part, mat = 0, 0
        if band in (0, 1) and (WS_TOP < l < WS_BASE or RW_BASE < l < RW_TOP):
            part, mat = 1, 1
        elif band == 1 and door_rear(z) < l < WS_TOP:
            part = 2 if s > 0 else 3
        elif band in (2, 3, 4, 5) and door_rear(z) < l < door_front(z) and z > DOOR_BOTTOM:
            part = 2 if s > 0 else 3
            if band == 2 and door_rear(z) + GLASS_FRAME < l < door_front(z) - GLASS_FRAME:
                mat = 1
        f[lay_part] = part
        f.material_index = mat


def take(bm, part):
    b = bm.copy()
    lay = b.faces.layers.int["part"]
    bmesh.ops.delete(b, geom=[f for f in b.faces if f[lay] != part], context='FACES')
    return b


def gap(bm, faces, width):
    r = bmesh.ops.inset_region(bm, faces=faces, use_boundary=True, use_even_offset=True,
                               thickness=width, depth=0.0)
    bmesh.ops.delete(bm, geom=r['faces'], context='FACES')


def frit(bm, width):
    """The black ceramic band printed round the edge of a pane: material 1."""
    r = bmesh.ops.inset_region(bm, faces=bm.faces[:], use_boundary=True, use_even_offset=True,
                               thickness=width, depth=0.0)
    for f in r['faces']:
        f.material_index = 1


# ---------------------------------------------------------------- surface helpers

class Surface:
    def __init__(self, bm):
        self.bvh = BVHTree.FromBMesh(bm)

    def down(self, l, s):
        loc, no, _, _ = self.bvh.ray_cast(Vector((s, -l, 3.0)), Vector((0, 0, -1)))
        return loc, no

    def nearest(self, p):
        loc, no, _, _ = self.bvh.find_nearest(p)
        return loc, no


def groove_ring(bm, surf, pts_ls, half=0.0015, up=0.01, depth=0.005):
    """A closed tube following a closed outline (l, s) on the top of the body: a panel line cutter."""
    hits = [surf.down(l, s) for l, s in pts_ls]
    n = len(hits)
    quads = []
    for i in range(n):
        p, nrm = hits[i]
        t = (hits[(i + 1) % n][0] - hits[i - 1][0]).normalized()
        d = nrm.cross(t).normalized()
        quads.append([bm.verts.new(p + d * half + nrm * up), bm.verts.new(p - d * half + nrm * up),
                      bm.verts.new(p - d * half - nrm * depth), bm.verts.new(p + d * half - nrm * depth)])
    faces = []
    for i in range(n):
        a, b = quads[i], quads[(i + 1) % n]
        for k in range(4):
            k2 = (k + 1) % 4
            faces.append(bm.faces.new((a[k], b[k], b[k2], a[k2])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def rounded_rect(l0, l1, s0, s1, r, n=6):
    pts = []
    corners = [(l1 - r, s1 - r, 0), (l0 + r, s1 - r, 90), (l0 + r, s0 + r, 180), (l1 - r, s0 + r, 270)]
    for cl, cs, a0 in corners:
        for k in range(n + 1):
            a = radians(a0 + 90 * k / n)
            pts.append((cl + r * cos(a), cs + r * sin(a)))
    return pts


def surface_slab(bm, surf, l0, l1, s0, s1, nl, ns, up, down, mat):
    top, bot = [], []
    for i in range(nl + 1):
        l = l0 + (l1 - l0) * i / nl
        rt, rb = [], []
        for j in range(ns + 1):
            s = s0 + (s1 - s0) * j / ns
            p, nrm = surf.down(l, s)
            rt.append(bm.verts.new(p + nrm * up))
            rb.append(bm.verts.new(p - nrm * down))
        top.append(rt)
        bot.append(rb)
    return solid_from_grids(bm, top, bot, mat)


# ---------------------------------------------------------------- NACA duct on the door

NACA = [0.083, 0.196, 0.313, 0.425, 0.511, 0.592, 0.674, 0.755, 0.837, 0.918, 1.0]


def naca_cutter(bm, side, l_tip=0.22, l_mouth=-0.38):
    """The NACA submerged inlet on the sloping shoulder of the door, between the belt and the crease."""
    top, bot = [], []
    nu = len(NACA) - 1
    for i, wfrac in enumerate(NACA):
        u = i / nu
        l = l_tip + (l_mouth - l_tip) * u
        depth = 0.004 + 0.034 * u ** 1.5
        hw = 0.40 * wfrac
        rt, rb = [], []

        def shoulder(l, t):
            # t = 0 on the side crease (R4), 1 on the belt (R3), on the crowned surface between
            s, z, dl = band_pt(l, 3, 1.0 - t)
            return V(l + dl, side * s, z)

        for j in range(7):
            t = 0.5 + hw * (j / 3.0 - 1.0)
            p = shoulder(l, t)
            nrm = (shoulder(l + 0.01, t) - shoulder(l - 0.01, t)).cross(
                shoulder(l, t + 0.02) - shoulder(l, t - 0.02)).normalized()
            if nrm.x * side + nrm.z < 0:
                nrm = -nrm
            rt.append(bm.verts.new(p + nrm * 0.01))
            rb.append(bm.verts.new(p - nrm * depth))
        top.append(rt)
        bot.append(rb)
    return solid_from_grids(bm, top, bot, 0)


# ---------------------------------------------------------------- wheels

def wheel_bm(R, w, mirror):
    bm = bmesh.new()
    hw = w / 2
    rr = RIM_R
    hgt = R - rr

    def wall(sign):
        # one sidewall from the bead out to the shoulder: rim protector, the bulge, a raised band
        pts = [(0.014, 0.004), (0.004, 0.016), (-0.003, 0.034), (0.0, 0.05), (-0.004, 0.36 * hgt),
               (-0.0045, 0.47 * hgt), (-0.0065, 0.48 * hgt), (-0.0065, 0.60 * hgt), (-0.0045, 0.61 * hgt),
               (-0.003, 0.72 * hgt), (0.002, 0.85 * hgt), (0.009, hgt - 0.016), (0.021, hgt - 0.004),
               (0.036, hgt)]
        return [(sign * (hw - dx), rr + dr) for dx, dr in pts]

    prof = wall(-1)
    for xg in (-0.27 * w, -0.09 * w, 0.09 * w, 0.27 * w):
        prof += [(xg - 0.006, R), (xg - 0.005, R - 0.008), (xg + 0.005, R - 0.008), (xg + 0.006, R)]
    prof += list(reversed(wall(1)))
    tyre = lathe(bm, prof, 96, 0, closed=False)

    xo, xi = hw - 0.006, -hw + 0.006
    barrel = lathe(bm, [(xo, rr + 0.013), (xo - 0.012, rr + 0.013), (xo - 0.018, rr), (xi + 0.018, rr),
                        (xi + 0.012, rr + 0.013), (xi, rr + 0.013), (xi, rr - 0.008), (xo, rr - 0.008)],
                   96, 4, closed=True)
    bmesh.ops.recalc_face_normals(bm, faces=barrel)

    xf = hw - 0.036
    # the telephone-dial face, five round holes cut through it
    face_bm = bmesh.new()
    ff = lathe(face_bm, [(xf + 0.022, 0.0), (xf + 0.022, 0.056), (xf + 0.015, 0.066), (xf + 0.009, 0.085),
                         (xf + 0.004, 0.17), (xf + 0.001, rr - 0.004), (xf - 0.010, rr - 0.004),
                         (xf - 0.010, 0.0)], 96, 0, closed=True)
    bmesh.ops.recalc_face_normals(face_bm, faces=ff)
    cut_bm = bmesh.new()
    for k in range(5):
        a = 2 * pi * k / 5 + pi / 2
        mtx = Matrix.Translation((xf, 0.128 * cos(a), 0.128 * sin(a))) @ Matrix.Rotation(pi / 2, 4, 'Y')
        add_cyl(cut_bm, 0, 0.040, 0.08, mtx, segs=32)
    face_me = bpy.data.meshes.new("sc.tmp_face")
    face_bm.to_mesh(face_me)
    face_bm.free()
    face_me.materials.append(M["rim"])
    cut_me = bpy.data.meshes.new("sc.tmp_holes")
    cut_bm.to_mesh(cut_me)
    cut_bm.free()
    face_ob = bpy.data.objects.new("sc_tmp_face", face_me)
    cut_ob = bpy.data.objects.new("sc_tmp_holes", cut_me)
    bpy.context.scene.collection.objects.link(face_ob)
    bpy.context.scene.collection.objects.link(cut_ob)
    mod = face_ob.modifiers.new("holes", 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cut_ob
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    cut_face = bpy.data.meshes.new_from_object(face_ob.evaluated_get(dg))
    append_mesh(bm, cut_face, {"rim": 1})
    for ob in (face_ob, cut_ob):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in (face_me, cut_me, cut_face):
        bpy.data.meshes.remove(me)

    # lug nuts and centre cap
    for k in range(5):
        a = 2 * pi * k / 5
        mtx = Matrix.Translation((xf + 0.029, 0.040 * cos(a), 0.040 * sin(a))) @ Matrix.Rotation(pi / 2, 4, 'Y')
        add_cyl(bm, 1, 0.0095, 0.014, mtx, segs=6)
    cap = lathe(bm, [(xf + 0.02, 0.0), (xf + 0.02, 0.028), (xf + 0.03, 0.027), (xf + 0.037, 0.018),
                     (xf + 0.040, 0.0)], 32, 3, closed=True)
    bmesh.ops.recalc_face_normals(bm, faces=cap)

    # brake disc and its hat, seen through the holes
    xd0, xd1 = xf - 0.075, xf - 0.050
    disc = lathe(bm, [(xd0, 0.065), (xd1, 0.065), (xd1, 0.16), (xd0, 0.16)], 64, 2, closed=True)
    bmesh.ops.recalc_face_normals(bm, faces=disc)
    hat = lathe(bm, [(xf - 0.06, 0.0), (xf - 0.06, 0.07), (xf - 0.011, 0.07), (xf - 0.011, 0.0)], 48, 2, closed=True)
    bmesh.ops.recalc_face_normals(bm, faces=hat)

    # the tyre is open; make sure its tread faces out
    top = max(tyre, key=lambda f: f.calc_center_median().length)
    c = top.calc_center_median()
    if top.normal.dot(Vector((0, c.y, c.z))) < 0:
        bmesh.ops.reverse_faces(bm, faces=tyre)
    if mirror:
        for v in bm.verts:
            v.co.x = -v.co.x
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm, (xd0 + xd1) / 2


def caliper_bm(x, mirror):
    bm = bmesh.new()
    a = radians(50)
    r = 0.148
    mtx = Matrix.Translation((x, r * cos(a), r * sin(a))) @ Matrix.Rotation(a, 4, 'X')
    add_box(bm, 0, (0.056, 0.045, 0.105), mtx)
    if mirror:
        for v in bm.verts:
            v.co.x = -v.co.x
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


# ---------------------------------------------------------------- the build

def build():
    sc = fresh_scene()
    make_materials()
    car = collection(sc, "sc_car")
    cutters = collection(sc, "sc_cutters")
    studio_c = collection(sc, "sc_studio")

    root = bpy.data.objects.new(NAME, None)
    car.objects.link(root)
    root.empty_display_type = 'ARROWS'

    loft = build_loft()
    surf = Surface(loft)
    split_loft(loft)

    # --- body shell
    bm = take(loft, 0)
    body = make_object("body", bm, ["paint", "inner", "black"], car, root)
    solidify(body, 0.02)

    # panel lines and the louvre well, cut into the shell
    cb = bmesh.new()
    groove_ring(cb, surf, rounded_rect(1.02, 2.08, -0.30, 0.30, 0.06))          # front lid
    for side in (1, -1):
        s0, s1 = sorted((side * 0.38, side * 0.72))
        groove_ring(cb, surf, rounded_rect(1.66, 1.98, s0, s1, 0.03))            # pop-up lamp pods
    groove_ring(cb, surf, rounded_rect(-1.84, -0.86, -0.40, 0.40, 0.05))        # engine cover
    for side in (1, -1):
        s0, s1 = sorted((side * 0.53, side * 0.64))
        groove_ring(cb, surf, rounded_rect(-1.44, -1.30, s0, s1, 0.02))          # fuel filler flaps
    surface_slab(cb, surf, -1.62, -0.98, -0.31, 0.31, 12, 8, 0.01, 0.014, 0)    # louvre well
    seams = make_object("sc_seams", cb, ["black"], cutters, root)
    hide_cutter(seams, sc)
    boolean(body, seams)
    bevel(body, 0.004, 3, 28)

    # --- fixed glass: windscreen and rear window, each with a black frit band round its edge
    bm = take(loft, 1)
    gap(bm, bm.faces[:], 0.0015)
    frit(bm, 0.032)
    glass = make_object("glass", bm, ["glass", "frit"], car, root)
    solidify(glass, 0.005, 0, even=False)    # even offset spikes on the frit's thin corner faces

    # --- gull-wing doors, hinged on the roof
    doors = {}
    for part, side, tag in ((2, 1, "l"), (3, -1, "r")):
        bm = take(loft, part)
        gap(bm, bm.faces[:], 0.0035)
        hf = row_point(WS_TOP, 1, side)
        l_rear = door_rear(hf.z)
        hr = row_point(l_rear, 1, side)
        pivot = (hf + hr) / 2
        bmesh.ops.translate(bm, vec=-pivot, verts=bm.verts[:])
        gb = bm.copy()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == 1], context='FACES')
        bmesh.ops.delete(gb, geom=[f for f in gb.faces if f.material_index != 1], context='FACES')
        for f in gb.faces:
            f.material_index = 0
        gap(gb, gb.faces[:], 0.0012)
        frit(gb, 0.018)
        door = make_object("door_" + tag, bm, ["paint", "cabin", "black"], car, root, loc=pivot)
        solidify(door, 0.05)
        dglass = make_object("door_glass_" + tag, gb, ["glass", "frit"], car, door)
        solidify(dglass, 0.005, 0, even=False)
        nb = bmesh.new()
        naca_cutter(nb, side)
        bmesh.ops.translate(nb, vec=-pivot, verts=nb.verts[:])
        naca = make_object("sc_naca_" + tag, nb, ["black"], cutters, door)
        hide_cutter(naca, sc)
        boolean(door, naca)
        bevel(door, 0.004, 3, 28)
        doors[tag] = door

    # --- chassis: undertray and wheel tubs
    cb = bmesh.new()
    # stops short of the splitter's front edge and inside the rear valance, so neither shows it
    plan = [(1.68, 0.56), (0.84, 0.56), (0.84, 0.80), (-0.84, 0.80),
            (-0.84, 0.56), (-1.86, 0.56)]
    outline = [V(l, s, 0.12) for l, s in plan] + [V(l, -s, 0.12) for l, s in reversed(plan)]
    vs = [cb.verts.new(p) for p in outline]
    f = cb.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(cb, geom=[f])
    bmesh.ops.translate(cb, vec=(0, 0, 0.02), verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(cb, faces=cb.faces[:])
    tubs = {
        "front": [(1.66, 0.13), (1.645, 0.40), (1.43, 0.665), (1.07, 0.665), (0.855, 0.40), (0.84, 0.13)],
        # its back wall stops at the arch corner, so the tyre's tread shows from behind the car
        "rear": [(-0.84, 0.13), (-0.855, 0.42), (-1.07, 0.685), (-1.43, 0.685), (-1.645, 0.42), (-1.65, 0.30)],
    }
    for key, poly in tubs.items():
        lc = FRONT[0] if key == "front" else REAR[0]
        s_out = W(lc) - 0.06
        for side in (1, -1):
            inner = [cb.verts.new(V(l, side * 0.56, z)) for l, z in poly]
            outer = [cb.verts.new(V(l, side * s_out, z)) for l, z in poly]
            fs = [cb.faces.new(inner)]
            for i in range(len(poly) - 1):
                fs.append(cb.faces.new((inner[i], inner[i + 1], outer[i + 1], outer[i])))
            for fc in fs:
                fc.material_index = 0
    chassis = make_object("chassis", cb, ["black"], car, root)

    # --- cabin
    ib = bmesh.new()
    CAB, CARPET, LEATHER, TRIM, CHROME, GAUGE = 0, 1, 2, 3, 4, 5
    add_box_ls(ib, CARPET, -0.56, 0.94, -0.84, 0.84, 0.145, 0.16)                      # floor
    for side in (1, -1):
        add_box_ls(ib, CAB, -0.52, 0.74, side * 0.66, side * 0.85, 0.16, 0.42)          # sills
    add_box_ls(ib, CAB, -0.50, 0.62, -0.11, 0.11, 0.16, 0.38)                          # tunnel
    add_box_ls(ib, CAB, 0.55, 0.92, -0.78, 0.78, 0.50, 0.72)                           # dash
    add_box_ls(ib, CAB, 0.55, 0.72, 0.20, 0.54, 0.72, 0.80)                            # binnacle
    for s in (0.29, 0.45):
        add_cyl(ib, GAUGE, 0.036, 0.004, Matrix.Translation(V(0.548, s, 0.76)) @ Matrix.Rotation(pi / 2, 4, 'X'))
    add_box_ls(ib, CHROME, 0.18, 0.32, -0.05, 0.05, 0.38, 0.388)                       # shift gate
    lever = Matrix.Translation(V(0.25, 0.0, 0.47)) @ Matrix.Rotation(radians(-8), 4, 'X')
    add_cyl(ib, CHROME, 0.007, 0.17, lever, segs=12)
    bmesh.ops.create_uvsphere(ib, u_segments=16, v_segments=10, radius=0.022,
                              matrix=Matrix.Translation(V(0.24, 0.0, 0.565)))
    for s in (0.28, 0.36, 0.44):                                                       # pedals
        add_box(ib, CHROME, (0.05, 0.012, 0.075),
                Matrix.Translation(V(0.82, s, 0.26)) @ Matrix.Rotation(radians(-25), 4, 'X'))
    for l in (-0.56, 0.93):                                                            # bulkheads
        r = ring(l)
        pts = [(s - 0.03, max(z - 0.03, 0.16)) for s, z in r[1:7]]
        loopv = [ib.verts.new(V(l, 0.0, r[0][1] - 0.03))]
        loopv += [ib.verts.new(V(l, s, z)) for s, z in pts]
        loopv += [ib.verts.new(V(l, s, 0.16)) for s in (pts[-1][0],)]
        loopv += [ib.verts.new(V(l, -pts[-1][0], 0.16))]
        loopv += [ib.verts.new(V(l, -s, z)) for s, z in reversed(pts)]
        fc = ib.faces.new(loopv)
        fc.material_index = CARPET
    # steering wheel, driver on the left (+X)
    axis = Vector((0.0, 0.9, 0.42)).normalized()
    sw = Matrix.Translation(V(0.40, 0.36, 0.66)) @ Vector((1, 0, 0)).rotation_difference(axis).to_matrix().to_4x4()
    rim_prof = [(0.018 * cos(2 * pi * k / 12), 0.18 + 0.018 * sin(2 * pi * k / 12)) for k in range(12)]
    swf = lathe(ib, rim_prof, 48, TRIM, closed=True, mtx=sw)
    bmesh.ops.recalc_face_normals(ib, faces=swf)
    for a in (-90, 30, 150):
        add_box(ib, TRIM, (0.012, 0.17, 0.035),
                sw @ Matrix.Rotation(radians(a), 4, 'X') @ Matrix.Translation((0, 0.09, 0)))
    add_cyl(ib, TRIM, 0.04, 0.05, sw @ Matrix.Rotation(pi / 2, 4, 'Y'))
    add_cyl(ib, TRIM, 0.025, 0.35, sw @ Matrix.Translation((-0.19, 0, 0)) @ Matrix.Rotation(pi / 2, 4, 'Y'))
    cabin = make_object("cabin", ib, ["cabin", "carpet", "leather", "trim", "chrome", "gauge"], car, root)
    bevel(cabin, 0.006, 2, 40, harden=False)

    # seats: tan buckets with integral headrests
    sb = bmesh.new()
    for sx in (0.36, -0.36):
        o = V(0.0, sx, 0.17)
        add_box(sb, 0, (0.40, 0.50, 0.10), Matrix.Translation(o + Vector((0, 0, 0.06))))
        for bx in (-0.20, 0.20):
            add_box(sb, 0, (0.06, 0.50, 0.13), Matrix.Translation(o + Vector((bx, 0, 0.10))))
        hinge = Matrix.Translation(o + Vector((0, 0.24, 0.12))) @ Matrix.Rotation(radians(-20), 4, 'X')
        add_box(sb, 0, (0.40, 0.10, 0.62), hinge @ Matrix.Translation((0, 0.03, 0.31)))
        for bx in (-0.20, 0.20):
            add_box(sb, 0, (0.07, 0.14, 0.56), hinge @ Matrix.Translation((bx, 0.01, 0.30)))
        add_box(sb, 0, (0.26, 0.10, 0.17), hinge @ Matrix.Translation((0, 0.03, 0.70)))
    seats = make_object("seats", sb, ["leather"], car, root)
    bevel(seats, 0.022, 3, 40, harden=False)

    # --- airboxes on the rear fenders: the outer wall carries the flank straight up from the crease,
    # the top meets the buttress, the intake faces forward through a raked mouth
    ab = bmesh.new()
    for side in (1, -1):
        secs = []
        for lb, lt, ztop in ((-0.63, -0.555, 0.985), (-1.15, -1.09, 0.965)):
            lm = (lb + lt) / 2
            wo = W(lm) - 0.004
            zb = R4Z(lm) - 0.02
            pts = [(0.64, 0.92), (wo, zb), (wo, ztop - 0.04), (wo - 0.04, ztop), (0.64, ztop)]
            secs.append([ab.verts.new(V(lb + (lt - lb) * (z - zb) / (ztop - zb), side * s, z)) for s, z in pts])
        F, Rr = secs
        box = [ab.faces.new(F), ab.faces.new(list(reversed(Rr)))]
        box += [ab.faces.new((F[i], Rr[i], Rr[(i + 1) % 5], F[(i + 1) % 5])) for i in range(5)]
        bmesh.ops.recalc_face_normals(ab, faces=box)
        front = box[0]
        bmesh.ops.inset_individual(ab, faces=[front], thickness=0.026, depth=0.0)
        r2 = bmesh.ops.inset_individual(ab, faces=[front], thickness=0.003, depth=-0.09)
        front.material_index = 1
        for fc in r2['faces']:
            fc.material_index = 1
    airboxes = make_object("airboxes", ab, ["paint", "black"], car, root)
    bevel(airboxes, 0.012, 4, 30)

    # --- painted details: mirrors, louvre slats, rear wing
    pb = bmesh.new()
    PAINT, BLACK, MIRROR = 0, 1, 2
    for side in (1, -1):
        # mirror: a wedge pod, narrow at the front, glass set into its back, on a blade from the cowl
        base, _ = surf.down(0.86, side * 0.80)
        pod = V(0.80, side * 1.0, base.z + 0.095)
        pod_faces, back = loft_pod(pb, pod, [(-0.055, 0.05, 0.028), (-0.02, 0.08, 0.042), (0.045, 0.088, 0.046)],
                                   PAINT)
        r = bmesh.ops.inset_individual(pb, faces=[back], thickness=0.007, depth=-0.005)
        back.material_index = MIRROR
        foot = pod + Vector((-side * 0.05, 0.0, -0.025))
        stalk = foot - base
        add_box(pb, PAINT, (stalk.length + 0.03, 0.055, 0.012),
                Matrix.Translation((base + foot) / 2) @ Vector((1, 0, 0)).rotation_difference(stalk).to_matrix().to_4x4())
    for k in range(9):                                                                 # louvre slats
        l = -1.03 - k * 0.067
        p, nrm = surf.down(l, 0.0)
        add_box(pb, PAINT, (0.60, 0.05, 0.004),
                Matrix.Translation(p - nrm * 0.006) @ Matrix.Rotation(radians(-32), 4, 'X'))
    # rear wing: a level, inverted cambered blade on a V pylon, shaped endplates at its tips
    deck, _ = surf.down(-1.75, 0.0)
    wing_z, le, chord, span = 1.075, -1.60, 0.34, 0.82
    m_, p_, t_ = 0.025, 0.4, 0.10
    foil = []
    N = 28
    for k in range(N + 1):
        x = 0.5 * (1 - cos(pi * k / N))
        yt = 5 * t_ * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
        if x < p_:
            yc = m_ / p_ ** 2 * (2 * p_ * x - x * x)
            dy = 2 * m_ / p_ ** 2 * (p_ - x)
        else:
            yc = m_ / (1 - p_) ** 2 * ((1 - 2 * p_) + 2 * p_ * x - x * x)
            dy = 2 * m_ / (1 - p_) ** 2 * (p_ - x)
        th = math.atan(dy)
        foil.append((x - yt * sin(th), -(yc + yt * cos(th)), x + yt * sin(th), -(yc - yt * cos(th))))
    prof = [(f[0], f[1]) for f in reversed(foil)] + [(f[2], f[3]) for f in foil[1:-1]]

    def foil_point(x, y, s):
        return V(le - x * chord, s, wing_z + y * chord)

    rings = [[pb.verts.new(foil_point(x, y, s)) for x, y in prof] for s in (-span, span)]
    n = len(prof)
    wf = [pb.faces.new((rings[0][i], rings[0][(i + 1) % n], rings[1][(i + 1) % n], rings[1][i])) for i in range(n)]
    wf.append(pb.faces.new(rings[0]))
    wf.append(pb.faces.new(list(reversed(rings[1]))))
    bmesh.ops.recalc_face_normals(pb, faces=wf)
    for side in (1, -1):
        # endplate: a plate in side view, swept at the front, square at the back, 8 mm thick
        plate = [(le + 0.02, wing_z - 0.022), (le - 0.015, wing_z + 0.03), (le - chord - 0.005, wing_z + 0.038),
                 (le - chord - 0.02, wing_z + 0.015), (le - chord - 0.02, wing_z - 0.05), (le - 0.09, wing_z - 0.05)]
        s0, s1 = side * (span - 0.001), side * (span + 0.008)
        a = [pb.verts.new(V(l, s0, z)) for l, z in plate]
        b = [pb.verts.new(V(l, s1, z)) for l, z in plate]
        pf = [pb.faces.new(a), pb.faces.new(list(reversed(b)))]
        pf += [pb.faces.new((a[i], b[i], b[(i + 1) % 6], a[(i + 1) % 6])) for i in range(6)]
        bmesh.ops.recalc_face_normals(pb, faces=pf)
        # pylon leg: a tapering blade from the foot on the deck out and up into the wing's underside
        lc = -1.75
        foot = V(lc, side * 0.035, deck.z - 0.01)
        head = V(lc, side * 0.30, wing_z - 0.012)
        d = head - foot
        perp = d.cross(Vector((0, 1, 0))).normalized()
        vs = []
        for c, half_chord, half_t in ((foot, 0.07, 0.013), (head, 0.05, 0.009)):
            for dl, dp in ((half_chord, 0.0), (half_chord * 0.4, half_t), (-half_chord, half_t * 0.3),
                           (-half_chord, -half_t * 0.3), (half_chord * 0.4, -half_t)):
                vs.append(pb.verts.new(c + Vector((0, -dl, 0)) + perp * dp))
        A, B = vs[:5], vs[5:]
        lf = [pb.faces.new(A), pb.faces.new(list(reversed(B)))]
        lf += [pb.faces.new((A[i], B[i], B[(i + 1) % 5], A[(i + 1) % 5])) for i in range(5)]
        bmesh.ops.recalc_face_normals(pb, faces=lf)
    add_box(pb, PAINT, (0.16, 0.16, 0.014), Matrix.Translation(V(-1.75, 0.0, deck.z)))   # pylon foot
    parts = make_object("body_parts", pb, ["paint", "black", "mirror"], car, root)
    bevel(parts, 0.003, 2, 35)

    # --- black trim, lamps and exhausts, front and back
    tb = bmesh.new()
    BLK, TRM, CHR, RED, AMB, CLR, WHT = 0, 1, 2, 3, 4, 5, 6
    # chin: an air dam following the bottom edge of the raked nose exactly, 5 mm inside it, and
    # under it a 2 cm splitter blade standing 3 cm out at the sides and 5 cm out at the front
    def prism(plan, z0, z1):
        outline = [V(l, s, z0) for l, s in plan] + [V(l, -s, z0) for l, s in reversed(plan)]
        f = tb.faces.new([tb.verts.new(p) for p in outline])
        ext = bmesh.ops.extrude_face_region(tb, geom=[f])
        vs = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(tb, vec=(0, 0, z1 - z0), verts=vs)
        fs = faces_of(vs) + [f]
        for fc in fs:
            fc.material_index = BLK
        bmesh.ops.recalc_face_normals(tb, faces=fs)

    nose_ls = [1.85 + (L_NOSE - 1.85) * k / 16 for k in range(17)]
    dam = [(l + rake(l, 7) - 0.005, W(l) - 0.105) for l in nose_ls]
    fwd = [0.05 * min(1.0, max(0.0, (l - 1.95) / (L_NOSE - 1.95))) for l in nose_ls]
    blade = [(l + rake(l, 7) + f, W(l) - 0.07) for l, f in zip(nose_ls, fwd)]
    prism(dam, 0.185, 0.245)
    prism(blade, 0.168, 0.188)

    # nose: grille slot, lamp bezels and ribbed lenses on the raked front face
    def face_box(mat, s0, s1, z0, z1, proud):
        zc = (z0 + z1) / 2
        l, th = nose_face(zc)
        n = Vector((0.0, -cos(th), -sin(th)))
        c = V(l, (s0 + s1) / 2, zc) + n * (proud / 2 - 0.004)
        add_box(tb, mat, (abs(s1 - s0), proud, (z1 - z0) / cos(th)),
                Matrix.Translation(c) @ Matrix.Rotation(th, 4, 'X'))

    def ribs(z0, z1, n, gap=0.003):
        h = (z1 - z0) / n
        return [(z0 + h * k + gap / 2, z0 + h * (k + 1) - gap / 2) for k in range(n)]

    face_box(BLK, -0.36, 0.36, 0.30, 0.37, 0.010)
    for side in (1, -1):
        face_box(TRM, side * 0.385, side * 0.665, 0.285, 0.415, 0.011)
        for a, b in ribs(0.30, 0.40, 5):
            face_box(AMB, side * 0.54, side * 0.65, a, b, 0.017)
            face_box(CLR, side * 0.40, side * 0.53, a, b, 0.017)
    # tail: valance, grille, plate recess, ribbed lamp clusters, quad exhausts
    add_box_ls(tb, BLK, -1.935, -1.86, -0.60, 0.60, 0.16, 0.40)    # between the rear tyres
    add_box_ls(tb, BLK, -1.92, -1.905, -0.39, 0.39, 0.58, 0.80)
    for k in range(6):
        z = 0.60 + k * 0.035
        add_box_ls(tb, TRM, -1.93, -1.915, -0.38, 0.38, z, z + 0.012)
    add_box_ls(tb, BLK, -1.915, -1.905, -0.27, 0.27, 0.42, 0.56)
    for side in (1, -1):
        add_box_ls(tb, TRM, -1.925, -1.905, side * 0.40, side * 0.90, 0.60, 0.78)
        for a, b in ribs(0.615, 0.765, 6):
            add_box_ls(tb, RED, -1.934, -1.92, side * 0.72, side * 0.885, a, b)
            add_box_ls(tb, AMB, -1.934, -1.92, side * 0.56, side * 0.71, a, b)
        for a, b in ribs(0.665, 0.765, 4):
            add_box_ls(tb, RED, -1.934, -1.92, side * 0.41, side * 0.55, a, b)
        for a, b in ribs(0.615, 0.665, 2):
            add_box_ls(tb, WHT, -1.934, -1.92, side * 0.41, side * 0.55, a, b)
        for s in (0.20, 0.31):
            mtx = Matrix.Translation(V(-1.95, side * s, 0.33)) @ Matrix.Rotation(pi / 2, 4, 'X')
            lathe(tb, [(-0.06, 0.034), (0.052, 0.034), (0.058, 0.032), (0.06, 0.030), (0.056, 0.028),
                       (-0.04, 0.028)], 32, CHR, closed=False, mtx=mtx @ Matrix.Rotation(pi / 2, 4, 'Y'))
            add_cyl(tb, BLK, 0.028, 0.004, Matrix.Translation(V(-1.92, side * s, 0.33)) @ Matrix.Rotation(pi / 2, 4, 'X'))
    # the single long windscreen wiper: one continuous blade lying on the glass along its base,
    # and its arm beside it, each a ribbon that follows the glass's curve across
    def ribbon(l, s0, s1, lift, height, width, n=25):
        rings = []
        for k in range(n):
            s = s0 + (s1 - s0) * k / (n - 1)
            p, nrm = surf.down(l, s)
            rings.append((p, nrm))
        loops = []
        for k, (p, nrm) in enumerate(rings):
            t = (rings[min(k + 1, n - 1)][0] - rings[max(k - 1, 0)][0]).normalized()
            b = nrm.cross(t).normalized()
            loops.append([tb.verts.new(p + nrm * lift + b * width / 2),
                          tb.verts.new(p + nrm * (lift + height) + b * width / 2),
                          tb.verts.new(p + nrm * (lift + height) - b * width / 2),
                          tb.verts.new(p + nrm * lift - b * width / 2)])
        fs = []
        for A, B in zip(loops, loops[1:]):
            fs += [tb.faces.new((A[i], B[i], B[(i + 1) % 4], A[(i + 1) % 4])) for i in range(4)]
        fs.append(tb.faces.new(loops[0]))
        fs.append(tb.faces.new(list(reversed(loops[-1]))))
        for f in fs:
            f.material_index = BLK
        bmesh.ops.recalc_face_normals(tb, faces=fs)

    ribbon(0.87, -0.48, 0.38, 0.003, 0.011, 0.014)
    ribbon(0.855, -0.30, 0.22, 0.016, 0.007, 0.010)
    trim = make_object("trim", tb, ["black", "trim", "steel", "lens_red", "lens_amber", "lens_clear", "lens_white"],
                       car, root)
    bevel(trim, 0.002, 1, 40, harden=False)

    # --- wheels: a hub per corner (steers) holding the wheel (spins) and the caliper (does not)
    for tag, (lc, sc_, R, w) in (("f", FRONT), ("r", REAR)):
        for side, lr in ((1, "l"), (-1, "r")):
            hub = bpy.data.objects.new("car.hub_" + tag + lr, None)
            car.objects.link(hub)
            hub.parent = root
            hub.location = V(lc, side * sc_, R)
            hub.empty_display_size = 0.15
            wbm, xd = wheel_bm(R, w, side < 0)
            wheel = make_object("wheel_" + tag + lr, wbm, ["tyre", "rim", "disc", "trim", "lip"], car, hub, angle=40)
            bevel(wheel, 0.0015, 2, 40, harden=False)
            make_object("caliper_" + tag + lr, caliper_bm(xd, side < 0), ["caliper"], car, hub)

    studio(sc, studio_c)
    return sc, body, doors


def studio(sc, coll):
    world = bpy.data.worlds.new("sc_world")
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    lit = nt.nodes.new("ShaderNodeBackground")
    cam_bg = nt.nodes.new("ShaderNodeBackground")
    cam_bg.inputs["Color"].default_value = (0.035, 0.037, 0.04, 1)
    path = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    hdri_dir = os.path.join(bpy.utils.system_resource('DATAFILES'), "studiolights", "world")
    hdri = None
    for name in ("city.exr", "interior.exr", "sunrise.exr", "forest.exr"):
        if os.path.exists(os.path.join(hdri_dir, name)):
            hdri = os.path.join(hdri_dir, name)
            break
    if hdri:
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdri, check_existing=True)
        nt.links.new(env.outputs["Color"], lit.inputs["Color"])
    lit.inputs["Strength"].default_value = 0.35
    nt.links.new(path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(lit.outputs["Background"], mix.inputs[1])
    nt.links.new(cam_bg.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

    fb = bmesh.new()
    bmesh.ops.create_grid(fb, x_segments=1, y_segments=1, size=20.0)
    make_object("floor", fb, ["floor"], coll)

    # a car studio: one big softbox overhead, a long strip light down each side for the lines
    # along the flanks, a rim light behind; each aimed at the middle of the car
    def area(name, size, power, loc, shape='RECTANGLE'):
        d = bpy.data.lights.new("sc." + name, 'AREA')
        d.shape = shape
        d.size, d.size_y = size
        d.energy = power
        ob = bpy.data.objects.new("car." + name, d)
        coll.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (Vector((0, 0, 0.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return ob

    area("softbox", (2.4, 5.5), 800, (0.0, 0.0, 4.2))
    area("strip_l", (6.0, 0.35), 240, (4.2, 0.0, 1.6))
    area("strip_r", (6.0, 0.35), 240, (-4.2, 0.0, 1.6))
    area("rim", (4.0, 1.2), 350, (0.0, 5.5, 2.6))

    cam_d = bpy.data.cameras.new("sc.cam")
    cam_d.lens = 55
    cam = bpy.data.objects.new("car.cam", cam_d)
    coll.objects.link(cam)
    sc.camera = cam
    aim(cam, Vector((-5.2, -5.6, 1.45)), Vector((0, 0.1, 0.45)))

    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = engine
            break
        except TypeError:
            continue
    for attr in ("use_raytracing", "use_fast_gi"):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, True)
    sc.render.resolution_x = 1280
    sc.render.resolution_y = 720
    try:
        sc.view_settings.view_transform = 'Khronos PBR Neutral'
    except TypeError:
        sc.view_settings.view_transform = 'Standard'


def aim(cam, loc, target):
    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat('-Z', 'Y').to_euler()


sc, body, doors = build()
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
ev = body.evaluated_get(dg)
pts = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
result = {
    "body_l": [round(-max(p.y for p in pts), 3), round(-min(p.y for p in pts), 3)],
    "body_zmin": round(min(p.z for p in pts), 3),
    "length": round(max(p.y for p in pts) - min(p.y for p in pts), 3),
    "width": round(max(p.x for p in pts) - min(p.x for p in pts), 3),
    "height": round(max(p.z for p in pts), 3),
    "body_tris": sum(len(p.vertices) - 2 for p in ev.data.polygons),
    "objects": len(sc.objects),
}

# every evaluated mesh of the car stays inside the car's own box: a modifier that throws a vertex
# away (a solidify spike, a bevel miter) fails here instead of in a render
BOX = (Vector((-1.10, -2.35, -0.01)), Vector((1.10, 2.05, 1.20)))
stray = {}
for ob in sc.objects:
    if ob.type != 'MESH' or not ob.name.startswith("car.") or ob.name == "car.floor":
        continue
    me = ob.evaluated_get(dg).to_mesh()
    n = sum(1 for v in me.vertices
            if not all(BOX[0][i] <= (ob.matrix_world @ v.co)[i] <= BOX[1][i] for i in range(3)))
    ob.evaluated_get(dg).to_mesh_clear()
    if n:
        stray[ob.name] = n
result["STRAY"] = stray
assert not stray, stray

# `-- out.blend` saves the scene, for export_glb.py to export in a Blender of its own; any other
# argument is the next script's (views.py's folder)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if ARGS and ARGS[0].endswith('.blend'):
    # the car's scene alone, so the saved file opens on it: a file whose active scene is another
    # crashes Blender 5.1 in the export's depsgraph
    for other in [s for s in bpy.data.scenes if s != sc]:
        bpy.data.scenes.remove(other)
    bpy.ops.wm.save_as_mainfile(filepath=ARGS[0])
    print("saved", ARGS[0])
