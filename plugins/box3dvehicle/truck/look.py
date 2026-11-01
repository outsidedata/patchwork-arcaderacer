# look.py: the viewer of box3dvehicle's vehicle models (truck.py's).
#
#   node --experimental-strip-types plugins/box3dvehicle/truck/parts.ts <scene.json> <vehicle> <outdir>   (a look with `solid`)
#   Blender -b --python plugins/box3dvehicle/truck/look.py -- <scene.json> <vehicle> <model.glb> <outdir>
#
# <vehicle> is a vehicle of `world.box3dvehicle.vehicles` in <scene.json> whose look has a `model`, and
# <model.glb> its model. Read off the scene, it:
#   - stands the model on its ground: each axle's hub at rest is the spring's mount less its length
#     plus its sag, the ground a wheel's radius under it;
#   - puts a marker wheel (a cylinder of the axle's wheel radius and width) at each axle's `at` and
#     `track`, and in the plan views ghosts of each wheel steered full lock (red) and pushed to full
#     travel (blue). The markers are the viewer's own and are never exported;
#   - prints COPLANAR: every pair of triangles facing the same way in one plane (within 4 mm, any
#     orientation) that overlap by more than 5 mm × 5 mm, which z-fight, and their count, PASS at 0;
#   - prints the CLEAR of every wheel in every state: the least distance from the model's surface
#     (its vertices and points sampled every 4 cm over its faces) to the wheel, negative inside;
#   - with `look.solid`, reads what box3dvehicle draws of the solid axles in every state from
#     <outdir>/<vehicle>-parts.json, which `parts.ts` beside this file writes off the plugin's own
#     `solidParts` (run it first, above), and
#     prints for each part the ROOM it has against the model and its TYRE gap against its axle's two
#     wheels (the steel wheel's dish hollow, where the knuckles and brakes sit), each at its worst
#     state; the SHOCK left between each shock's lower mount and its body's foot, and each coil over
#     its solid height; and each axle's STRAP length against the farthest its ends are pulled apart;
#     and renders the axles worked, crossed, pushed in at full lock and at full droop
#     (<vehicle>-solid.png). The corners' checks below are then left out: the solid axles replace them;
#   - prints the ROOM left for what box3dvehicle draws round the model at every corner, at rest and
#     at full bump, and on a steered axle at full lock each way too: the coil spring (`coilRadius`
#     round and `wire` thick, drawn `look.inboard` in from the wheel's inner face, from the wheel's inner face up to the spring's mount), the upper arm (from the body's
#     side out to the mount, `arm` thick, where the mount is out past the side) and the lower arm
#     (from the body's bottom edge to the wheel's inner face, where that is); and the tailpipe (`pipe`
#     round, 0.3 m back along `dir` from `at`). Each is the least distance from the model's surface
#     to that part's axis less its radius, negative inside;
#   - prints the TYRE gap of each coil against its own tyre in every state, which box3dvehicle draws
#     both of and neither may run through the other;
#   - prints each node's name, kind and parent, the triangles, every `beam…` node's direction (its
#     +x), and the bounding box against the size the physics gives (the union of the body's box and
#     the cabin's hull, what the truck collides with; the wheels are their own bodies, and the
#     CLEAR above is what holds the model to them), SIZE PASS or FAIL per bound within `TOL`;
#   - renders, beside a 1.8 m figure, four turntable angles from three-quarter height
#     (<outdir>/<vehicle>-high.png) and from eye height (<vehicle>-eye.png), each a 2 × 2 sheet,
#     and the plan views with the ghosts, side from the left, top, front and back
#     (<vehicle>-plan.png).
# Renders are Eevee under Khronos PBR Neutral, a sun and a sky fill.

import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:]
SCENE_FILE, VIEW, MODEL, OUT = argv[0], argv[1], argv[2], argv[3]
os.makedirs(OUT, exist_ok=True)
VEH = json.load(open(SCENE_FILE))['world']['box3dvehicle']['vehicles']
V = VEH[VIEW]
LOOK = V['look']
TOL = 0.35


def B(p):
    return Vector((p[0], -p[2], p[1]))


def G(v):
    return Vector((v.x, v.z, -v.y))


bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def mat(name, rgb, alpha=1.0, rough=0.6):
    m = bpy.data.materials.new(name)
    try:
        if not m.use_nodes:
            m.use_nodes = True
    except AttributeError:
        pass
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = rough
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


# ------------------------------------------------------------------------------------------- import

def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    return new


def nodes_of(objs, label):
    tris = 0
    print(f'MODEL {label}')
    for o in sorted(objs, key=lambda o: o.name):
        kind = o.type.lower()
        par = o.parent.name if o.parent else '-'
        t = G(o.matrix_world.translation)
        extra = ''
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            n = len(o.data.loop_triangles)
            tris += n
            extra = f' tris={n} mats={[m.name for m in o.data.materials]}'
        if o.name.startswith('beam'):
            d = G(o.matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized()
            extra += f' dir=[{d.x:.3f}, {d.y:.3f}, {d.z:.3f}]'
        print(f'  NODE {kind:<6} {o.name:<14} parent={par:<10} at=[{t.x:.3f}, {t.y:.3f}, {t.z:.3f}]{extra}')
    print(f'  TRIS {tris}')
    return tris


def bbox(objs):
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        if o.type != 'MESH':
            continue
        for v in o.data.vertices:
            g = G(o.matrix_world @ v.co)
            for i in range(3):
                lo[i], hi[i] = min(lo[i], g[i]), max(hi[i], g[i])
    return lo, hi


def samples(objs, step=0.04):
    pts = []
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        me.calc_loop_triangles()
        M = np.array(o.matrix_world)
        co = np.array([v.co[:] for v in me.vertices])
        co = (co @ M[:3, :3].T) + M[:3, 3]
        pts.append(co)
        tri = np.array([t.vertices[:] for t in me.loop_triangles])
        if len(tri) == 0:
            continue
        a, b, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
        area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
        k = np.ceil(area / (step * step)).astype(int)
        big = np.nonzero(k > 1)[0]
        rng = np.random.default_rng(1)
        for i in big:
            r1, r2 = rng.random(k[i]), rng.random(k[i])
            s = np.sqrt(r1)
            pts.append(a[i] * (1 - s)[:, None] + b[i] * (s * (1 - r2))[:, None] + c[i] * (s * r2)[:, None])
    w = np.concatenate(pts)
    return np.stack([w[:, 0], w[:, 2], -w[:, 1]], axis=1)  # game frame


# The area two triangles in one plane share, `a` and `b` 3 × 2 in the plane's own coordinates
# (Sutherland–Hodgman: `a` clipped by each edge of `b`).
def shared(a, b):
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
                u = sp / (sp - sq)
                nxt.append((p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])))
        out = nxt
        if len(out) < 3:
            return 0.0
    return area(out)


# Faces lying one on another: every pair of triangles facing the same way in one plane (normals within
# 0.6°, planes within 4 mm, any orientation) that share more than 5 mm × 5 mm. Each draws through the
# other as the camera moves (z-fighting). Faces touching back to back, inside where two solids meet,
# face opposite ways and are not counted.
def coplanar(objs, sep=0.004, floor=0.005):
    tris = []
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        me.calc_loop_triangles()
        M = o.matrix_world
        for t in me.loop_triangles:
            p = [G(M @ me.vertices[i].co) for i in t.vertices]
            n = (p[1] - p[0]).cross(p[2] - p[0])
            if n.length < 1e-12:
                continue
            n.normalize()
            tris.append((f'{o.name}:{me.materials[t.material_index].name}', p, n, n.dot(p[0])))
    buckets = {}
    for k, (_, p, n, d) in enumerate(tris):
        buckets.setdefault((round(n.x * 100), round(n.y * 100), round(n.z * 100), round(d / sep)), []).append(k)
    pairs, worst = 0, []
    for key, ks in buckets.items():
        # the same plane may fall either side of a bucket's edge: the next bucket up is searched too
        near = ks + buckets.get((key[0], key[1], key[2], key[3] + 1), [])
        mine = set(ks)
        for i in ks:
            _, p, n, d = tris[i]
            u = (p[1] - p[0]).normalized()
            v = n.cross(u)
            flat = lambda q: (q.dot(u), q.dot(v))
            for j in near:
                if j <= i and j in mine:
                    continue
                _, q, m, e = tris[j]
                if n.dot(m) < math.cos(math.radians(0.6)) or abs(d - e) > sep:
                    continue
                s = shared([flat(x) for x in p], [flat(x) for x in q])
                if s > floor * floor:
                    pairs += 1
                    c = (p[0] + p[1] + p[2]) / 3
                    worst.append((s, c, n, tris[i][0], tris[j][0]))
    # one line a place: the pairs gathered by their materials, facing and where, to 5 cm
    places = {}
    for s, c, n, a, b in worst:
        key = (a, b, round(n.x), round(n.y), round(n.z), round(c.x / 0.05), round(c.y / 0.05), round(c.z / 0.05))
        got = places.setdefault(key, [0, 0.0, c])
        got[0] += 1
        got[1] += s
    for (a, b, nx, ny, nz, *_), (k, s, c) in sorted(places.items(), key=lambda kv: -kv[1][1]):
        print(f'  COPLANAR {a} / {b} facing=[{nx}, {ny}, {nz}] pairs={k} shared={s * 1e4:.1f} cm² at=[{c.x:.3f}, {c.y:.3f}, {c.z:.3f}]')
    print(f'COPLANAR faces={len(tris)} pairs={pairs} {"PASS" if pairs == 0 else "FAIL"}')
    return pairs


# ------------------------------------------------------------------------------------------- wheels

def wheels_of():
    out = []
    for i, a in enumerate(V['axles']):
        w, sp = a['wheel'], a['spring']
        hub_y = a['mount'] - sp['length'] + sp['sag']
        lock = V['steering']['angle'] if a['steered'] else 0.0
        rise = sp['travel'] - sp['sag']
        for side in (-1, 1):
            out.append({'axle': i, 'side': side, 'r': w['radius'], 'w': w['width'], 'lock': lock, 'rise': rise,
                        'at': a['at'], 'mount': a['mount'], 'track': a['track'],
                        'hub': Vector((a['at'], hub_y, side * a['track'] / 2))})
    return out


def ground_of():
    return min(x['hub'].y - x['r'] for x in wheels_of())


def clear(pts, wh):
    worst = []
    states = [('rest', 0.0, 0.0)]
    if wh['lock']:
        states += [('lock+', wh['lock'], 0.0), ('lock-', -wh['lock'], 0.0)]
    states += [('bump', 0.0, wh['rise'])]
    if wh['lock']:
        states += [('bump+lock+', wh['lock'], wh['rise']), ('bump+lock-', -wh['lock'], wh['rise'])]
    side = 'L' if wh['side'] < 0 else 'R'
    for name, steer, rise in states:
        h = np.array([wh['hub'].x, wh['hub'].y + rise, wh['hub'].z])
        d = pts - h
        # into the wheel's frame: turned `steer` about y (a positive steer turns the wheel's front left)
        c, s = math.cos(steer), math.sin(steer)
        x = c * d[:, 0] - s * d[:, 2]
        z = s * d[:, 0] + c * d[:, 2]
        y = d[:, 1]
        rho = np.hypot(x, y)
        ax = np.abs(z)
        R, H = wh['r'] + 0.01, wh['w'] / 2 + 0.01
        out = np.hypot(np.maximum(rho - R, 0), np.maximum(ax - H, 0))
        inside = (rho <= R) & (ax <= H)
        sd = np.where(inside, -np.minimum(R - rho, H - ax), out)
        k = int(np.argmin(sd))
        p = pts[k]
        ok = sd[k] >= 0
        worst.append(sd[k])
        print(f'  CLEAR axle={wh["axle"]} {side} {name:<11} gap={sd[k]:+.3f} at=[{p[0]:.2f}, {p[1]:.2f}, {p[2]:.2f}] {"PASS" if ok else "FAIL"}')
    return min(worst)


# The signed distance from `pts` to the solid cylinder `r` round from a to b, its ends flat (a coil
# ends flat on its mount), negative inside; the least of them and the point it is at.
def room(pts, a, b, r):
    a, b = np.array(a, dtype=float), np.array(b, dtype=float)
    ab = b - a
    n = np.linalg.norm(ab)
    u = ab / n
    t = (pts - a) @ u
    radial = np.linalg.norm(pts - a - t[:, None] * u, axis=1) - r
    axial = np.maximum(-t, t - n)
    d = np.where((radial < 0) & (axial < 0), np.maximum(radial, axial), np.hypot(np.maximum(radial, 0), np.maximum(axial, 0)))
    k = int(np.argmin(d))
    return d[k], pts[k]


# The signed distance from points `q` to the wheel `wh` pushed up `rise` and steered `steer`, the
# wheel a solid cylinder of its radius and width (`clear` measures the same), negative inside.
def into_wheel(q, wh, steer, rise):
    d = q - np.array([wh['hub'].x, wh['hub'].y + rise, wh['hub'].z])
    c, s = math.cos(steer), math.sin(steer)
    x = c * d[:, 0] - s * d[:, 2]
    z = s * d[:, 0] + c * d[:, 2]
    rho, ax = np.hypot(x, d[:, 1]), np.abs(z)
    R, H = wh['r'] + 0.01, wh['w'] / 2 + 0.01
    out = np.hypot(np.maximum(rho - R, 0), np.maximum(ax - H, 0))
    return np.where((rho <= R) & (ax <= H), -np.minimum(R - rho, H - ax), out)


# Points over the surface of the solid cylinder `r` round from a to b, its ends' discs included.
def cylinder(a, b, r, n=48, m=24):
    a, b = np.array(a, dtype=float), np.array(b, dtype=float)
    u = (b - a) / np.linalg.norm(b - a)
    e1 = np.cross(u, [1.0, 0, 0] if abs(u[0]) < 0.9 else [0, 1.0, 0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(u, e1)
    t = np.linspace(0, 1, m)[:, None, None]
    ang = np.linspace(0, 2 * math.pi, n, endpoint=False)[None, :, None]
    ring = np.cos(ang) * e1 + np.sin(ang) * e2
    side = (a + t * (b - a) + r * ring).reshape(-1, 3)
    discs = [(p + f * r * ring).reshape(-1, 3) for p in (a, b) for f in np.linspace(0, 1, 6)[:, None, None]]
    return np.concatenate([side] + discs)


# The signed distance from points `q` to the wheel `wh` at `centre` steered `steer`, the wheel a solid
# cylinder of its radius and width with the dish of its steel wheel hollow, as box3dvehicle's profile
# draws it: from the steel wheel's centre, 0.3 of the half width in from its middle, the dish's wall
# flares from 0.85 of the rim's radius (`look.rim` of the wheel's) to 0.97 at 0.82 of the half width
# in, and stays so to the inner face and past it. A knuckle and a brake sit in that hollow. Each
# point's distance to the hollow is taken to its wall straight out from the axis at its own depth.
def into_dished(q, wh, centre, steer):
    d = q - np.array(centre)
    c, s = math.cos(steer), math.sin(steer)
    x = c * d[:, 0] - s * d[:, 2]
    z = s * d[:, 0] + c * d[:, 2]
    rho, out = np.hypot(x, d[:, 1]), wh['side'] * z
    R, H = wh['r'] + 0.01, wh['w'] / 2 + 0.01
    solid = np.where((rho <= R) & (np.abs(z) <= H), -np.minimum(R - rho, H - np.abs(z)),
                     np.hypot(np.maximum(rho - R, 0), np.maximum(np.abs(z) - H, 0)))
    rr, h = wh['r'] * LOOK['rim'], wh['w'] / 2
    inward = -out / h                                          # 0.3 at the dish's floor, 1 at the inner face
    P = rr * np.interp(inward, [0.3, 0.82], [0.85, 0.97])
    deep = 0.3 * h
    wall, floor = P - rho, -out - deep                          # into the hollow: both positive inside
    hollow = np.where((wall >= 0) & (floor >= 0), -np.minimum(wall, floor),
                      np.hypot(np.maximum(-wall, 0), np.maximum(-floor, 0)))
    return np.maximum(solid, -hollow)


# Points over a solid axle's part (`parts.ts`): a ball's sphere, or the solid cylinder round its axis
# from `a` to `b` (a coil's out to its wire's outside, a band's to its half width), its first 3 cm cut
# off where it sits on the body.
def part_points(p):
    a, b = np.array(p['a'], dtype=float), np.array(p['b'], dtype=float)
    if p['shape'] == 'ball':
        g = np.random.default_rng(2).normal(size=(600, 3))
        return a + p['r'] * g / np.linalg.norm(g, axis=1)[:, None]
    if p.get('mount'):
        a = a + 0.03 * (b - a) / np.linalg.norm(b - a)
    return cylinder(a, b, part_radius(p))


def part_radius(p):
    return p['r'] + (p.get('wire') or 0)


# What box3dvehicle draws of the solid axles (`look.solid`), read off `parts.ts`'s JSON, checked in
# every state: each part's ROOM against the model and its TYRE gap against its axle's two wheels (the
# dish hollow), the worst state of each printed; each shock's SHOCK, the length left between its lower
# mount and its body's foot, and a coilover's coil against its solid height; and each STRAP's length
# against the longest reach it is pulled to.
def solid_rooms(pts):
    data = json.load(open(os.path.join(OUT, f'{VIEW}-parts.json')))
    wheels = wheels_of()
    worst, rows = [], {}
    for st in data['states']:
        mine = [w for w in wheels if w['axle'] == st['axle']]
        for p in st['parts']:
            a, b = np.array(p['a'], dtype=float), np.array(p['b'], dtype=float)
            if p['shape'] == 'ball':
                k = np.linalg.norm(pts - a, axis=1) - p['r']
                i = int(np.argmin(k))
                d, at = k[i], pts[i]
            else:
                if p.get('mount'):
                    a = a + 0.03 * (b - a) / np.linalg.norm(b - a)
                d, at = room(pts, a, b, part_radius(p))
            q = part_points(p)
            tyre = min(into_dished(q, w, st['wheels'][0 if w['side'] < 0 else 1]['centre'], st['wheels'][0 if w['side'] < 0 else 1]['steer']).min() for w in mine)
            key = (st['axle'], p['name'])
            row = rows.setdefault(key, {'room': (1e9, '', None), 'tyre': (1e9, '')})
            if d < row['room'][0]:
                row['room'] = (d, st['name'], at)
            if tyre < row['tyre'][0]:
                row['tyre'] = (tyre, st['name'])
    for (axle, name), row in rows.items():
        d, sname, at = row['room']
        t, tname = row['tyre']
        worst += [d, t]
        print(f'  ROOM axle={axle} {name:<18} gap={d:+.3f} worst={sname:<12} at=[{at[0]:.2f}, {at[1]:.2f}, {at[2]:.2f}] {"PASS" if d >= 0 else "FAIL"}')
        print(f'  TYRE axle={axle} {name:<18} gap={t:+.3f} worst={tname:<12} {"PASS" if t >= 0 else "FAIL"}')
    s = LOOK['solid']
    for k, sh in enumerate(s['shocks']):
        for axle in range(len(V['axles'])):
            left, coil = 1e9, (1e9, '')
            for st in data['states']:
                if st['axle'] != axle:
                    continue
                for p in st['parts']:
                    if p['name'].startswith(f'shock{k}.') and p['name'].endswith('.shaft'):
                        # the shaft ends halfway up the body: the body's foot is half a body down from there
                        n = np.linalg.norm(np.array(p['b']) - np.array(p['a'])) - sh['body'] / 2
                        if n < left:
                            left, lname = n, st['name']
                    if p['name'].startswith(f'shock{k}.') and p['name'].endswith('.coil'):
                        n = np.linalg.norm(np.array(p['b']) - np.array(p['a'])) - p['turns'] * 2 * p['wire']
                        if n < coil[0]:
                            coil = (n, st['name'])
            # the shaft's foot, its eye, stands its radius × 2 under the body's foot at the least
            need = 2 * sh['shaft']
            worst.append(left - need)
            print(f'  SHOCK axle={axle} {k} below the body={left:.3f} need={need:.3f} worst={lname:<12} {"PASS" if left >= need else "FAIL"}')
            if 'coil' in sh:
                worst.append(coil[0])
                print(f'  SHOCK axle={axle} {k} coil over its solid height={coil[0]:+.3f} worst={coil[1]:<12} {"PASS" if coil[0] >= 0 else "FAIL"}')
    for axle in range(len(V['axles'])):
        reach = 0.0
        for st in data['states']:
            if st['axle'] != axle:
                continue
            for side in ('L', 'R'):
                pieces = [p for p in st['parts'] if p['name'].startswith('strap') and p['name'].endswith(f'.{side}')]
                reach = max(reach, np.linalg.norm(np.array(pieces[-1]['b']) - np.array(pieces[0]['a'])))
        ok = reach <= s['strap']['length'] + 1e-6
        worst.append(s['strap']['length'] - reach)
        print(f'  STRAP axle={axle} length={s["strap"]["length"]:.3f} reach={reach:.3f} {"PASS" if ok else "FAIL"}')
    return min(worst)


def rooms(pts):
    L = V['body']
    W, H = L['width'], L['height']
    inboard = LOOK.get('inboard', 0.0)
    worst = []
    for wh in [] if 'solid' in LOOK else wheels_of():
        side = 'L' if wh['side'] < 0 else 'R'
        s = wh['side']
        # box3dvehicle draws the coil's top `inboard` in from the mount, and its foot on the wheel's
        # axle `inboard` in from the wheel's inner face
        mount = (wh['at'], wh['mount'], s * (wh['track'] / 2 - wh['w'] / 2 - inboard))
        states = [('rest', 0.0, 0.0), ('bump', wh['rise'], 0.0)]
        if wh['lock']:
            states += [(f'{n}+lock{k}', r, sg * wh['lock']) for n, r in (('rest', 0.0), ('bump', wh['rise'])) for k, sg in (('+', 1), ('-', -1))]
        for name, rise, steer in states:
            # the coil's foot, level with the wheel's middle and in along the chassis's side: it rises
            # with the wheel and does not steer with it
            hub = (wh['at'], wh['hub'].y + rise, s * (wh['track'] / 2 - wh['w'] / 2 - inboard))
            # the coil's wire stands `wire` past each end of its axis
            ext = LOOK['wire'] * (np.array(mount) - np.array(hub)) / np.linalg.norm(np.array(mount) - np.array(hub))
            a, b, r = tuple(np.array(hub) - ext), tuple(np.array(mount) + ext), LOOK['coilRadius'] + LOOK['wire']
            parts = [('coil', a, b, r)]
            # box3dvehicle draws a lower arm only where the wheel's inner face is out past the body's side,
            # and an upper arm only where the mount is
            if abs(mount[2]) - wh['w'] / 2 > W / 2:
                parts.append(('lower', (wh['at'], -H / 2, s * W / 2), hub, LOOK['arm'] / 2))
            if abs(mount[2]) > W / 2:
                parts.append(('upper', (wh['at'], wh['mount'], s * W / 2), mount, LOOK['arm'] / 2))
            # the coil against its own tyre: the plugin draws both, and neither may run through the other
            tyre = into_wheel(cylinder(a, b, r), wh, steer, rise).min()
            worst.append(tyre)
            print(f'  TYRE axle={wh["axle"]} {side} {name:<11} coil gap={tyre:+.3f} {"PASS" if tyre >= 0 else "FAIL"}')
            for part, a, b, r in parts:
                # the arms start on the body's surface: their first 3 cm are where the model meets them
                if part in ('lower', 'upper'):
                    a = tuple(np.array(a) + 0.03 * (np.array(b) - np.array(a)) / np.linalg.norm(np.array(b) - np.array(a)))
                d, p = room(pts, a, b, r)
                worst.append(d)
                print(f'  ROOM axle={wh["axle"]} {side} {name:<11} {part:<5} gap={d:+.3f} at=[{p[0]:.2f}, {p[1]:.2f}, {p[2]:.2f}] {"PASS" if d >= 0 else "FAIL"}')
    for i, ex in enumerate(LOOK.get('exhaust', [])):
        dv = np.array(ex['dir'], dtype=float)
        dv /= np.linalg.norm(dv)
        tip = np.array(ex['at'], dtype=float)
        d, p = room(pts, tip - 0.3 * dv, tip, ex['pipe'])
        worst.append(d)
        print(f'  ROOM pipe {i} gap={d:+.3f} at=[{p[0]:.2f}, {p[1]:.2f}, {p[2]:.2f}] {"PASS" if d >= 0 else "FAIL"}')
    return min(worst)


WHEEL_MAT = None


def marker(wh, steer=0.0, rise=0.0, m=None, ghost=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=wh['r'], depth=wh['w'])
    o = bpy.context.active_object
    o.name = 'marker'
    hub = wh['hub'] + Vector((0, rise, 0))
    # the cylinder's axis (Blender Z) along the game's z (Blender -Y), then steered about the game's y
    o.rotation_euler = Euler((math.pi / 2, 0, steer))
    o.location = B(hub)
    o.data.materials.append(m)
    o['ghost'] = ghost
    return o


# ------------------------------------------------------------------------------------ the numbers

def union(*boxes):
    lo = Vector((min(b[0][i] for b in boxes) for i in range(3)))
    hi = Vector((max(b[1][i] for b in boxes) for i in range(3)))
    return lo, hi


def boxof(center, half):
    c, h = Vector(center), Vector(half)
    return c - h, c + h


def want_of():
    v = V['body']
    bs = [boxof((0, 0, 0), (v['length'] / 2, v['height'] / 2, v['width'] / 2))]
    if 'cabin' in v:
        c = v['cabin']
        bs.append(boxof((c['at'], v['height'] / 2 + c['height'] / 2, 0), (max(c['length'], c['top']) / 2, c['height'] / 2, max(c['width'], c['topWidth']) / 2)))
    return union(*bs)


objs = load(MODEL)
wheels = wheels_of()
ground = ground_of()
want = want_of()

nodes_of(objs, VIEW)
lo, hi = bbox(objs)
print(f'BBOX {VIEW} x [{lo.x:.3f}, {hi.x:.3f}] y [{lo.y:.3f}, {hi.y:.3f}] z [{lo.z:.3f}, {hi.z:.3f}]  size [{hi.x - lo.x:.3f}, {hi.y - lo.y:.3f}, {hi.z - lo.z:.3f}]')
wl, wh_ = want
print(f'WANT {VIEW} x [{wl.x:.3f}, {wh_.x:.3f}] y [{wl.y:.3f}, {wh_.y:.3f}] z [{wl.z:.3f}, {wh_.z:.3f}]  (ground {ground:.3f})')
for i, ax in enumerate('xyz'):
    for nm, g, w in (('min', lo[i], wl[i]), ('max', hi[i], wh_[i])):
        ok = abs(g - w) <= TOL
        print(f'  SIZE {ax}.{nm} want={w:+.3f} got={g:+.3f} diff={g - w:+.3f} {"PASS" if ok else "FAIL"}')
coplanar(objs)
pts = samples(objs)
print(f'SAMPLES {len(pts)}')
for w in wheels:
    clear(pts, w)
rooms(pts)
if 'solid' in LOOK:
    solid_rooms(pts)

# ------------------------------------------------------------------------------------ the stage

lo.y = min(lo.y, ground)
rest = mat('marker', (0.03, 0.03, 0.03), rough=0.8)
red = mat('ghost.lock', (0.9, 0.05, 0.05), alpha=0.28)
blue = mat('ghost.bump', (0.05, 0.2, 0.9), alpha=0.28)
markers, ghosts = [], []
for w in wheels:
    markers.append(marker(w, m=rest))
    if w['lock']:
        ghosts.append(marker(w, w['lock'], 0, red, True))
        ghosts.append(marker(w, -w['lock'], 0, red, True))
    ghosts.append(marker(w, 0, w['rise'], blue, True))

span = max(hi.x - lo.x, hi.z - lo.z, hi.y - lo.y)
bpy.ops.mesh.primitive_plane_add(size=max(60, span * 6))
gp = bpy.context.active_object
gp.location = B((0, ground - 0.002, 0))
gp.data.materials.append(mat('ground', (0.16, 0.18, 0.12), rough=0.95))
# a 1.8 m figure beside it
fz = hi.z + 0.9
fig = mat('figure', (0.12, 0.22, 0.45), rough=0.7)
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.17, depth=1.5, location=B(((lo.x + hi.x) / 2, ground + 0.75, fz)))
bpy.context.active_object.data.materials.append(fig)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=B(((lo.x + hi.x) / 2, ground + 1.68, fz)))
bpy.context.active_object.data.materials.append(fig)

world = bpy.data.worlds.new('sky')
sc.world = world
try:
    if not world.use_nodes:
        world.use_nodes = True
except AttributeError:
    pass
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.55, 0.65, 0.8, 1)
bg.inputs['Strength'].default_value = 0.9
sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = 3.2
sun_data.angle = math.radians(2)
sun = bpy.data.objects.new('sun', sun_data)
sc.collection.objects.link(sun)
sun.rotation_euler = Euler((math.radians(50), math.radians(10), math.radians(35)))

try:
    sc.render.engine = 'BLENDER_EEVEE'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.view_settings.view_transform = 'Khronos PBR Neutral'
sc.render.resolution_x, sc.render.resolution_y = 960, 540
sc.render.image_settings.file_format = 'PNG'
try:
    sc.eevee.taa_render_samples = 32
    sc.eevee.use_shadows = True
except AttributeError:
    pass

cam_data = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
center = (lo + hi) / 2


def aim(eye, target):
    e, t = B(eye), B(target)
    cam.location = e
    cam.rotation_euler = (t - e).to_track_quat('-Z', 'Y').to_euler()


def shot(path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def sheet(paths, out):
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p)
        w, h = im.size
        imgs.append(np.array(im.pixels[:]).reshape(h, w, 4))
        bpy.data.images.remove(im)
    h, w = imgs[0].shape[:2]
    big = np.ones((h * 2, w * 2, 4))
    # pixels run bottom-up: the first image goes top-left
    big[h:, :w], big[h:, w:], big[:h, :w], big[:h, w:] = imgs[0], imgs[1], imgs[2], imgs[3]
    im = bpy.data.images.new('sheet', w * 2, h * 2, alpha=True)
    im.pixels = big.ravel()
    im.filepath_raw = out
    im.file_format = 'PNG'
    im.save()
    for p in paths:
        os.remove(p)
    print('RENDER', out)


# What box3dvehicle draws of the solid axles in a state of `parts.ts`, as Blender objects in the look's
# paints: tubes, balls, bands, and each coil a helix of its wire.
PAINT = {}


def paint_of(name):
    if name not in PAINT:
        c = LOOK['paint'][name]
        rgb = tuple(((c >> sh) & 255) / 255 for sh in (16, 8, 0))
        f = LOOK.get('finish', {}).get(name, {})
        m = mat(f'paint.{name}', tuple(x ** 2.2 for x in rgb), rough=f.get('roughness', 0.5))
        next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Metallic'].default_value = f.get('metalness', 0.0)
        PAINT[name] = m
    return PAINT[name]


def draw_parts(parts):
    made = []
    for p in parts:
        a, b = B(p['a']), B(p['b'])
        if p['shape'] == 'ball':
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=p['r'], location=a)
            o = bpy.context.active_object
        elif p['shape'] == 'coil':
            cu = bpy.data.curves.new('coil', 'CURVE')
            cu.dimensions = '3D'
            cu.bevel_depth = p['wire']
            cu.bevel_resolution = 2
            sp = cu.splines.new('POLY')
            n = int(p['turns'] * 24)
            sp.points.add(n)
            u = (b - a).normalized()
            e1 = u.cross(Vector((1, 0, 0)) if abs(u.x) < 0.9 else Vector((0, 1, 0))).normalized()
            e2 = u.cross(e1)
            for k in range(n + 1):
                t = k / n
                ang = t * p['turns'] * 2 * math.pi
                q = a + (b - a) * t + p['r'] * (math.cos(ang) * e1 + math.sin(ang) * e2)
                sp.points[k].co = (q.x, q.y, q.z, 1)
            o = bpy.data.objects.new('coil', cu)
            sc.collection.objects.link(o)
        else:
            d = b - a
            if p['shape'] == 'band':
                bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
                o = bpy.context.active_object
                o.scale = (p['r'] * 2, p['thick'], max(d.length, 1e-4))
            else:
                bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=p['r'], depth=max(d.length, 1e-4), location=(a + b) / 2)
                o = bpy.context.active_object
            o.rotation_mode = 'QUATERNION'
            o.rotation_quaternion = d.to_track_quat('Z', 'Y')
        o.data.materials.append(paint_of(p['paint']))
        made.append(o)
    return made


def remove(objs):
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)


SOLID = json.load(open(os.path.join(OUT, f'{VIEW}-parts.json')))['states'] if 'solid' in LOOK else []
resting = draw_parts([p for st in SOLID if st['name'] == 'rest' for p in st['parts']])

cam_data.lens = 35
radius = (hi - lo).length / 2
vfov = 2 * math.atan(18 * 9 / 16 / 35)     # the 36 mm sensor's height at 16:9 behind a 35 mm lens
dist = radius / math.sin(vfov / 2) * 0.8
yaws = [35, 125, 215, 305]   # front-right, back-right, back-left, front-left
for g in ghosts:
    g.hide_render = True
paths = []
for k, yaw in enumerate(yaws):
    a, el = math.radians(yaw), math.radians(28)
    eye = center + Vector((math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el))) * dist
    aim(eye, center)
    paths.append(shot(os.path.join(OUT, f'_{VIEW}-high{k}.png')))
sheet(paths, os.path.join(OUT, f'{VIEW}-high.png'))
paths = []
for k, yaw in enumerate(yaws):
    a = math.radians(yaw)
    d = dist * 0.85
    eye = Vector((center.x + math.cos(a) * d, ground + 1.6, center.z + math.sin(a) * d))
    aim(eye, Vector((center.x, max(ground + 0.9, center.y * 0.6 + ground * 0.4), center.z)))
    paths.append(shot(os.path.join(OUT, f'_{VIEW}-eye{k}.png')))
sheet(paths, os.path.join(OUT, f'{VIEW}-eye.png'))

for g in ghosts:
    g.hide_render = False
cam_data.type = 'ORTHO'
ext = hi - lo
paths = []
far = 50
for k, (dirn, up) in enumerate((((0, 0, -1), 'y'), ((0, 1, 0), 'x'), ((1, 0, 0), 'y'), ((-1, 0, 0), 'y'))):
    d = Vector(dirn)
    eye = center + d * far
    cam.location = B(eye)
    # side, front and back: looking along `dirn` with the game's up up; top: straight down, the
    # vehicle's forward to the image's right and its left side up the image
    cam.rotation_euler = (B(center) - B(eye)).to_track_quat('-Z', 'Y').to_euler() if up == 'y' else Euler((0, 0, 0))
    if k == 0:
        cam_data.ortho_scale = max(ext.x, (ext.y + 0.3) * 16 / 9) * 1.12
    elif k == 1:
        cam_data.ortho_scale = max(ext.x, ext.z * 16 / 9) * 1.12
    else:
        cam_data.ortho_scale = max(ext.z, (ext.y + 0.3) * 16 / 9) * 1.12
    cam_data.clip_end = 200
    paths.append(shot(os.path.join(OUT, f'_{VIEW}-plan{k}.png')))
sheet(paths, os.path.join(OUT, f'{VIEW}-plan.png'))

# The solid axles worked: the front axle crossed (its left pushed in full, its right at full droop)
# from ahead and low, the front pushed in full at full lock from ahead, the rear crossed the other way
# from behind, and the front at full droop from the left; each axle's wheels where that state puts
# them, the other axle as it rests.
if SOLID:
    remove(resting)
    for g in ghosts:
        g.hide_render = True
    cam_data.type = 'PERSP'
    cam_data.lens = 30
    front, rear = (0, 1) if V['axles'][0]['at'] > V['axles'][1]['at'] else (1, 0)
    fx, rx = V['axles'][front]['at'], V['axles'][rear]['at']
    hub = ground + V['axles'][front]['wheel']['radius']
    views = [(front, 'crossL', (fx + 4.2, hub + 0.2, 2.2)), (front, 'bump+lock', (fx + 4.6, hub + 0.9, -1.0)),
             (rear, 'crossR', (rx - 4.2, hub + 0.2, -2.2)), (front, 'droop', (fx - 0.4, hub - 0.2, -4.6))]
    paths = []
    for k, (axle, name, eye) in enumerate(views):
        st = next(s for s in SOLID if s['axle'] == axle and s['name'] == name)
        other = next(s for s in SOLID if s['axle'] != axle and s['name'] == 'rest')
        made = draw_parts(st['parts'] + other['parts'])
        for m, w in zip(markers, wheels):
            m.hide_render = w['axle'] == axle
        moved = [marker(w, st['wheels'][0 if w['side'] < 0 else 1]['steer'], st['wheels'][0 if w['side'] < 0 else 1]['rise'], rest) for w in wheels if w['axle'] == axle]
        x = V['axles'][axle]['at']
        aim(eye, (x, hub - 0.2, 0))
        paths.append(shot(os.path.join(OUT, f'_{VIEW}-solid{k}.png')))
        remove(made + moved)
        for m in markers:
            m.hide_render = False
    sheet(paths, os.path.join(OUT, f'{VIEW}-solid.png'))
