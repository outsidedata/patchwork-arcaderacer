# checks.py: what view.py and eye.py share. Imported by them, never run on its own.
#
#   G(v), B(p)        Blender's frame (+z up) to the glb's (+y up), and back
#   tree(objs)        one BVH over every mesh in the glb's frame, each triangle knowing its node:
#                     first(origin, d) is the node a ray meets first, and how far
#   coplanar(objs)    same-facing triangles (0.6°) that overlap by more than 5 × 5 mm within 4 mm of
#                     each other, which z-fight in the game: prints where, and COPLANAR faces=<n>
#                     pairs=<n> PASS at 0. The 4 mm is measured where the two overlap: the overlap,
#                     in the first one's plane, cut to where the second lies within 4 mm of it. A
#                     plane's distance from the world origin is no measure of it: two faces 10 mm
#                     apart, leaning 0.5° from each other 5 m out, have that distance within 4 mm.
#   sheet(paths, out) the renders at `paths` laid out `cols` across, the first top left, as one PNG

import bpy, os, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def B(p):
    return Vector((p[0], -p[2], p[1]))


def G(v):
    return Vector((v.x, v.z, -v.y))


class Tree:
    def __init__(self, objs):
        self.verts, polys, self.owner = [], [], []
        for o in objs:
            me = o.data
            me.calc_loop_triangles()
            M = o.matrix_world
            base = len(self.verts)
            self.verts += [G(M @ v.co) for v in me.vertices]
            for t in me.loop_triangles:
                polys.append([base + i for i in t.vertices])
                self.owner.append(o.name)
        self.bvh = BVHTree.FromPolygons(self.verts, polys)

    def first(self, origin, d, far=1000.0):
        loc, nrm, i, dist = self.bvh.ray_cast(origin, d, far)
        return (self.owner[i], dist) if i is not None else (None, None)


def tree(objs):
    return Tree(objs)


def _area(p):
    return 0.5 * abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))))


# A convex polygon of 2D points cut to where f(point) >= 0, f linear.
def _keep(poly, f):
    out = []
    for j in range(len(poly)):
        p, q = poly[j], poly[(j + 1) % len(poly)]
        fp, fq = f(p), f(q)
        if fp >= 0:
            out.append(p)
        if (fp >= 0) != (fq >= 0):
            t = fp / (fp - fq)
            out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return out


# The polygon two triangles share, each given as three 2D points in one plane.
def _overlap(a, b):
    def ccw(p):
        return p if sum(p[i][0] * p[(i + 1) % 3][1] - p[(i + 1) % 3][0] * p[i][1] for i in range(3)) > 0 else p[::-1]

    out, clip = list(ccw(list(a))), ccw(list(b))
    for i in range(3):
        e0, e1 = clip[i], clip[(i + 1) % 3]
        out = _keep(out, lambda p: (e1[0] - e0[0]) * (p[1] - e0[1]) - (e1[1] - e0[1]) * (p[0] - e0[0]))
        if len(out) < 3:
            return []
    return out


def coplanar(objs, sep=0.004, floor=0.005):
    ts = []
    for o in objs:
        me = o.data
        me.calc_loop_triangles()
        M = o.matrix_world
        for t in me.loop_triangles:
            p = [G(M @ me.vertices[i].co) for i in t.vertices]
            n = (p[1] - p[0]).cross(p[2] - p[0])
            if n.length < 1e-12:
                continue
            n.normalize()
            m = me.materials[t.material_index].name if me.materials and me.materials[t.material_index] else '-'
            ts.append((f'{o.name}:{m}', p, n, n.dot(p[0])))
    # Candidates: faces whose normals round together to 0.05 (about 3°, every neighbouring cell looked
    # in, so two normals 0.6° apart are never in cells that are not neighbours) and whose distance from
    # the origin rounds together to 0.1 m (two faces lying on each other within 0.6° of each other, as
    # far as 8 m out, differ in it by under 0.09 m).
    NC, DC = 20, 0.1
    buckets = {}
    for k, (_, p, n, d) in enumerate(ts):
        buckets.setdefault((round(n.x * NC), round(n.y * NC), round(n.z * NC), round(d / DC)), []).append(k)
    steps = [(a, b, c, e) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1) for e in (-1, 0, 1)]
    lean = math.cos(math.radians(0.6))
    pairs, places = 0, {}
    for i, (_, p, n, d) in enumerate(ts):
        key = (round(n.x * NC), round(n.y * NC), round(n.z * NC), round(d / DC))
        ax = (p[1] - p[0]).normalized()
        ay = n.cross(ax)
        flat = lambda q: ((q - p[0]).dot(ax), (q - p[0]).dot(ay))
        for s in steps:
            for j in buckets.get((key[0] + s[0], key[1] + s[1], key[2] + s[2], key[3] + s[3]), ()):
                if j <= i:
                    continue
                _, q, m, e = ts[j]
                if n.dot(m) < lean:
                    continue
                shared = _overlap([flat(x) for x in p], [flat(x) for x in q])
                if not shared:
                    continue
                # How far the second face lies off the first, at a point (u, v) of the first's plane.
                off = lambda uv: m.dot(p[0] + ax * uv[0] + ay * uv[1]) - e
                shared = _keep(shared, lambda uv: sep - off(uv))
                if len(shared) >= 3:
                    shared = _keep(shared, lambda uv: sep + off(uv))
                if len(shared) >= 3 and _area(shared) > floor * floor:
                    pairs += 1
                    c = (p[0] + p[1] + p[2]) / 3
                    k2 = (ts[i][0], ts[j][0], round(c.x / 0.05), round(c.y / 0.05), round(c.z / 0.05))
                    places[k2] = places.get(k2, 0) + 1
    for (a, b, *at), k in sorted(places.items(), key=lambda kv: -kv[1])[:20]:
        print(f'  COPLANAR {a} / {b} pairs={k} near=[{at[0] * 0.05:.2f}, {at[1] * 0.05:.2f}, {at[2] * 0.05:.2f}]')
    print(f'COPLANAR faces={len(ts)} pairs={pairs} {"PASS" if pairs == 0 else "FAIL"}')
    return pairs


def sheet(paths, out, cols=2):
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p)
        w, h = im.size
        imgs.append(np.array(im.pixels[:]).reshape(h, w, 4))
        bpy.data.images.remove(im)
    h, w = imgs[0].shape[:2]
    rows = (len(imgs) + cols - 1) // cols
    big = np.ones((h * rows, w * cols, 4))
    for k, im in enumerate(imgs):
        r, c = k // cols, k % cols
        big[h * (rows - 1 - r):h * (rows - r), w * c:w * (c + 1)] = im      # pixels run bottom-up
    im = bpy.data.images.new('sheet', w * cols, h * rows, alpha=True)
    im.pixels = big.ravel()
    im.filepath_raw = out
    im.file_format = 'PNG'
    im.save()
    for p in paths:
        os.remove(p)
    print('RENDER', out)
