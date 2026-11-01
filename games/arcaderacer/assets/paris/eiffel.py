# Makes eiffel.glb: the Eiffel Tower at its true size, one object `eiffel`, its foot's middle at the
# origin, 330 m to the antenna's tip, the game's landmark over Paris.
#
# Its shape is the tower's: four legs on masonry piers at the corners of a square, each a box girder
# whose outer chords bow in along the curve that carries the wind down (OUTER, the tower's half width
# up its height) and whose inner chords lean in to meet above the second floor (INNER), where the
# four become one shaft that runs on up to the top. Every face of a leg and of the shaft is a run of
# panels, each braced by a strut and a St Andrew's cross, the panel itself filled with a card of the
# lighter lattice. Between the legs, on each side, the arch; over it the first floor's girders behind
# their arcaded frieze; the first floor at 57.6 m with its glazed pavilions, the second at 115.7 m,
# the third's cabin at 276 m, the campanile over it with the beacon, and the antenna with its red
# lights. It is dusk, so the golden lamps inside the structure are lit: the lattice glows.
#
# Materials: `paint` (the tower's bronze, darker at the foot and lighter up its height, a little
# light of its own from the lamps), `lattice` and `frieze` (alpha-masked cards, both glowing), `stone`
# (the piers), `lit` (the pavilions' and the cabin's glazing), `beacon` and `red` (lamps).
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#       --python games/arcaderacer/assets/paris/eiffel.py [-- out.glb]
# It writes the plain glb Blender exports, to `out.glb` when given, else beside itself; `yarn bake
# arcaderacer` packs it into the game (`arcaderacer.bake.ts`).
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kit import (UP, WHITE, Build, box_uv, cross, export, image, lin, masked, norm, normal_map,  # noqa: E402
                 principled, shade, strokes_to_maps, vertex_tinted)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else os.path.join(HERE, 'eiffel.glb')

FIRST, SECOND, THIRD, TOP = 57.6, 115.7, 276.0, 300.0
MERGE = 180.0        # where the four legs' inner chords meet and the shaft begins
ANTENNA = 330.0
LATTICE_TILE = 4.0   # metres the lattice card covers each way
FRIEZE = (8.0, 4.0)  # metres the frieze card covers along and up

# the tower's half width at each height, outside its legs, and inside them (from the drawings: a
# 125 m square at the foot, the first floor 70.7 m across, the second 40.5 m, the top 16.5 m)
OUTER = [(0.0, 62.5), (20.0, 50.5), (40.0, 41.0), (FIRST, 34.0), (85.0, 26.5), (SECOND, 20.5),
         (150.0, 15.6), (MERGE, 12.8), (230.0, 10.0), (THIRD, 8.2), (TOP, 5.5)]
INNER = [(0.0, 37.5), (20.0, 30.5), (40.0, 24.6), (FIRST, 19.8), (85.0, 13.5), (SECOND, 7.6),
         (150.0, 2.6), (MERGE, 0.0)]

# the heights the panels break at, up each stage of the tower
LEVELS = sorted(set(
    [FIRST * k / 14 for k in range(15)] +
    [FIRST + (SECOND - FIRST) * k / 13 for k in range(14)] +
    [SECOND + (MERGE - SECOND) * k / 9 for k in range(10)] +
    [MERGE + (THIRD - MERGE) * k / 18 for k in range(19)] +
    [THIRD + (TOP - THIRD) * k / 4 for k in range(5)]))


def curve(points):
    """A smooth monotone curve through (z, value) points: Fritsch–Carlson cubic Hermite."""
    zs = [p[0] for p in points]
    vs = [p[1] for p in points]
    n = len(points)
    d = [(vs[k + 1] - vs[k]) / (zs[k + 1] - zs[k]) for k in range(n - 1)]
    m = [d[0]] + [0.0 if d[k - 1] * d[k] <= 0 else 2 / (1 / d[k - 1] + 1 / d[k]) for k in range(1, n - 1)] + [d[-1]]

    def at(z):
        if z <= zs[0]:
            return vs[0]
        if z >= zs[-1]:
            return vs[-1] + m[-1] * (z - zs[-1])
        k = max(i for i in range(n - 1) if zs[i] <= z)
        h = zs[k + 1] - zs[k]
        t = (z - zs[k]) / h
        h00, h10 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t
        h01, h11 = -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
        return h00 * vs[k] + h10 * h * m[k] + h01 * vs[k + 1] + h11 * h * m[k + 1]
    return at


W = curve(OUTER)
_inner = curve(INNER)


def I(z):
    return max(0.0, _inner(z)) if z < MERGE else 0.0


def chord_size(z):
    """How thick a main chord is: 1.8 m at the foot, 0.45 m at the top."""
    return 1.8 - 1.35 * min(z, TOP) / TOP


def bronze(z):
    """The paint's three shades, darker at the foot and lighter up the tower, as a vertex colour."""
    t = min(z / TOP, 1.0)
    return shade(0.74 + 0.26 * t)


# -------------------------------------------------------------------------------------- textures

def lattice_maps():
    """The lighter lattice that fills each panel: two ways of diagonals a metre apart, a bar across
    every two metres, a frame at the panel's edge. Colour with alpha, its normal, and its glow."""
    N = 512
    PX = N / LATTICE_TILE
    yy, xx = np.mgrid[0:N, 0:N]
    x = (xx + 0.5) / PX
    y = (yy + 0.5) / PX
    strokes = []
    # diagonals both ways, periodic in the tile: the distance to the nearest line of each family
    for sgn in (1, -1):
        s = (x + sgn * y) % 1.0
        strokes.append((np.minimum(s, 1 - s) / math.sqrt(2), 0.035))
    for k in range(3):
        strokes.append((np.abs(y - 2.0 * k), 0.045))
        strokes.append((np.abs(x - 2.0 * k), 0.03))
    colour, nrm = strokes_to_maps(strokes, x.shape, PX, (0.42, 0.33, 0.24))
    glow = np.zeros((N, N, 4))
    glow[..., 3] = 1
    glow[..., :3] = np.array([1.0, 0.62, 0.22])[None, None] * colour[..., 3:4] * (0.75 + 0.25 * np.sin(y * 3.1)[..., None] ** 2)
    return image('lattice.colour', colour), image('lattice.normal', nrm, colour=False), image('lattice.glow', glow)


def frieze_maps():
    """The first and second floors' frieze: a band of iron with a row of round-headed arches open
    through it, a moulded rail along its top and its foot. FRIEZE metres a repeat."""
    W_, H_ = FRIEZE
    N = 512
    PX = N / W_
    h = int(H_ * PX)
    yy, xx = np.mgrid[0:h, 0:N]
    x = (xx + 0.5) / PX
    y = (yy + 0.5) / PX
    arches = 5
    span = W_ / arches
    lx = (x % span) - span / 2
    half, spring, foot = span * 0.32, H_ * 0.62, H_ * 0.12
    inside = ((np.abs(lx) < half) & (y > foot) & (y < spring)) | ((y >= spring) & (np.hypot(lx, y - spring) < half))
    alpha = np.where(inside, 0.0, 1.0)
    # a rail at the foot and the top stands proud: shade them in the normal by a soft step
    height = 0.02 * (np.exp(-((y - 0.15) ** 2) / 0.01) + np.exp(-((y - (H_ - 0.2)) ** 2) / 0.02))
    height += 0.015 * (1 - np.clip(np.abs(np.hypot(lx, y - spring) - half - 0.08) / 0.08, 0, 1)) * (y > spring)
    nrm = normal_map(height, PX)
    colour = np.zeros((h, N, 4))
    colour[..., :3] = np.array([0.40, 0.31, 0.23])
    colour[..., 3] = alpha
    glow = np.zeros((h, N, 4))
    glow[..., 3] = 1
    rim = (1 - np.clip(np.abs(np.hypot(lx, y - spring) - half - 0.05) / 0.06, 0, 1)) * (y > spring - 0.05)
    glow[..., :3] = np.array([1.0, 0.65, 0.25])[None, None] * (alpha * 0.25 + rim * 0.9)[..., None]
    return (image('frieze.colour', colour), image('frieze.normal', np.concatenate([nrm, np.ones((h, N, 1))], -1), colour=False),
            image('frieze.glow', glow))


def materials():
    paint, nt, bsdf = principled('paint')
    vertex_tinted(nt, bsdf, _const(nt, lin('#7b624b')))
    bsdf.inputs['Roughness'].default_value = 0.55
    bsdf.inputs['Metallic'].default_value = 0.15
    bsdf.inputs['Emission Color'].default_value = lin('#ff9a3c')
    bsdf.inputs['Emission Strength'].default_value = 0.22
    lc, ln, lg = lattice_maps()
    lattice = masked('lattice', lc, ln, roughness=0.6, metallic=0.1, emission=lg, strength=0.9)
    fc, fn, fg = frieze_maps()
    frieze = masked('frieze', fc, fn, roughness=0.6, metallic=0.1, emission=fg, strength=0.8)
    stone, nt, bsdf = principled('stone')
    vertex_tinted(nt, bsdf, _const(nt, lin('#9b968c')))
    bsdf.inputs['Roughness'].default_value = 0.85
    lit, nt, bsdf = principled('lit')
    bsdf.inputs['Base Color'].default_value = (0.03, 0.03, 0.03, 1)
    bsdf.inputs['Emission Color'].default_value = lin('#ffcf8a')
    bsdf.inputs['Emission Strength'].default_value = 2.2
    beacon, nt, bsdf = principled('beacon')
    bsdf.inputs['Base Color'].default_value = (0.8, 0.8, 0.7, 1)
    bsdf.inputs['Emission Color'].default_value = lin('#fff1d0')
    bsdf.inputs['Emission Strength'].default_value = 12.0
    red, nt, bsdf = principled('red')
    bsdf.inputs['Base Color'].default_value = (0.5, 0.0, 0.0, 1)
    bsdf.inputs['Emission Color'].default_value = lin('#ff2010')
    bsdf.inputs['Emission Strength'].default_value = 10.0
    return [paint, lattice, frieze, stone, lit, beacon, red]


def _const(nt, colour):
    rgb = nt.nodes.new('ShaderNodeRGB')
    rgb.outputs[0].default_value = colour
    return rgb.outputs[0]


PAINT, LATTICE, FRIEZE_M, STONE, LIT, BEACON, RED = range(7)


# ------------------------------------------------------------------------------------- geometry

def beam(B, a, b, s, mat=PAINT, col=None):
    """A square bar `s` thick from a to b, its sides only."""
    d = norm((b[0] - a[0], b[1] - a[1], b[2] - a[2]))
    hint = (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)
    r = norm(cross(d, hint))
    u = norm(cross(r, d))
    h = s / 2
    ca = [(a[0] + (r[0] * i + u[0] * j) * h, a[1] + (r[1] * i + u[1] * j) * h, a[2] + (r[2] * i + u[2] * j) * h) for i, j in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    cb = [(b[0] + (r[0] * i + u[0] * j) * h, b[1] + (r[1] * i + u[1] * j) * h, b[2] + (r[2] * i + u[2] * j) * h) for i, j in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    for k in range(4):
        n = k + 1 if k < 3 else 0
        mid = ((ca[k][0] + ca[n][0]) / 2 - a[0], (ca[k][1] + ca[n][1]) / 2 - a[1], (ca[k][2] + ca[n][2]) / 2 - a[2])
        B.poly([ca[k], ca[n], cb[n], cb[k]], mat, mid, col=col or bronze((a[2] + b[2]) / 2))


def card(B, quad, mat=LATTICE, tile=LATTICE_TILE, want=None):
    """A lattice card over a four-cornered panel, its texture a metre to `tile` across and up."""
    a, b, c, d = quad
    w0 = math.dist(a, b)
    w1 = math.dist(d, c)
    h = math.dist(a, d)
    uv = [(0, 0), (w0 / tile, 0), (w1 / tile, h / tile), (0, h / tile)]
    B.poly(quad, mat, want, uv=uv, col=bronze((a[2] + c[2]) / 2))


def panel(B, p0, q0, p1, q1, s, out):
    """One braced panel of a face: the strut along its foot, its St Andrew's cross, its lattice."""
    beam(B, p0, q0, s * 0.55)
    beam(B, p0, q1, s * 0.32)
    beam(B, q0, p1, s * 0.32)
    card(B, [p0, q0, q1, p1], want=out)


def legs(B):
    """The four legs from their piers up to MERGE. Up to the second floor each is a box of four
    chords and four braced faces round the open well between them; over it the inner chords and
    faces stop, the legs' outer faces run on, and the narrow face between two legs' inner edges
    closes the shaft until those edges meet at MERGE."""
    zs = [z for z in LEVELS if z <= MERGE]
    for k in range(len(zs) - 1):
        z0, z1 = zs[k], zs[k + 1]
        s = chord_size(z0)
        well = z0 < SECOND - 1e-6
        for sx in (-1, 1):
            for sy in (-1, 1):
                def corners(z):
                    w, i = W(z), I(z)
                    return {'A': (sx * w, sy * w, z), 'B': (sx * w, sy * i, z), 'C': (sx * i, sy * w, z), 'D': (sx * i, sy * i, z)}
                c0, c1 = corners(z0), corners(z1)
                for key in ('ABCD' if well else 'ABC'):
                    beam(B, c0[key], c1[key], s)
                faces = [('A', 'B', (sx, 0, 0)), ('A', 'C', (0, sy, 0))]
                if well:
                    faces += [('C', 'D', (-sx, 0, 0)), ('B', 'D', (0, -sy, 0))]
                for p, q, out in faces:
                    panel(B, c0[p], c0[q], c1[p], c1[q], s, out)
        if not well:
            # the faces between neighbouring legs' inner edges, one on each side of the shaft
            for side in range(4):
                ang = side * math.pi / 2
                ca, sa = math.cos(ang), math.sin(ang)
                at = lambda y, z: (W(z) * ca - y * sa, W(z) * sa + y * ca, z)
                out = (ca, sa, 0.0)
                p0, q0, p1, q1 = at(-I(z0), z0), at(I(z0), z0), at(-I(z1), z1), at(I(z1), z1)
                if I(z0) > 0.05:
                    panel(B, p0, q0, p1, q1, s, out)


def shaft(B):
    """The shaft from MERGE to the top: four corner chords, four braced faces, a cross brace across
    it every other level."""
    zs = [z for z in LEVELS if z >= MERGE]
    for k in range(len(zs) - 1):
        z0, z1 = zs[k], zs[k + 1]
        w0, w1 = W(z0), W(z1)
        s = chord_size(z0)
        pts0 = [(w0, w0, z0), (-w0, w0, z0), (-w0, -w0, z0), (w0, -w0, z0)]
        pts1 = [(w1, w1, z1), (-w1, w1, z1), (-w1, -w1, z1), (w1, -w1, z1)]
        outs = [(0, 1, 0), (-1, 0, 0), (0, -1, 0), (1, 0, 0)]
        for j in range(4):
            n = (j + 1) % 4
            beam(B, pts0[j], pts1[j], s)
            panel(B, pts0[j], pts0[n], pts1[j], pts1[n], s, outs[j])
        if k % 2 == 0:
            beam(B, pts0[0], pts0[2], s * 0.4)
            beam(B, pts0[1], pts0[3], s * 0.4)


def arches(B):
    """On each side the arch between two legs: its intrados and extrados chords braced between, its
    band of lattice, and the spandrels up to the first floor's girder."""
    zs, za, deep = 14.0, 39.0, 3.2
    girder = FIRST - 7.0
    for side in range(4):
        ang = side * math.pi / 2
        ca, sa = math.cos(ang), math.sin(ang)

        def at(y, z, inset=1.6):
            x = W(z) - inset
            return (x * ca - y * sa, x * sa + y * ca, z)

        half = I(zs) + 1.0
        # the circle through both springs and the apex
        r = (half * half + (za - zs) ** 2) / (2 * (za - zs))
        cz = za - r
        n = 28
        a0 = math.asin(min(1.0, half / r))
        intra = [(r * math.sin(-a0 + 2 * a0 * k / n), cz + r * math.cos(-a0 + 2 * a0 * k / n)) for k in range(n + 1)]
        extra = [(y * (r + deep) / r, cz + (z - cz) * (r + deep) / r) for y, z in intra]
        out = (ca, sa, 0.0)
        for k in range(n):
            (ya, zA), (yb, zB) = intra[k], intra[k + 1]
            (Ya, ZA), (Yb, ZB) = extra[k], extra[k + 1]
            beam(B, at(ya, zA), at(yb, zB), 1.1)
            beam(B, at(Ya, ZA), at(Yb, ZB), 0.9)
            beam(B, at(ya, zA), at(Yb, ZB), 0.35)
            card(B, [at(ya, zA), at(yb, zB), at(Yb, ZB), at(Ya, ZA)], want=out)
            # the spandrel over the extrados, up to the girder
            if ZA < girder - 0.5:
                beam(B, at(Ya, ZA), at(Ya, girder), 0.4)
                card(B, [at(Ya, ZA), at(Yb, ZB), at(Yb, girder), at(Ya, girder)], want=out)
        # the girder the frieze hangs from, along the side under the first floor
        beam(B, at(-W(girder), girder, 1.2), at(W(girder), girder, 1.2), 1.4)


def floor(B, z, half, inner, frieze_h, rail_h, pavilions):
    """A floor round the tower: its deck (a square ring), the frieze round its outside, a rail along
    its edge, and glazed pavilions on its deck."""
    o, i = half, inner
    deck = 1.2
    rings = [((-o, -o), (o, -o), (o, o), (-o, o)), ((-i, -i), (i, -i), (i, i), (-i, i))]
    for k in range(4):
        n = (k + 1) % 4
        (ax, ay), (bx, by) = rings[0][k], rings[0][n]
        (cx, cy), (dx, dy) = rings[1][n], rings[1][k]
        B.poly([(ax, ay, z), (bx, by, z), (cx, cy, z), (dx, dy, z)], PAINT, UP, col=bronze(z))
        B.poly([(ax, ay, z - deck), (bx, by, z - deck), (cx, cy, z - deck), (dx, dy, z - deck)], PAINT, (0, 0, -1), col=shade(0.5))
        out = norm(((ax + bx) / 2, (ay + by) / 2, 0))
        length = math.dist((ax, ay), (bx, by))
        # the frieze: outside the deck's edge, hanging below it
        B.poly([(ax, ay, z - frieze_h), (bx, by, z - frieze_h), (bx, by, z + 0.4), (ax, ay, z + 0.4)], FRIEZE_M, out,
               uv=[(0, 0), (length / FRIEZE[0], 0), (length / FRIEZE[0], (frieze_h + 0.4) / FRIEZE[1]), (0, (frieze_h + 0.4) / FRIEZE[1])])
        # the rail along the edge
        B.poly([(ax, ay, z + 0.4), (bx, by, z + 0.4), (bx, by, z + 0.4 + rail_h), (ax, ay, z + 0.4 + rail_h)], LATTICE, out,
               uv=[(0, 0), (length / 1.5, 0), (length / 1.5, rail_h / 1.5), (0, rail_h / 1.5)])
        beam(B, (ax, ay, z + 0.4 + rail_h), (bx, by, z + 0.4 + rail_h), 0.18)
        if pavilions:
            # a glazed pavilion along the middle of each side, between the legs
            t = (-out[1], out[0], 0)
            mid = (out[0] * (o - 6), out[1] * (o - 6))
            plen, pw, ph = length * 0.42, 6.0, 7.0
            box(B, mid, t, out, plen, pw, z, z + ph)


def box(B, mid, t, n, length, width, z0, z1):
    """A glazed pavilion: walls of lit glass between iron posts, a roof of the tower's paint."""
    hl, hw = length / 2, width / 2
    corners = [(mid[0] + t[0] * a + n[0] * b, mid[1] + t[1] * a + n[1] * b) for a, b in ((-hl, -hw), (hl, -hw), (hl, hw), (-hl, hw))]
    for k in range(4):
        a, b = corners[k], corners[(k + 1) % 4]
        out = norm(((a[0] + b[0]) / 2 - mid[0], (a[1] + b[1]) / 2 - mid[1], 0))
        B.poly([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], LIT, out, uv=[(0, 0)] * 4)
        posts = max(2, int(math.dist(a, b) / 3.0))
        for p in range(posts + 1):
            f = p / posts
            x, y = a[0] + (b[0] - a[0]) * f + out[0] * 0.1, a[1] + (b[1] - a[1]) * f + out[1] * 0.1
            beam(B, (x, y, z0), (x, y, z1), 0.3)
        beam(B, (a[0] + out[0] * 0.1, a[1] + out[1] * 0.1, z0 + (z1 - z0) * 0.5), (b[0] + out[0] * 0.1, b[1] + out[1] * 0.1, z0 + (z1 - z0) * 0.5), 0.2)
    B.poly([(c[0], c[1], z1) for c in corners], PAINT, UP, col=bronze(z1))
    B.poly([(c[0], c[1], z1 + 0.6) for c in corners], PAINT, UP, col=bronze(z1))
    for k in range(4):
        a, b = corners[k], corners[(k + 1) % 4]
        out = norm(((a[0] + b[0]) / 2 - mid[0], (a[1] + b[1]) / 2 - mid[1], 0))
        B.poly([(a[0], a[1], z1), (b[0], b[1], z1), (b[0], b[1], z1 + 0.6), (a[0], a[1], z1 + 0.6)], PAINT, out, col=bronze(z1))


def piers(B):
    """The masonry each leg stands on."""
    for sx in (-1, 1):
        for sy in (-1, 1):
            i, w = I(0) - 2, W(0) + 2
            x0, x1 = sorted((sx * i, sx * w))
            y0, y1 = sorted((sy * i, sy * w))
            for z0, z1, grow in ((-2.0, 1.2, 0.0), (1.2, 2.0, -0.6)):
                g = grow
                pts = [(x0 - g, y0 - g), (x1 + g, y0 - g), (x1 + g, y1 + g), (x0 - g, y1 + g)]
                for k in range(4):
                    a, b = pts[k], pts[(k + 1) % 4]
                    out = (b[1] - a[1], -(b[0] - a[0]), 0)
                    B.poly([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], STONE, out)
                B.poly([(p[0], p[1], z1) for p in pts], STONE, UP)


def summit(B):
    """The third floor's cabin, its gallery, the campanile, the beacon and the antenna."""
    z0, z1, h = THIRD, THIRD + 6.0, 7.2
    # the gallery's deck and rail
    floor(B, z0, W(z0) + 1.2, h - 1.0, 1.2, 1.4, False)
    # the cabin: glass between posts
    box(B, (0, 0), (1, 0, 0), (0, 1, 0), 2 * (h - 1.0), 2 * (h - 1.0), z0, z1)
    # the campanile: four ribs bowing in from the cabin's roof to the lantern
    zl = TOP - 4.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            prev = (sx * (h - 1.6), sy * (h - 1.6), z1 + 0.6)
            for k in range(1, 9):
                t = k / 8
                rr = (h - 1.6) * (1 - t) ** 1.6 + 2.0 * (1 - (1 - t) ** 1.6)
                p = (sx * rr * (1 - 0.15 * math.sin(t * math.pi)), sy * rr * (1 - 0.15 * math.sin(t * math.pi)), z1 + 0.6 + (zl - z1 - 0.6) * t)
                beam(B, prev, p, 0.5)
                prev = p
    # the lantern with the beacon, a cap, the mast
    sides = 12
    ring = lambda r, z: [(math.cos(2 * math.pi * s / sides) * r, math.sin(2 * math.pi * s / sides) * r, z) for s in range(sides)]
    stack = [(ring(2.4, zl), PAINT), (ring(2.4, zl + 1.0), BEACON), (ring(2.4, zl + 3.0), PAINT), (ring(2.6, zl + 3.4), PAINT), (ring(0.9, zl + 5.0), PAINT)]
    for k in range(len(stack) - 1):
        r0, mat = stack[k]
        r1 = stack[k + 1][0]
        for s in range(sides):
            n = (s + 1) % sides
            mid = (math.cos(2 * math.pi * (s + 0.5) / sides), math.sin(2 * math.pi * (s + 0.5) / sides), 0.2)
            B.poly([r0[s], r0[n], r1[n], r1[s]], mat, mid, col=bronze(zl), uv=[(0, 0)] * 4)
    zm = zl + 5.0
    mast = [(0.9, zm), (0.7, zm + 6), (0.55, zm + 14), (0.4, zm + 22), (0.25, ANTENNA)]
    bands = [lin('#e8e6e0'), lin('#c8352a')]
    for k in range(len(mast) - 1):
        (ra, za), (rb, zb) = mast[k], mast[k + 1]
        a, b = ring(ra, za), ring(rb, zb)
        for s in range(sides):
            n = (s + 1) % sides
            mid = (math.cos(2 * math.pi * (s + 0.5) / sides), math.sin(2 * math.pi * (s + 0.5) / sides), 0.05)
            B.poly([a[s], a[n], b[n], b[s]], PAINT, mid, col=bands[k % 2])
    for z in (zm + 6, zm + 14, zm + 22, ANTENNA - 0.3):
        r = 0.9
        pts = ring(r, z)
        for s in range(0, sides, 3):
            p = pts[s]
            beam(B, (p[0], p[1], z - 0.25), (p[0], p[1], z + 0.25), 0.45, RED, WHITE)


# ------------------------------------------------------------------------------------------- run

bpy.ops.wm.read_factory_settings(use_empty=True)
mats = materials()
B = Build()
piers(B)
legs(B)
shaft(B)
arches(B)
floor(B, FIRST, W(FIRST) + 1.4, I(FIRST) - 3.0, 6.5, 1.6, True)
floor(B, SECOND, W(SECOND) + 1.0, max(I(SECOND) - 2.0, 4.0), 3.5, 1.8, True)
summit(B)
me = B.mesh('eiffel', mats, {STONE: box_uv(2.0)})
ob = bpy.data.objects.new('eiffel', me)
bpy.context.scene.collection.objects.link(ob)
print(f'eiffel: {B.tris()} triangles, {len(LEVELS)} levels, outer {W(0):.1f}/{W(FIRST):.1f}/{W(SECOND):.1f}/{W(THIRD):.1f} m')
export(OUT)
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
