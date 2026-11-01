# kit.py: the building blocks box3dvehicle's model scripts (truck.py) build with, in Blender 5.1.
# `node` here takes a turn, so a lamp's beam can dip.
#
# Every script here builds in the game's frame, the chassis's: +x forward, +y up, +z the machine's
# right, in metres. `B` turns a game point into Blender's (+X forward, +Z up, -Y right), which the
# glTF exporter turns back into the game's frame (Blender's +Z up is glTF +Y, Blender's -Y is glTF
# +Z), so a vertex built at game [x, y, z] is at [x, y, z] in the exported glb.
#
# A `Part` is one node of the glb: a mesh with its own name, its origin at `origin` (game frame),
# so a part a game turns (a reel, a coulter, a tailgate) turns about its own origin, and with `turn`
# (a 3 × 3 matrix in the game's frame, its columns the node's x, y and z) its node turned so, its mesh
# built where it stands all the same, so a part a game turns about an axis of its own (a steering
# wheel about its column) has that axis as one of its node's. Every primitive
# is built in a scratch bmesh, its edges sharper than `crease` radians bevelled `bevel` metres in
# `seg` segments, every face smooth and every edge sharper than `sharp` radians kept sharp, and is
# appended to its Part with its material; `build` weights every corner's normal by the areas of the
# faces that meet there, so flat panels shade flat between their rounded edges. The primitives: `box`/`block` (boxes), `cyl`/`rod`
# (cylinders and cones), `sphere`, `slab` (an outline pushed through a plane; `band`, `arc` and
# `rrect` make outlines), `loft` (rings bridged), `tube` (a mitred pipe along a polyline), `sheet`
# and `quad` (thickened surfaces), `corrugated` (box-profile steel sheet) and `ribs`. `build` makes
# each Part an object; `node` adds an empty (a lamp's beam, a hinge), turned `dip` radians nose-down
# about the game's z (a beam leaves along the node's +x). `export(path)` writes the glb to
# `path` and prints each node's name, the triangles, and the bounding box in the game's frame.
#
# Materials are flat PBR: `paint` (a clearcoat over a low-roughness base), `steel`, `rubber`,
# `glass` (alpha below 1, blended), `lamp` (emissive) and plain `mat`. Colours are sRGB, as the
# scene writes them (an int 0xRRGGBB or '#rrggbb'), turned linear for Blender.

import bpy, bmesh, math, os
from mathutils import Vector, Matrix


def B(p):
    return Vector((p[0], -p[2], p[1]))


# `B` as a matrix: a turn `R` in the game's frame is `TO_B @ R @ TO_B.inverted()` in Blender's.
TO_B = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    PARTS.clear()


# ------------------------------------------------------------------------------------------- materials

def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(colour):
    if isinstance(colour, str):
        colour = int(colour.lstrip('#'), 16)
    if isinstance(colour, int):
        colour = ((colour >> 16) & 255, (colour >> 8) & 255, colour & 255)
        return tuple(_lin(c / 255) for c in colour)
    return tuple(colour)


MATS = {}


def mat(name, colour, rough=0.5, metal=0.0, alpha=1.0, emit=0.0, coat=0.0, coat_rough=0.06):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    try:
        if not m.use_nodes:
            m.use_nodes = True
    except AttributeError:
        pass
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = rgb(colour)
    p.inputs['Base Color'].default_value = (*c, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    if emit:
        p.inputs['Emission Color'].default_value = (*c, 1)
        p.inputs['Emission Strength'].default_value = emit
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = coat_rough
    m.diffuse_color = (*c, alpha)
    MATS[name] = m
    return m


def paint(name, colour):
    return mat(name, colour, rough=0.32, metal=0.0, coat=1.0)


def steel(name='steel', colour=0x8a8d90, rough=0.38):
    return mat(name, colour, rough=rough, metal=1.0)


def rubber(name='rubber', colour=0x1c1c1c):
    return mat(name, colour, rough=0.85)


def glass(name='glass', colour=0x9fc7d6, alpha=0.32):
    return mat(name, colour, rough=0.05, alpha=alpha)


def lamp(name, colour, emit=0.6):
    return mat(name, colour, rough=0.15, emit=emit)


# -------------------------------------------------------------------------------------------- parts

PARTS = []


class Part:
    def __init__(self, name, origin=(0, 0, 0), turn=None):
        self.name, self.origin = name, Vector(origin)
        self.turn = Matrix.Identity(3) if turn is None else Matrix(turn).to_3x3()
        self.bm, self.mats = bmesh.new(), []
        PARTS.append(self)

    def index(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    # Take a scratch bmesh built in the game's frame: bevel, smooth, turn into Blender's frame, append.
    def take(self, bm, m, bevel=0.0, seg=2, crease=0.5, sharp=0.7):
        bm.normal_update()
        if bevel > 0:
            edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > crease]
            if edges:
                bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type='OFFSET', segments=seg, profile=0.5,
                                affect='EDGES', clamp_overlap=True)
        bm.normal_update()
        i = self.index(m)
        for f in bm.faces:
            f.material_index = i
            f.smooth = True
        for e in bm.edges:
            e.smooth = not (len(e.link_faces) != 2 or e.calc_face_angle(0) > sharp)
        for v in bm.verts:
            v.co = B(v.co)
        me = bpy.data.meshes.new('tmp')
        bm.to_mesh(me)
        bm.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return self


def _new():
    return bmesh.new()


def _orient(bm, axis):
    a = Vector(axis).normalized()
    q = Vector((0, 0, 1)).rotation_difference(a)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix())


def _place(bm, at, rot=None):
    if rot is not None:
        R = rot.to_matrix() if hasattr(rot, 'to_matrix') else Matrix(rot)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=R)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(at))


def euler(x=0.0, y=0.0, z=0.0):
    from mathutils import Euler
    return Euler((x, y, z), 'XYZ')


# A box `size` [x, y, z] centred at `at`, turned by `rot` (an Euler in the game's frame).
def box(part, size, at, m, bevel=0.015, seg=2, rot=None):
    bm = _new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    _place(bm, at, rot)
    return part.take(bm, m, bevel, seg)


# A box between corners `lo` and `hi`, in either order along each axis: a box built with a negative
# size is turned inside out, every face looking in.
def block(part, lo, hi, m, bevel=0.015, seg=2):
    lo, hi = [min(lo[i], hi[i]) for i in range(3)], [max(lo[i], hi[i]) for i in range(3)]
    size = [hi[i] - lo[i] for i in range(3)]
    at = [(hi[i] + lo[i]) / 2 for i in range(3)]
    return box(part, size, at, m, bevel, seg)


# A cylinder `r` round (`r2` at its far end), `length` long along `axis`, centred at `at`.
def cyl(part, r, length, at, axis, m, segs=24, bevel=0.0, r2=None, seg=2, caps=True):
    bm = _new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=length)
    _orient(bm, axis)
    _place(bm, at)
    return part.take(bm, m, bevel, seg)


# A cylinder from point `a` to point `b`.
def rod(part, a, b, r, m, segs=12, bevel=0.0, r2=None):
    a, b = Vector(a), Vector(b)
    return cyl(part, r, (b - a).length, (a + b) / 2, b - a, m, segs, bevel, r2)


def sphere(part, r, at, m, segs=16, rings=8, scale=(1, 1, 1)):
    bm = _new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    _place(bm, at)
    return part.take(bm, m, 0)


# An outline extruded: `pts` 2D, read in `plane`, pushed from `a` to `b` across it.
#   'side'  pts are (x, y), pushed along z     'front' pts are (z, y), pushed along x
#   'top'   pts are (x, z), pushed along y
def slab(part, pts, plane, a, b, m, bevel=0.012, seg=2, crease=0.5):
    bm = _new()
    def at(p, d):
        if plane == 'side':
            return (p[0], p[1], d)
        if plane == 'front':
            return (d, p[1], p[0])
        return (p[0], d, p[1])
    vs = [bm.verts.new(at(p, a)) for p in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [v for v in r['geom'] if isinstance(v, bmesh.types.BMVert)]
    d = {'side': (0, 0, b - a), 'front': (b - a, 0, 0), 'top': (0, b - a, 0)}[plane]
    bmesh.ops.translate(bm, verts=moved, vec=Vector(d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return part.take(bm, m, bevel, seg, crease)


# A band: the 2D polyline `path` thickened `thick` to its left (inward for a counter-clockwise arc;
# a negative `thick` thickens it to its right, outward).
def band(path, thick):
    out = []
    n = len(path)
    for i, p in enumerate(path):
        a = Vector(path[max(i - 1, 0)])
        b = Vector(path[min(i + 1, n - 1)])
        t = (b - a).normalized()
        nrm = Vector((-t.y, t.x))
        out.append(Vector(p) + nrm * thick)
    return [tuple(p) for p in path] + [tuple(p) for p in reversed(out)]


def arc(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


# A rectangle w wide and h high centred on (cx, cy), counter-clockwise, its top corners rounded r and
# its bottom corners rb (r when not given), each in n steps; a radius of 0 is a square corner.
def rrect(w, h, r, n=4, cx=0.0, cy=0.0, rb=None):
    rb = r if rb is None else rb
    pts = []
    for sx, sy, a, rr in ((1, 1, 0, r), (-1, 1, 90, r), (-1, -1, 180, rb), (1, -1, 270, rb)):
        x, y = cx + sx * (w / 2 - rr), cy + sy * (h / 2 - rr)
        if rr <= 0:
            pts.append((x, y))
            continue
        for i in range(n + 1):
            t = math.radians(a + 90 * i / n)
            pts.append((x + rr * math.cos(t), y + rr * math.sin(t)))
    return pts


# Rings bridged: `rings` a list of closed loops of 3D points (game frame), each the same count.
def loft(part, rings, m, bevel=0.0, caps=True, sharp=0.7, closed=False):
    bm = _new()
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vr, vr[1:] + ([vr[0]] if closed else [])):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([a[i], a[j], b[j], b[i]])
    if caps and not closed:
        bm.faces.new(list(reversed(vr[0])))
        bm.faces.new(vr[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return part.take(bm, m, bevel, sharp=sharp)


# A tube `r` round along the polyline `pts` (game frame), mitred at each corner.
def tube(part, pts, r, m, segs=12, closed=False, caps=True):
    P = [Vector(p) for p in pts]
    if closed:
        P = P + [P[0]]
    S = [(P[i + 1] - P[i]).normalized() for i in range(len(P) - 1)]
    t0 = S[0]
    up = Vector((0, 1, 0)) if abs(t0.y) < 0.9 else Vector((1, 0, 0))
    N = t0.cross(up).normalized()
    frames = []
    for j, s in enumerate(S):
        if j:
            N = (S[j - 1].rotation_difference(s).to_matrix() @ N).normalized()
        frames.append((N, s.cross(N).normalized()))
    rings = []
    for i in range(len(P)):
        if i == 0 and not closed:
            j, plane = 0, S[0]
        elif i == len(P) - 1 and not closed:
            j, plane = len(S) - 1, S[-1]
        else:
            j = i - 1 if i > 0 else len(S) - 1
            nxt = S[i] if i < len(S) else S[0]
            plane = (S[j] + nxt).normalized()
        n_, b_ = frames[j]
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            c = P[i] + r * (math.cos(a) * n_ + math.sin(a) * b_)
            d = S[j].dot(plane)
            t = (P[i] - c).dot(plane) / d if abs(d) > 1e-6 else 0
            ring.append(c + S[j] * t)
        rings.append(ring)
    if closed:
        rings = rings[:-1]
    return loft(part, rings, m, caps=caps and not closed, closed=closed)


# A surface `f(u, v)` over [0,1]², nu × nv quads, thickened `thick` along its normal.
def sheet(part, f, nu, nv, thick, m, bevel=0.0):
    bm = _new()
    vs = [[bm.verts.new(f(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            bm.faces.new([vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]])
    bm.normal_update()
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thick)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return part.take(bm, m, bevel, sharp=1.0)


# A flat four-cornered panel a → b → c → d (counter-clockwise seen from its front), `thick` thick.
def quad(part, a, b, c, d, thick, m, bevel=0.0):
    A, Bv, C, D = (Vector(p) for p in (a, b, c, d))
    f = lambda u, v: (A * (1 - u) + Bv * u) * (1 - v) + (D * (1 - u) + C * u) * v
    return sheet(part, f, 1, 1, thick, m, bevel)


# A box-profile (trapezoid ribbed) steel sheet: from corner A, `lu` along U across its ribs and `lv`
# along V down them, its ribs `depth` proud along N (U × V turned to face `out`) every `pitch`,
# `thick` thick.
def corrugated(part, A, U, V, lu, lv, pitch, depth, thick, m, out=None):
    A, U, V = Vector(A), Vector(U).normalized(), Vector(V).normalized()
    N = U.cross(V).normalized()
    if out is not None and N.dot(Vector(out)) < 0:
        N = -N
    prof = []                     # (s along U, offset along N)
    n = max(1, int(round(lu / pitch)))
    p = lu / n
    for k in range(n):
        s = k * p
        prof += [(s, 0.0), (s + 0.3 * p, 0.0), (s + 0.42 * p, depth), (s + 0.88 * p, depth)]
    prof.append((lu, 0.0))
    bm = _new()
    rows = [[bm.verts.new(A + U * s + N * o + V * t) for s, o in prof] for t in (0.0, lv)]
    for i in range(len(prof) - 1):
        bm.faces.new([rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]])
    bm.normal_update()
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thick)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return part.take(bm, m, 0.0, sharp=1.2)


# A grid of thin boxes or ribs: handy for slats, gratings and ribs.
def ribs(part, count, first, step, size, m, bevel=0.004):
    for k in range(count):
        at = [first[i] + step[i] * k for i in range(3)]
        box(part, size, at, m, bevel, 1)


# ---------------------------------------------------------------------------------------- the scene

def node(name, at, parent=None, dip=0.0):
    o = bpy.data.objects.new(name, None)
    o.empty_display_type = 'ARROWS'
    o.empty_display_size = 0.2
    o.location = B(at)
    # the game's z is Blender's −y: nose-down about the game's z is a positive turn about Blender's y
    o.rotation_euler = (0.0, dip, 0.0)
    bpy.context.scene.collection.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


def _key(co):
    return tuple(round(c, 6) for c in co)


# `bm` made again with every face starting from its least corner (its winding kept) and the faces in
# the order of their material, centre, normal and corners, to 6 places; each vertex is made where a
# face first uses it, and each edge keeps its smooth or sharp flag. A new bmesh: `bm` is left as it was.
def canonical(bm):
    bm.normal_update()
    bm.verts.index_update()
    faces = []
    for f in bm.faces:
        vs = list(f.verts)
        k = min(range(len(vs)), key=lambda i: _key(vs[i].co))
        vs = vs[k:] + vs[:k]
        faces.append(((f.material_index, _key(f.calc_center_median()), _key(f.normal), tuple(_key(v.co) for v in vs)), vs, f.smooth))
    faces.sort(key=lambda t: t[0])
    out, made = bmesh.new(), {}
    for (mi, *_), vs, smooth in faces:
        nv = []
        for v in vs:
            if v.index not in made:
                made[v.index] = out.verts.new(v.co)
            nv.append(made[v.index])
        nf = out.faces.new(nv)
        nf.material_index = mi
        nf.smooth = smooth
    for e in bm.edges:
        a, b = e.verts
        if a.index in made and b.index in made:
            ne = out.edges.get((made[a.index], made[b.index]))
            if ne is not None:
                ne.smooth = e.smooth
    out.normal_update()
    return out


def build():
    objs = {}
    for p in PARTS:
        me = bpy.data.meshes.new(p.name)
        bmesh.ops.translate(p.bm, verts=p.bm.verts, vec=-B(p.origin))
        # the node's turn in Blender's frame; its mesh is turned back by as much, so it stays where it was built
        turn = TO_B @ p.turn @ TO_B.inverted()
        bmesh.ops.rotate(p.bm, verts=p.bm.verts, cent=(0, 0, 0), matrix=turn.inverted())
        # The bmesh ops (the bevel among them) hand out the same faces in a different order, each
        # starting from a different corner, from build to build; the triangulation splits a quad from
        # its first corner and the export writes faces and corners in the order it is given. So each
        # part is made canonical (every face from its least corner, the faces in an order read off the
        # geometry), triangulated, and made canonical again: the glb is the same bytes every build.
        bm = canonical(p.bm)
        bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='FIXED', ngon_method='EAR_CLIP')
        # the bevel leaves slivers of no area where it clamps; they draw nothing
        flat = [f for f in bm.faces if f.calc_area() < 1e-10]
        if flat:
            bmesh.ops.delete(bm, geom=flat, context='FACES_ONLY')
        p.bm.free()
        p.bm = canonical(bm)
        bm.free()
        p.bm.to_mesh(me)
        p.bm.free()
        for m in p.mats:
            me.materials.append(m)
        o = bpy.data.objects.new(p.name, me)
        o.location = B(p.origin)
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = turn.to_quaternion()
        bpy.context.scene.collection.objects.link(o)
        # a flat face's corners take their normal from the face, not from the bevel round it: each
        # corner's normal weighted by the areas of the faces meeting there (sharp edges kept), which the
        # export applies; without it a flat panel shades in a cross between its rounded edges
        wn = o.modifiers.new('weighted', 'WEIGHTED_NORMAL')
        wn.mode = 'FACE_AREA'
        wn.keep_sharp = True
        objs[p.name] = o
    PARTS.clear()
    return objs


def report(path):
    bpy.context.view_layer.update()
    tris, lo, hi = 0, [1e9] * 3, [-1e9] * 3
    print('GLB', path)
    for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        par = o.parent.name if o.parent else '-'
        if o.type == 'MESH':
            me = o.data
            me.calc_loop_triangles()
            n = len(me.loop_triangles)
            tris += n
            for v in me.vertices:
                w = o.matrix_world @ v.co
                g = (w.x, w.z, -w.y)
                for i in range(3):
                    lo[i], hi[i] = min(lo[i], g[i]), max(hi[i], g[i])
            org = o.matrix_world.translation
            print(f'  NODE mesh  {o.name:<14} parent={par:<10} origin=[{org.x:.3f}, {org.z:.3f}, {-org.y:.3f}] tris={n} mats={[m.name for m in me.materials]}')
        else:
            org = o.matrix_world.translation
            print(f'  NODE empty {o.name:<14} parent={par:<10} origin=[{org.x:.3f}, {org.z:.3f}, {-org.y:.3f}]')
    print(f'  TRIS {tris}')
    print(f'  BBOX x [{lo[0]:.3f}, {hi[0]:.3f}]  y [{lo[1]:.3f}, {hi[1]:.3f}]  z [{lo[2]:.3f}, {hi[2]:.3f}]')
    return tris


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              use_selection=False, export_cameras=False, export_lights=False)
    report(path)
    return path
