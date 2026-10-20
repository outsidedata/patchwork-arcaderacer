# checks.py: what view.py and eye.py share. Imported by them, never run on its own.
#
#   G(v), B(p)        Blender's frame (+z up) to the glb's (+y up), and back
#   tree(objs)        one BVH over every mesh in the glb's frame, each triangle knowing its node:
#                     first(origin, d) is the node a ray meets first, and how far
#   coplanar(objs)    same-facing triangles in one plane (4 mm) sharing more than 5 × 5 mm, which
#                     z-fight in the game: prints where, and COPLANAR faces=<n> pairs=<n> PASS at 0
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


# The area two triangles share, each given as three 2D points in one plane.
def _shared(a, b):
    def area(p):
        return 0.5 * abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))))

    def ccw(p):
        return p if sum(p[i][0] * p[(i + 1) % 3][1] - p[(i + 1) % 3][0] * p[i][1] for i in range(3)) > 0 else p[::-1]

    out, clip = list(ccw(list(a))), ccw(list(b))
    for i in range(3):
        e0, e1 = clip[i], clip[(i + 1) % 3]
        side = lambda p: (e1[0] - e0[0]) * (p[1] - e0[1]) - (e1[1] - e0[1]) * (p[0] - e0[0])
        nxt = []
        for j in range(len(out)):
            p, q = out[j], out[(j + 1) % len(out)]
            sp, sq = side(p), side(q)
            if sp >= 0:
                nxt.append(p)
            if (sp >= 0) != (sq >= 0):
                t = sp / (sp - sq)
                nxt.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
        out = nxt
        if len(out) < 3:
            return 0.0
    return area(out)


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
    buckets = {}
    for k, (_, p, n, d) in enumerate(ts):
        buckets.setdefault((round(n.x * 100), round(n.y * 100), round(n.z * 100), round(d / sep)), []).append(k)
    pairs, places = 0, {}
    for key, ks in buckets.items():
        near = ks + buckets.get((key[0], key[1], key[2], key[3] + 1), [])
        mine = set(ks)
        for i in ks:
            _, p, n, d = ts[i]
            ax = (p[1] - p[0]).normalized()
            ay = n.cross(ax)
            flat = lambda q: (q.dot(ax), q.dot(ay))
            for j in near:
                if j <= i and j in mine:
                    continue
                _, q, m, e = ts[j]
                if n.dot(m) < math.cos(math.radians(0.6)) or abs(d - e) > sep:
                    continue
                s = _shared([flat(x) for x in p], [flat(x) for x in q])
                if s > floor * floor:
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
