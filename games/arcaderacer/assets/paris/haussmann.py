# Makes haussmann.glb: Paris's apartment buildings, a kit of whole buildings ("lots") the land
# plugin stands round each city block, every one at three levels of detail, one object per lot per
# level, named `<lot>_near`, `<lot>_mid` and `<lot>_far`:
#   lot3a lot4a lot4b lot5a lot5b lot6a   a lot of 3 to 6 bays, BAY metres a bay, DEPTH deep
#   corner_a corner_b                     a corner lot, CORNER square, its corner cut CUT (the
#                                         pan coupé), `corner_b` with a zinc dome over the cut
# A lot's origin is the middle of its street front at the pavement; its front faces -y here, +z
# in the game (glTF is y-up), and it runs DEPTH back. A corner lot's origin is the corner the two
# street lines meet at; its fronts face -y and -x here (+z and -x in the game) and it fills the
# CORNER square behind them. Every lot carries a plinth of wall down to WALL_FOOT, so it stands on
# the lowest corner of its footprint without a gap on a slope.
#
# Each building is the Haussmann block: a rusticated base of shops, a porte-cochère and the
# entresol over the shops; a noble floor behind a continuous balcony on consoles, its windows under
# pediments; two floors of balconettes, under entablatures and keystones; a fifth floor behind a
# second continuous balcony; the main cornice; a zinc mansard of two slopes with a dormer over every
# bay; and chimney stacks crowded with pots on the party walls. The courtyard side is plain.
#
# Every texture is made here: the ashlar (the limestone grain of `limestone_1`, cc0-textures.com,
# cut into courses of blocks with their joints, each block its own shade), the zinc (`metal_roof`,
# the same, tinted), the wrought iron of the railings, the lit rooms seen through a window and the
# dusk sky in the glass. Materials: `stone`, `zinc`, `iron` (alpha-masked railings), `paint`
# (vertex coloured: frames, doors, shopfronts, awnings, chimney pots), `glass`, `lit` (a lit room).
# Vertex colour darkens the stone in reveals and under soffits, as light does.
#
# Two qualities, each its own file with the same lots, levels, names and extras:
#   high    haussmann.glb: the near level carries every moulding.
#   medium  haussmann_medium.glb: the near level is the same building with its small work cut: the
#           casements keep their frame and meeting stile but lose their glazing bars and imposte; no
#           modillions, no console brackets beside the window heads, no chimney pots, no gilt edges,
#           door panels, fanlight bars or shop mullions; the consoles, cornice, string courses and
#           slabs take the mid level's profiles, the arches and pediments fewer segments, the awnings
#           six stripes, and the courtyard side and its dormers are the mid level's. Mid and far are
#           high's.
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#       --python games/arcaderacer/assets/paris/haussmann.py -- <high|medium> <out.glb> \
#       <limestone colour> <limestone roughness> <zinc colour> <zinc normal> <zinc roughness>
# The limestone and zinc are the cc0-textures sets `limestone_1-4K` and `metal_roof-4K`, whose maps
# `yarn bake arcaderacer` (`arcaderacer.bake.ts`) takes from the library with its `texture` tool and
# hands over. It writes the plain glb Blender exports, which the bake packs into the game.
import math
import os
import random
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kit import (UP, WHITE, Build, Frame, arc, box_uv, dot, export, image, lin, load, masked,  # noqa: E402
                 normal_map, periodic_noise, principled, shade, smoothstep, segment_distance,
                 strokes_to_maps, texture, textured, vertex_tinted)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(ARGS) != 7:
    raise SystemExit('haussmann.py: -- <high|medium> <out.glb> <limestone colour> <limestone roughness> '
                     '<zinc colour> <zinc normal> <zinc roughness>')
QUALITY, OUT = ARGS[0], ARGS[1]
if QUALITY not in ('high', 'medium'):
    raise SystemExit(f'haussmann.py: quality {QUALITY} is not high or medium')
# the cc0-textures sets' maps, as the bake's texture() hands them over: limestone_1-4K's and metal_roof-4K's
LIMESTONE = {'colour': ARGS[2], 'roughness': ARGS[3]}
ZINC = {'colour': ARGS[4], 'normal': ARGS[5], 'roughness': ARGS[6]}


def fine(lod):
    """Whether a level carries the small work: the near level of the high quality only."""
    return lod == 'near' and QUALITY == 'high'


def shape(lod):
    """The level a profile or a segment count is taken at: medium's near takes mid's."""
    return 'mid' if lod == 'near' and QUALITY == 'medium' else lod


BAY = 3.0          # metres a bay
DEPTH = 12.0       # a lot's depth
CORNER = 12.0      # a corner lot's square
CUT = 3.0          # the pan coupé: how far back from the corner each street front stops
WALL_FOOT = -2.5   # how far the walls go down below the pavement
BASE_TOP = 6.2     # the rusticated base: the shops 0 to SHOP_TOP, the entresol over them
SHOP_TOP = 3.7
PLINTH = 0.5
STONE_TILE = 4.0   # metres the ashlar texture covers
ZINC_TILE = 4.0    # metres the zinc texture covers
RAIL = 1.0         # metres the railing texture covers each way

# the floors over the base: their floor level, height, window height and dressing
NOBLE = dict(h=3.4, win=2.6, balcony='full', head='pediment')
THIRD = dict(h=3.1, win=2.4, balcony='ette', head='entablature')
FOURTH = dict(h=2.9, win=2.25, balcony='ette', head='keystone')
FIFTH = dict(h=2.8, win=2.1, balcony='full', head='plain')

LODS = ('near', 'mid', 'far')
IMPOSTOR_PX = 24     # pixels a metre of a far lot's painted front
IMPOSTOR_ROOF = 2.8  # metres of the impostor over the cornice's top: its dormers
DORMER_W, DORMER_FACE, DORMER_EAVE, DORMER_HEAD = 1.55, 0.18, 2.15, 0.55

# each texture's pixels as it was made (sRGB, rows bottom up), for the impostors to paint from
PIXELS = {}


def grime(z):
    """How much of its light a stone face keeps at height z: the street's dirt splashed up the
    first metres of every wall."""
    t = np.clip((np.asarray(z, dtype=float) - 0.2) / 3.8, 0.0, 1.0)
    g = 0.78 + 0.22 * t * t * (3 - 2 * t)
    return float(g) if g.ndim == 0 else g


# -------------------------------------------------------------------------------------- textures

def ashlar():
    """The facade stone: courses of limestone blocks with their joints, each block its own shade.
    Colour, normal and roughness, STONE_TILE metres square, tiling."""
    N = 1024
    PX = N / STONE_TILE
    rng = np.random.default_rng(11)
    src = load(LIMESTONE['colour'], 1024)[..., :3]
    rough_src = load(LIMESTONE['roughness'], 1024)[..., 0]
    # the source is sixteen tiles 256 px square with joints between; each block borrows the grain
    # of the inside of one of them
    CROP0, CROP = 6, 244
    rows = 8
    course = STONE_TILE / rows
    yy, xx = np.mgrid[0:N, 0:N]
    xm = (xx + 0.5) / PX
    ym = (yy + 0.5) / PX
    colour = np.zeros((N, N, 3))
    rough = np.zeros((N, N))
    dist = np.full((N, N), 9.0)
    weather = np.zeros((N, N))
    for r in range(rows):
        band = slice(int(r * course * PX), int((r + 1) * course * PX))
        k = int(rng.choice([3, 3, 4]))
        lengths = rng.uniform(0.75, 1.3, k)
        lengths = lengths / lengths.sum() * STONE_TILE
        start = rng.uniform(0, STONE_TILE)
        cuts = np.sort((start + np.concatenate([[0], np.cumsum(lengths)[:-1]])) % STONE_TILE)
        x = xm[band]
        y = ym[band] - r * course
        # which block each pixel is in, and where in it
        idx = np.searchsorted(cuts, x, side='right') - 1
        idx = np.where(idx < 0, k - 1, idx)
        left = cuts[idx]
        u = (x - left) % STONE_TILE
        # distance to the joints: the head joints either side, the bed joints above and below
        dh = np.min(np.abs(((x[..., None] - cuts[None, None, :]) + STONE_TILE / 2) % STONE_TILE - STONE_TILE / 2), axis=-1)
        db = np.minimum(y, course - y)
        dist[band] = np.minimum(dh, db)
        tiles = rng.integers(0, 16, k)
        ox, oy = rng.integers(0, CROP, k), rng.integers(0, CROP, k)
        bright = np.clip(rng.normal(1.0, 0.022, k), 0.95, 1.05)
        warm = rng.normal(0.0, 0.009, k)
        sx = ((u * PX).astype(int) + ox[idx]) % (2 * CROP)
        sy = ((y * PX).astype(int) + oy[idx]) % (2 * CROP)
        sx = np.where(sx >= CROP, 2 * CROP - 1 - sx, sx)
        sy = np.where(sy >= CROP, 2 * CROP - 1 - sy, sy)
        tx, ty = tiles[idx] % 4, tiles[idx] // 4
        gx, gy = tx * 256 + CROP0 + sx, ty * 256 + CROP0 + sy
        c = src[gy, gx] * bright[idx][..., None]
        c += warm[idx][..., None] * np.array([1.0, 0.35, -0.7])
        colour[band] = c
        rough[band] = rough_src[gy, gx]
        # a block's foot holds a little more of the city's dust than its head
        weather[band] = np.exp(-y / 0.05) * 0.05
    # the grain sits on a cream Lutetian limestone, darker and warmer in broad drifts
    colour = colour / colour.reshape(-1, 3).mean(axis=0) * np.array([0.79, 0.755, 0.675])
    drift = periodic_noise(N, N, 9, rng, 0.05)
    colour *= (1.0 + drift)[..., None]
    colour *= (1.0 - weather * 0.5)[..., None]
    joint = 1.0 - smoothstep(0.0008, 0.004, dist)
    colour = colour * (1 - joint[..., None] * 0.13)
    height = -0.003 * (1.0 - smoothstep(0.001, 0.009, dist)) + (colour.mean(axis=-1) - 0.73) * 0.0006
    nrm = normal_map(height, PX)
    r = 0.78 + (rough - rough.mean()) * 0.6 + joint * 0.12
    one = np.ones((N, N, 1))
    PIXELS['stone'] = np.clip(colour, 0, 1)
    return (image('stone.colour', np.concatenate([colour, one], -1)),
            image('stone.normal', np.concatenate([nrm, one], -1), colour=False),
            image('stone.roughness', np.concatenate([np.repeat(r[..., None], 3, -1), one], -1), colour=False))


def zinc():
    """The mansards' zinc: `metal_roof`'s standing seams, cut to 1024 and kept for a tint."""
    N = 1024
    one = np.ones((N, N, 1))
    col = load(ZINC['colour'], N)[..., :3]
    nrm = load(ZINC['normal'], N)[..., :3]
    rough = load(ZINC['roughness'], N)[..., :1]
    return (image('zinc.colour', np.concatenate([col, one], -1)),
            image('zinc.normal', np.concatenate([nrm, one], -1), colour=False),
            image('zinc.roughness', np.concatenate([np.repeat(rough, 3, -1), one], -1), colour=False))


def railing():
    """The wrought iron of every balcony: a module RAIL/2 wide repeated, a metre tall. Rails top and
    bottom, posts between modules, a band of rings low down, an oval with four rings round it in the
    field, short balusters under the handrail. Colour with alpha, and a normal map of round bars."""
    N = 512
    PX = N / RAIL
    yy, xx = np.mgrid[0:N, 0:N]
    x = ((xx + 0.5) / PX) % (RAIL / 2)
    y = (yy + 0.5) / PX
    strokes = []  # (distance to the centre line, half thickness)

    def bar(ax, ay, bx, by, t):
        strokes.append((segment_distance(x, y, ax, ay, bx, by), t / 2))

    def ring(cx, cy, rx, ry, t):
        # an ellipse's distance, near enough for thin rings: the radial distance in the scaled space
        d = np.hypot((x - cx) / rx, (y - cy) / ry)
        strokes.append((np.abs(d - 1) * min(rx, ry), t / 2))

    M = RAIL / 2
    bar(-0.1, 0.045, M + 0.1, 0.045, 0.034)   # the bottom rail
    bar(-0.1, 0.17, M + 0.1, 0.17, 0.016)     # under the field
    bar(-0.1, 0.80, M + 0.1, 0.80, 0.016)     # over the field
    bar(-0.1, 0.962, M + 0.1, 0.962, 0.05)    # the handrail
    for px in (0.0, M):
        bar(px, 0.03, px, 0.965, 0.024)       # the posts
    for k in range(4):                        # the band of rings
        ring((k + 0.5) * M / 4, 0.1075, 0.045, 0.045, 0.01)
    ring(M / 2, 0.485, 0.125, 0.215, 0.013)   # the oval
    ring(M / 2, 0.485, 0.035, 0.035, 0.011)
    bar(M / 2, 0.17, M / 2, 0.27, 0.013)
    bar(M / 2, 0.70, M / 2, 0.80, 0.013)
    bar(0.012, 0.485, M / 2 - 0.125, 0.485, 0.011)
    bar(M / 2 + 0.125, 0.485, M - 0.012, 0.485, 0.011)
    for cx in (0.068, M - 0.068):             # the rings round the oval
        for cy in (0.245, 0.725):
            ring(cx, cy, 0.052, 0.052, 0.011)
    for k in range(8):                        # the balusters under the handrail
        bx = (k + 0.5) * M / 8
        bar(bx, 0.80, bx, 0.94, 0.011)
    colour, nrm = strokes_to_maps(strokes, x.shape, PX, (0.085, 0.09, 0.095))
    PIXELS['iron'] = colour
    return image('iron.colour', colour), image('iron.normal', nrm, colour=False)


def rooms():
    """A lit room seen through a window, four of them in a 2 × 2 atlas: lamp light from above, the
    curtains drawn back either side, a sheer between. The fourth is a shop, bright, with shelves."""
    N = 512
    T = N // 2
    out = np.zeros((N, N, 4))
    out[..., 3] = 1
    yy, xx = np.mgrid[0:T, 0:T]
    u = (xx + 0.5) / T
    v = (yy + 0.5) / T
    looks = [
        dict(lamp=(1.0, 0.74, 0.44), curtain=(0.62, 0.26, 0.18), sheer=0.75),
        dict(lamp=(1.0, 0.80, 0.55), curtain=(0.78, 0.70, 0.55), sheer=0.85),
        dict(lamp=(0.95, 0.70, 0.42), curtain=(0.25, 0.34, 0.26), sheer=0.6),
    ]
    for k, look in enumerate(looks):
        lamp = np.array(look['lamp'])
        glow = 0.45 + 0.55 * np.exp(-((u - 0.5) ** 2 / 0.08 + (v - 0.85) ** 2 / 0.06))
        room = lamp[None, None] * glow[..., None] * (0.55 + 0.45 * v[..., None])
        side = np.minimum(u, 1 - u)
        drape = smoothstep(0.24, 0.30, side)
        folds = 0.55 + 0.45 * np.sin(u * 70) ** 2
        curtain = np.array(look['curtain'])[None, None] * (folds * (0.35 + 0.4 * v))[..., None]
        sheer = room * (look['sheer'] + 0.1 * np.sin(u * 160)[..., None])
        tile = curtain * (1 - drape[..., None]) + sheer * drape[..., None]
        tx, ty = k % 2, k // 2
        out[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, :3] = tile
    # the shop: warm light off pale walls, the counter's shadow low down, shelves of goods behind
    rng = np.random.default_rng(5)
    shop = np.ones((T, T, 3)) * np.array([0.82, 0.68, 0.48]) * (0.45 + 0.4 * v[..., None])
    shop *= (0.8 + 0.2 * np.exp(-((u - 0.5) ** 2) / 0.1))[..., None]
    shelves = (np.abs(((v * 5) % 1) - 0.05) < 0.025) & (v > 0.3) & (v < 0.85)
    shop[shelves] *= 0.45
    for _ in range(40):
        cx, cy = rng.uniform(0.05, 0.95), rng.choice([0.4, 0.6, 0.8]) + 0.06
        w, h = rng.uniform(0.02, 0.05), rng.uniform(0.03, 0.07)
        box = (np.abs(u - cx) < w) & (np.abs(v - cy) < h)
        shop[box] = shop[box] * 0.6 + rng.uniform(0.15, 0.45, 3) * 0.4
    shop[v < 0.28] *= 0.35
    out[T:, T:, :3] = shop
    PIXELS['rooms'] = np.clip(out, 0, 1)
    return image('lit.colour', out)


def sky_glass():
    """The dusk sky in a window's glass: violet-blue above, a warm band low down, dark below."""
    N = 256
    yy, xx = np.mgrid[0:N, 0:N]
    v = (yy + 0.5) / N
    u = (xx + 0.5) / N
    top = np.array([0.34, 0.38, 0.52])
    low = np.array([0.07, 0.075, 0.09])
    c = low[None, None] + (top - low)[None, None] * smoothstep(0.15, 1.0, v)[..., None]
    c += np.array([0.32, 0.18, 0.10])[None, None] * np.exp(-((v - 0.4) ** 2) / 0.006)[..., None] * 0.6
    c *= (0.92 + 0.08 * np.sin((u + v * 0.6) * 9))[..., None]
    PIXELS['glass'] = np.clip(c, 0, 1)
    return image('glass.colour', np.concatenate([c, np.ones((N, N, 1))], -1))


# ------------------------------------------------------------------------------------- materials

def materials():
    stone = textured('stone', *ashlar())
    zinc_m = textured('zinc', *zinc(), tint=(0.36, 0.39, 0.43, 1.0), metallic=0.2)
    iron = masked('iron', *railing(), roughness=0.45, metallic=0.3)
    paint, nt, bsdf = principled('paint')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.55
    glass, nt, bsdf = principled('glass')
    vertex_tinted(nt, bsdf, texture(nt, sky_glass()).outputs['Color'])
    bsdf.inputs['Roughness'].default_value = 0.12
    lit, nt, bsdf = principled('lit')
    bsdf.inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
    nt.links.new(texture(nt, rooms()).outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.8
    bsdf.inputs['Roughness'].default_value = 0.2
    return [stone, zinc_m, iron, paint, glass, lit]


STONE, ZINC_M, IRON, PAINT, GLASS, LIT, FACADE = range(7)  # FACADE: each lot's own impostor material
# the lit atlas's tiles: three rooms, and the shop
ROOMS = [(0.0, 0.0), (0.5, 0.0), (0.0, 0.5)]
SHOP = (0.5, 0.5)
# stone and zinc are projected in metres; the stone darkens with the street's grime near its foot
UV_OF = {STONE: box_uv(STONE_TILE), ZINC_M: box_uv(ZINC_TILE)}


def tone(mat, z):
    return grime(z) if mat == STONE else 1.0


def roll(look, *keys):
    """A die for one choice of one lot, the same whichever level of detail asks: seeded by the lot
    and by what is being chosen where, never by how many rolls came before."""
    return random.Random(f"{look['seed']}:" + ':'.join(str(k) for k in keys))


def light(look, key, chance, shop=False):
    """The lit room an opening shows, or None when it is dark: `chance` of them are lit."""
    r = roll(look, 'lit', *key)
    if r.random() >= chance:
        return None
    return SHOP if shop else ROOMS[r.randrange(len(ROOMS))]


# ------------------------------------------------------------------------------------- impostors

def to_linear(c):
    c = np.asarray(c, dtype=float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(np.asarray(c, dtype=float), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def impostor(spec, look, path, bays, ground, floors, top):
    """A far lot's front painted as one picture of what the near lot is, from the same openings and
    the same lit rooms: the ashlar with its grime and the base's channels, the string courses, every
    window in its surround with its frame, the shops, doors and arcades, the balconies' slabs, their
    shadows and their iron, the cornice; over it, IMPOSTOR_ROOF of zinc with the dormers in it. A
    colour map and a glow map (the lit rooms), the whole facade path along u and the pavement to the
    dormers' heads up v. Linear light inside, sRGB out."""
    edges, total = edges_of(path, bays, ground, floors, look)
    H = top + 0.8 + IMPOSTOR_ROOF
    w, h = max(16, round(total * IMPOSTOR_PX)), round(H * IMPOSTOR_PX)
    U, Z = np.meshgrid((np.arange(w) + 0.5) / w * total, (np.arange(h) + 0.5) / h * H)
    stone = PIXELS['stone']
    n = stone.shape[0]
    col = to_linear(stone[((Z % STONE_TILE) / STONE_TILE * n).astype(int) % n, ((U % STONE_TILE) / STONE_TILE * n).astype(int) % n])
    col *= grime(Z)[..., None]
    col[Z < PLINTH] *= 0.85
    base = (Z > PLINTH) & (Z < BASE_TOP)
    col[base & ((((Z - PLINTH) / ((BASE_TOP - PLINTH) / 12)) % 1) < 0.07)] *= 0.7
    glow = np.zeros_like(col)
    iron = PIXELS['iron']
    iron_rgb, iron_a = to_linear(iron[..., :3]), iron[..., 3]
    rooms = to_linear(PIXELS['rooms'][..., :3])
    glass = to_linear(PIXELS['glass'])

    def scale(mask, k):
        col[mask] *= k

    def paint(mask, c):
        col[mask] = np.asarray(c[:3]) if len(np.shape(c)) == 1 else c[mask]

    def railing(mask, z0):
        ri = ((((Z - z0) / RAIL) % 1) * iron.shape[0]).astype(int) % iron.shape[0]
        rj = (((U / RAIL) % 1) * iron.shape[1]).astype(int) % iron.shape[1]
        a = iron_a[ri, rj] * mask
        col[:] = col * (1 - a[..., None]) + iron_rgb[ri, rj] * a[..., None]

    for lv in floors:
        if lv['balcony'] != 'full':
            scale((Z > lv['z0'] - 0.2) & (Z < lv['z0']), 1.06)
            scale((Z > lv['z0'] - 0.27) & (Z <= lv['z0'] - 0.2), 0.68)
    for e in edges:
        F, a = e['F'], e['along']
        ul = U - a
        on = (ul >= 0) & (ul < F.length)

        def rect(u0, u1, z0, z1):
            return on & (ul >= u0) & (ul < u1) & (Z >= z0) & (Z < z1)

        def opening(o, z0=None, z1=None):
            z0 = o.z0 if z0 is None else z0
            if o.spring is None or z1 is not None:
                return rect(o.u0, o.u1, z0, o.z1 if z1 is None else z1)
            r = (o.u1 - o.u0) / 2
            return on & (ul >= o.u0) & (ul < o.u1) & (Z >= z0) & ((Z < o.spring) | (np.hypot(ul - o.uc, Z - o.spring) < r))

        def fill(mask, o, room, z0=None, z1=None, u0=None, u1=None):
            """Glass across part of an opening: the dusk sky, or its lit room (and that room's glow)."""
            u0 = o.u0 if u0 is None else u0
            u1 = o.u1 if u1 is None else u1
            z0 = o.z0 if z0 is None else z0
            z1 = (o.z1 if z1 is None else z1)
            ru = np.clip((ul - u0) / max(u1 - u0, 1e-3), 0, 0.999)
            rv = np.clip((Z - z0) / max(z1 - z0, 1e-3), 0, 0.999)
            if room is None:
                g = glass.shape[0]
                col[mask] = glass[(rv * g).astype(int), (ru * g).astype(int)][mask]
            else:
                ox, oy = room
                m = rooms.shape[0]
                c = rooms[((oy + 0.5 * rv) * m).astype(int) % m, ((ox + 0.5 * ru) * m).astype(int) % m]
                col[mask] = 0.02
                glow[mask] = c[mask]

        def bars(o, frame, transoms, top_light=None):
            t = 0.07
            m = opening(o)
            inner = rect(o.u0 + t, o.u1 - t, o.z0 + t, o.z1 - t)
            paint(m & ~inner, frame)
            paint(rect(o.uc - 0.045, o.uc + 0.045, o.z0, o.z1 if top_light is None else o.z1 - top_light), frame)
            top = o.z1 - t if top_light is None else o.z1 - top_light
            if top_light is not None:
                paint(rect(o.u0, o.u1, top - 0.06, top), frame)
            for k in range(1, transoms + 1):
                z = o.z0 + t + (top - o.z0 - t) * k / (transoms + 1)
                paint(rect(o.u0, o.u1, z - 0.02, z + 0.02), frame)

        for o in e['ops']:
            if o.kind == 'window':
                lv = o.level
                if lv['head'] != 'plain':
                    scale(rect(o.u0 - 0.2, o.u1 + 0.2, o.z0, o.z1 + 0.2) & ~opening(o), 1.05)
                if lv['head'] in ('pediment', 'entablature'):
                    scale(rect(o.u0 - 0.38, o.u1 + 0.38, o.z1 + 0.2, o.z1 + 0.56), 1.08)
                    scale(rect(o.u0 - 0.38, o.u1 + 0.38, o.z1 + 0.14, o.z1 + 0.2), 0.7)
                fill(opening(o), o, o.room)
                scale(rect(o.u0, o.u1, o.z1 - 0.12, o.z1), 0.55)
                bars(o, look['frame'], 2, 0.6 if lv['head'] == 'pediment' else None)
            elif o.kind == 'entresol':
                fill(opening(o), o, o.room)
                bars(o, look['frame'], 1)
                scale(rect(o.u0 - 0.12, o.u1 + 0.12, o.z0 - 0.12, o.z0), 1.08)
            elif o.kind == 'shop':
                transom = o.z1 - SHOP_TRANSOM
                du0, du1 = (o.u0, o.u0 + SHOP_DOOR) if o.left else (o.u1 - SHOP_DOOR, o.u1)
                fill(opening(o), o, o.room, z0=0.0)
                paint(rect(o.u0, o.u1, 0, SHOP_RISER) & ~rect(du0, du1, 0, SHOP_RISER), o.colour)
                for u0, u1 in ((o.u0, o.u0 + 0.08), (o.u1 - 0.08, o.u1), (du0 - 0.04, du0 + 0.04), (du1 - 0.04, du1 + 0.04)):
                    paint(rect(u0, u1, 0, o.z1), o.colour)
                paint(rect(o.u0, o.u1, transom - 0.06, transom + 0.04), o.colour)
                paint(rect(o.u0 - 0.12, o.u1 + 0.12, o.z1 + 0.1, o.z1 + 0.62), o.colour)
                gold = lin('#b8913a')
                paint(rect(o.u0 - 0.06, o.u1 + 0.06, o.z1 + 0.16, o.z1 + 0.19), gold)
                paint(rect(o.u0 - 0.06, o.u1 + 0.06, o.z1 + 0.53, o.z1 + 0.56), gold)
                if o.cafe:
                    a_, b_ = look['awning']
                    top_ = o.z1 + 0.05
                    region = rect(o.u0 - 0.1, o.u1 + 0.1, top_ - 1.1, top_)
                    stripe = ((((ul - (o.u0 - 0.1)) / ((o.u1 - o.u0 + 0.2) / 12)).astype(int)) % 2 == 0)
                    shade_ = 0.75 + 0.25 * np.clip((Z - (top_ - 1.1)) / 1.1, 0, 1)
                    col[region & stripe] = np.asarray(a_[:3]) * shade_[region & stripe][..., None]
                    col[region & ~stripe] = np.asarray(b_[:3]) * shade_[region & ~stripe][..., None]
                    glow[region] = 0
            elif o.kind == 'door':
                m = opening(o)
                paint(m & (Z < o.spring), look['door'])
                paint(rect(o.uc - 0.03, o.uc + 0.03, 0, o.spring), tuple(c * 0.6 for c in look['door'][:3]))
                fill(m & (Z >= o.spring), o, None, z0=o.spring)
                scale(rect(o.uc - 0.22, o.uc + 0.22, o.z1 - 0.45, o.z1 + 0.12), 1.1)
            elif o.kind == 'arcade':
                m = opening(o)
                fill(m & (Z < SHOP_TOP), o, o.room, z0=SHOP_RISER, z1=SHOP_TOP)
                paint(m & (Z < SHOP_RISER), o.colour)
                paint(m & (Z >= SHOP_TOP) & (Z < SHOP_TOP + 0.45), o.colour)
                fill(m & (Z >= SHOP_TOP + 0.45), o, o.upper, z0=SHOP_TOP + 0.45)
                scale(rect(o.uc - 0.22, o.uc + 0.22, o.z1 - 0.45, o.z1 + 0.12), 1.1)
        # the balconettes: a slab under the window, its shadow, its iron
        for o in e['ops']:
            if o.kind == 'window' and o.level['balcony'] == 'ette':
                scale(rect(o.u0 - 0.28, o.u1 + 0.28, o.z0 - 0.15, o.z0 - 0.01), 1.1)
                scale(rect(o.u0 - 0.28, o.u1 + 0.28, o.z0 - 0.4, o.z0 - 0.15), 0.72)
                railing(rect(o.u0 - 0.2, o.u1 + 0.2, o.z0 - 0.01, o.z0 + 0.91), o.z0 - 0.01)
    # the continuous balconies, their slabs' shadows, their iron; then the cornice
    for lv in floors:
        if lv['balcony'] == 'full':
            along = (U > 0.15) & (U < total - 0.15)
            scale(along & (Z > lv['z0'] - 0.22) & (Z < lv['z0']), 1.1)
            scale(along & (Z > lv['z0'] - 0.62) & (Z <= lv['z0'] - 0.22), 0.6)
            railing(along & (Z >= lv['z0']) & (Z < lv['z0'] + 1.0), lv['z0'])
    scale((Z >= top + 0.24) & (Z < top + 0.38) & ((U % 0.6) > 0.16), 0.55)
    scale((Z >= top + 0.38) & (Z < top + 0.62), 1.12)
    scale((Z >= top) & (Z < top + 0.12), 0.92)
    # the roof's band: zinc, and each dormer's face, window and head
    zf = top + 0.8
    roof = Z >= zf
    col[roof] = to_linear(np.array([0.47, 0.5, 0.53]))[None] * (0.85 + 0.15 * ((U[roof] % 0.5) > 0.04))[..., None]
    glow[roof] = 0
    for d in dormer_spots(spec):
        e = edges[d['edge']]
        uc = e['along'] + d['uc']
        on = np.abs(U - uc) < DORMER_W / 2
        ze, ridge = zf + DORMER_EAVE, zf + DORMER_EAVE + DORMER_HEAD
        if look['dormer'] == 'round':
            head = on & (Z >= ze) & (np.hypot(U - uc, Z - (ze - 0.35)) < DORMER_W / 2 + 0.08)
        else:
            head = on & (Z >= ze) & (Z < ridge - np.abs(U - uc) * (DORMER_HEAD / (DORMER_W / 2)))
        face = on & (Z >= zf) & (Z < ze)
        col[face | head] = to_linear(stone[n // 3, n // 3]) * 0.95
        win = (np.abs(U - uc) < 0.5) & (Z >= zf + 0.35) & (Z < zf + 1.75)
        room = light(look, ('dormer',) + d['key'], look['lit'])
        o = Opening('window', uc - 0.5, uc + 0.5, zf + 0.35, zf + 1.75, 0.15)
        ru = np.clip((U - o.u0) / 1.0, 0, 0.999)
        rv = np.clip((Z - o.z0) / 1.4, 0, 0.999)
        if room is None:
            g = glass.shape[0]
            col[win] = glass[(rv * g).astype(int), (ru * g).astype(int)][win]
        else:
            m = rooms.shape[0]
            c = rooms[((room[1] + 0.5 * rv) * m).astype(int) % m, ((room[0] + 0.5 * ru) * m).astype(int) % m]
            col[win] = 0.02
            glow[win] = c[win]
        frame = win & ~((np.abs(U - uc) < 0.43) & (Z >= o.z0 + 0.07) & (Z < o.z1 - 0.07))
        col[frame | (win & (np.abs(U - uc) < 0.04))] = np.asarray(look['frame'][:3])
    one = np.ones((h, w, 1))
    name = spec['name']
    return (image(f'facade.{name}.colour', np.concatenate([to_srgb(col), one], -1)),
            image(f'facade.{name}.glow', np.concatenate([to_srgb(glow), one], -1)))


def facade_material(spec, look):
    """A lot's impostor material: its painted front, vertex coloured, its lit rooms glowing as the
    near lot's do."""
    path, bays, ground = fronts(spec)
    floors, top = floors_of(spec['extra'])
    colour, glow = impostor(spec, look, path, bays, ground, floors, top)
    m, nt, bsdf = principled(f"facade.{spec['name']}")
    vertex_tinted(nt, bsdf, texture(nt, colour).outputs['Color'])
    nt.links.new(texture(nt, glow).outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.8
    bsdf.inputs['Roughness'].default_value = 0.85
    return m


# ------------------------------------------------------------------------------------- geometry

def fbox(B, F, u0, u1, v0, v1, z0, z1, mat, col=WHITE, skip=()):
    c = F.p
    faces = {
        'front': ([c(u0, v1, z0), c(u1, v1, z0), c(u1, v1, z1), c(u0, v1, z1)], F.n3),
        'back': ([c(u0, v0, z0), c(u1, v0, z0), c(u1, v0, z1), c(u0, v0, z1)], F.dir(0, -1, 0)),
        'left': ([c(u0, v0, z0), c(u0, v1, z0), c(u0, v1, z1), c(u0, v0, z1)], F.dir(-1, 0, 0)),
        'right': ([c(u1, v0, z0), c(u1, v1, z0), c(u1, v1, z1), c(u1, v0, z1)], F.t3),
        'top': ([c(u0, v0, z1), c(u1, v0, z1), c(u1, v1, z1), c(u0, v1, z1)], UP),
        'bottom': ([c(u0, v0, z0), c(u1, v0, z0), c(u1, v1, z0), c(u0, v1, z0)], (0, 0, -1)),
    }
    for k, (pts, want) in faces.items():
        if k in skip:
            continue
        tone = col
        if mat == STONE and k == 'bottom':
            tone = tuple(x * 0.78 for x in col[:3]) + (1,)
        B.poly(pts, mat, want, col=tone)


def fprism(B, F, u0, u1, prof, mat, col=WHITE, caps=True):
    """A profile in (v, z), from the wall out and back, extruded along u from u0 to u1."""
    for j in range(len(prof) - 1):
        (va, za), (vb, zb) = prof[j], prof[j + 1]
        want = F.dir(0, zb - za, -(vb - va))
        tone = col
        if mat == STONE and want[2] < -0.3:
            tone = tuple(x * 0.8 for x in col[:3]) + (1,)
        B.poly([F.p(u0, va, za), F.p(u1, va, za), F.p(u1, vb, zb), F.p(u0, vb, zb)], mat, want, col=tone)
    if caps:
        B.poly([F.p(u0, v, z) for v, z in prof], mat, F.dir(-1, 0, 0), col=col)
        B.poly([F.p(u1, v, z) for v, z in prof], mat, F.t3, col=col)


def sweep(B, path, prof, mat, col=WHITE, caps=True):
    """A profile in (v, z) swept along a facade path (its corners mitred), `v` out of the wall."""
    normals = []
    for k in range(len(path) - 1):
        dx, dy = path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]
        l = math.hypot(dx, dy)
        normals.append((dy / l, -dx / l))
    miters = []
    for k in range(len(path)):
        if k == 0:
            m = normals[0]
        elif k == len(path) - 1:
            m = normals[-1]
        else:
            a, b = normals[k - 1], normals[k]
            s = 1 + a[0] * b[0] + a[1] * b[1]
            m = ((a[0] + b[0]) / s, (a[1] + b[1]) / s)
        miters.append(m)
    rings = [[(path[k][0] + miters[k][0] * v, path[k][1] + miters[k][1] * v, z) for v, z in prof] for k in range(len(path))]
    for k in range(len(path) - 1):
        n = normals[k]
        for j in range(len(prof) - 1):
            (va, za), (vb, zb) = prof[j], prof[j + 1]
            dz, dv = zb - za, vb - va
            want = (n[0] * dz, n[1] * dz, -dv)
            tone = col
            if mat == STONE and want[2] < -0.3 * math.hypot(dz, dv):
                tone = tuple(x * 0.8 for x in col[:3]) + (1,)
            B.poly([rings[k][j], rings[k + 1][j], rings[k + 1][j + 1], rings[k][j + 1]], mat, want, col=tone)
    if caps:
        t0 = (path[0][0] - path[1][0], path[0][1] - path[1][1], 0)
        t1 = (path[-1][0] - path[-2][0], path[-1][1] - path[-2][1], 0)
        B.poly(rings[0], mat, t0, col=col)
        B.poly(rings[-1], mat, t1, col=col)


def offset_path(path, v):
    """A path moved `v` out of its wall, mitred."""
    out = []
    normals = []
    for k in range(len(path) - 1):
        dx, dy = path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]
        l = math.hypot(dx, dy)
        normals.append((dy / l, -dx / l))
    for k in range(len(path)):
        if k == 0:
            m = normals[0]
        elif k == len(path) - 1:
            m = normals[-1]
        else:
            a, b = normals[k - 1], normals[k]
            s = 1 + a[0] * b[0] + a[1] * b[1]
            m = ((a[0] + b[0]) / s, (a[1] + b[1]) / s)
        out.append((path[k][0] + m[0] * v, path[k][1] + m[1] * v))
    return out


def trim_path(path, d0, d1):
    """A path with `d0` cut off its start and `d1` off its end."""
    p = list(path)
    a, b = p[0], p[1]
    l = math.hypot(b[0] - a[0], b[1] - a[1])
    p[0] = (a[0] + (b[0] - a[0]) * d0 / l, a[1] + (b[1] - a[1]) * d0 / l)
    a, b = p[-1], p[-2]
    l = math.hypot(b[0] - a[0], b[1] - a[1])
    p[-1] = (a[0] + (b[0] - a[0]) * d1 / l, a[1] + (b[1] - a[1]) * d1 / l)
    return p


def rail(B, path, z0, h):
    """A railing card along a path, its texture running a metre a repeat along it."""
    along = 0.0
    for k in range(len(path) - 1):
        a, b = path[k], path[k + 1]
        l = math.hypot(b[0] - a[0], b[1] - a[1])
        n = ((b[1] - a[1]) / l, -(b[0] - a[0]) / l, 0)
        u0, u1 = along / RAIL, (along + l) / RAIL
        B.poly([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z0 + h), (a[0], a[1], z0 + h)], IRON, n,
               uv=[(u0, 0), (u1, 0), (u1, h / RAIL), (u0, h / RAIL)])
        along += l


# ------------------------------------------------------------------------------------- openings

class Opening:
    """A hole in a facade: u0..u1 along, z0..z1 up, with a round head from `spring` when arched."""

    def __init__(self, kind, u0, u1, z0, z1, depth, spring=None, **extra):
        self.kind, self.u0, self.u1, self.z0, self.z1, self.depth, self.spring = kind, u0, u1, z0, z1, depth, spring
        self.__dict__.update(extra)

    @property
    def uc(self):
        return (self.u0 + self.u1) / 2

    def head(self, n):
        """The arch's points from the left spring over to the right, or the two top corners."""
        if self.spring is None:
            return [(self.u0, self.z1), (self.u1, self.z1)]
        r = (self.u1 - self.u0) / 2
        return arc(self.uc, self.spring, r, math.pi, 0, n)


def wall(B, F, z0, z1, openings, col=WHITE, segs=10):
    """A facade's wall from z0 to z1 at v = 0 with its openings cut out: a grid of the rectangles
    left between them, and round each arched head the stone between the arch and its square."""
    us = sorted({0.0, F.length} | {o.u0 for o in openings} | {o.u1 for o in openings})
    zs = sorted({z0, z1} | {o.z0 for o in openings} | {o.z1 for o in openings} | {o.spring for o in openings if o.spring})
    for i in range(len(us) - 1):
        for j in range(len(zs) - 1):
            cu, cz = (us[i] + us[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            hole = next((o for o in openings if o.u0 < cu < o.u1 and o.z0 < cz < o.z1), None)
            if hole is not None and (hole.spring is None or cz < hole.spring):
                continue
            if hole is not None:
                continue  # the arched head's square, filled below
            B.poly([F.p(us[i], 0, zs[j]), F.p(us[i + 1], 0, zs[j]), F.p(us[i + 1], 0, zs[j + 1]), F.p(us[i], 0, zs[j + 1])], STONE, F.n3, col=col)
    for o in openings:
        if o.spring is None:
            continue
        pts = o.head(segs)
        half = segs // 2
        # the left spandrel fans from the square's top left corner, the right from its top right
        for k in range(half):
            B.poly([F.p(o.u0, 0, o.z1), F.p(pts[k][0], 0, pts[k][1]), F.p(pts[k + 1][0], 0, pts[k + 1][1])], STONE, F.n3, col=col)
        for k in range(half, segs):
            B.poly([F.p(o.u1, 0, o.z1), F.p(pts[k][0], 0, pts[k][1]), F.p(pts[k + 1][0], 0, pts[k + 1][1])], STONE, F.n3, col=col)


def reveal(B, F, o, segs=10):
    """The stone sides of an opening, from the wall face back to its infill, darker inside."""
    d = -o.depth
    tone = shade(0.7)
    B.poly([F.p(o.u0, 0, o.z0), F.p(o.u0, d, o.z0), F.p(o.u0, d, o.spring or o.z1), F.p(o.u0, 0, o.spring or o.z1)], STONE, F.t3, col=tone)
    B.poly([F.p(o.u1, 0, o.z0), F.p(o.u1, d, o.z0), F.p(o.u1, d, o.spring or o.z1), F.p(o.u1, 0, o.spring or o.z1)], STONE, F.dir(-1, 0, 0), col=tone)
    if o.z0 > 0.01:
        B.poly([F.p(o.u0, 0, o.z0), F.p(o.u1, 0, o.z0), F.p(o.u1, d, o.z0), F.p(o.u0, d, o.z0)], STONE, UP, col=shade(0.85))
    head = o.head(segs)
    for k in range(len(head) - 1):
        (ua, za), (ub, zb) = head[k], head[k + 1]
        inward = (o.uc - (ua + ub) / 2, 0, (o.spring if o.spring else o.z0) - (za + zb) / 2)
        want = F.dir(inward[0], 0, inward[2])
        B.poly([F.p(ua, 0, za), F.p(ub, 0, zb), F.p(ub, d, zb), F.p(ua, d, za)], STONE, want, col=shade(0.6))


def pane(B, F, o, v, room, z0=None, z1=None, u0=None, u1=None, segs=10):
    """Glass across an opening at `v`: the dusk sky, or with `room` that lit room of the atlas."""
    u0 = o.u0 if u0 is None else u0
    u1 = o.u1 if u1 is None else u1
    z0 = o.z0 if z0 is None else z0
    top = o.z1 if z1 is None else z1
    if room is not None:
        ox, oy = room
        uv = lambda u, z: (ox + 0.5 * (u - u0) / (u1 - u0), oy + 0.5 * (z - z0) / (top - z0))
        mat = LIT
    else:
        uv = lambda u, z: ((u - u0) / (u1 - u0), (z - z0) / (top - z0))
        mat = GLASS
    if o.spring is not None and z1 is None:
        head = [(u, z) for u, z in o.head(segs)]
        pts = [(u0, z0), (u1, z0)] + list(reversed(head))
        # the arch over the square part of the opening, one convex polygon
        B.poly([F.p(u, v, z) for u, z in pts], mat, F.n3, uv=[uv(u, z) for u, z in pts])
        return
    B.poly([F.p(u0, v, z0), F.p(u1, v, z0), F.p(u1, v, top), F.p(u0, v, top)], mat, F.n3,
           uv=[uv(u0, z0), uv(u1, z0), uv(u1, top), uv(u0, top)])


def casement(B, F, o, v, frame, transoms=2, imposte=None):
    """A French window's painted frame: its surround, the meeting stiles, the glazing bars."""
    t, w = 0.07, 0.05
    u0, u1, z0, z1 = o.u0, o.u1, o.z0, o.z1
    fbox(B, F, u0, u1, v, v + w, z0, z0 + t, PAINT, frame, skip=('back',))
    fbox(B, F, u0, u1, v, v + w, z1 - t, z1, PAINT, frame, skip=('back',))
    fbox(B, F, u0, u0 + t, v, v + w, z0 + t, z1 - t, PAINT, frame, skip=('back',))
    fbox(B, F, u1 - t, u1, v, v + w, z0 + t, z1 - t, PAINT, frame, skip=('back',))
    top = z1 - t
    if imposte is not None:
        top = z1 - imposte
        fbox(B, F, u0 + t, u1 - t, v, v + w, top - 0.06, top, PAINT, frame, skip=('back',))
    uc = (u0 + u1) / 2
    fbox(B, F, uc - 0.045, uc + 0.045, v, v + w + 0.01, z0 + t, top, PAINT, frame, skip=('back',))
    for k in range(1, transoms + 1):
        z = z0 + t + (top - z0 - t) * k / (transoms + 1)
        fbox(B, F, u0 + t, u1 - t, v + 0.005, v + w - 0.01, z - 0.018, z + 0.018, PAINT, frame, skip=('back',))


# --------------------------------------------------------------------------------------- facade

def floors_of(extra):
    levels = [NOBLE, THIRD, FOURTH] + ([FOURTH] if extra else []) + [FIFTH]
    out, z = [], BASE_TOP
    for lv in levels:
        out.append(dict(lv, z0=z, z1=z + lv['h']))
        z += lv['h']
    return out, z


def cornice_profile(lod):
    lod = shape(lod)
    if lod == 'far':
        return [(0, 0), (0.55, 0.15), (0.55, 0.8), (0, 0.8)]
    if lod == 'mid':
        return [(0, 0), (0.12, 0.0), (0.2, 0.2), (0.55, 0.45), (0.62, 0.62), (0.62, 0.8), (0, 0.8)]
    # a frieze band, the bed mould, the corona and the cyma over it
    return [(0, 0), (0.06, 0.0), (0.06, 0.12), (0.12, 0.14), (0.14, 0.22), (0.24, 0.26), (0.3, 0.34), (0.52, 0.38),
            (0.56, 0.44), (0.56, 0.58), (0.6, 0.6), (0.66, 0.68), (0.72, 0.8), (0, 0.8)]


def band_profile(lod):
    if shape(lod) == 'near':
        return [(0, 0), (0.04, 0.02), (0.07, 0.06), (0.07, 0.14), (0.1, 0.16), (0.1, 0.2), (0, 0.2)]
    return [(0, 0), (0.08, 0.04), (0.08, 0.2), (0, 0.2)]


def slab_profile(lod, depth, thick):
    if shape(lod) == 'near':
        return [(0, 0), (depth - 0.08, 0), (depth - 0.03, 0.04), (depth, 0.1), (depth, thick), (0, thick)]
    return [(0, 0), (depth, 0), (depth, thick), (0, thick)]


def console(B, F, u, z_top, depth, height, width, lod):
    """A scrolled stone console under a balcony: a profile in (v, z) extruded across its width."""
    if lod != 'near':
        return
    if fine(lod):
        prof = [(0, z_top - height), (0.12, z_top - height), (0.16, z_top - height * 0.8), (0.22, z_top - height * 0.55),
                (0.38, z_top - height * 0.35), (depth * 0.8, z_top - height * 0.2), (depth, z_top - 0.08), (depth, z_top), (0, z_top)]
    else:
        # the scroll as three straight runs
        prof = [(0, z_top - height), (0.14, z_top - height), (0.3, z_top - height * 0.45), (depth, z_top - 0.08), (depth, z_top), (0, z_top)]
    fprism(B, F, u - width / 2, u + width / 2, prof, STONE)


def openings(F, edge, bays, kinds, floors, look):
    """A facade edge's openings: the base's, one a bay by its kind (and the entresol's over a shop),
    then every floor's windows. Each knows its `key`, where it is, and what it shows: `room`, the lit
    room behind its glass or None; a shop's `colour` and `door` side."""
    out = []
    bw = F.length / bays
    for k, kind in enumerate(kinds):
        uc = (k + 0.5) * bw
        if kind in 'SC':
            w = min(2.55, bw - 0.5)
            out.append(Opening('shop', uc - w / 2, uc + w / 2, 0.0, SHOP_TOP - 0.15, 0.28, cafe=kind == 'C'))
            ew = min(1.25, bw - 1.0)
            out.append(Opening('entresol', uc - ew / 2, uc + ew / 2, 4.45, 5.85, 0.3))
        elif kind == 'D':
            w = min(2.7, bw - 0.4)
            out.append(Opening('door', uc - w / 2, uc + w / 2, 0.0, 4.75, 0.38, spring=4.75 - w / 2))
        elif kind == 'A':
            w = min(2.5, bw - 0.6)
            out.append(Opening('arcade', uc - w / 2, uc + w / 2, 0.0, 5.75, 0.3, spring=5.75 - w / 2))
    for lv in floors:
        w = 1.2 if lv['head'] == 'plain' else 1.3
        w = min(w, bw - 0.9)
        for k in range(bays):
            uc = (k + 0.5) * bw
            z0 = lv['z0'] + 0.15
            out.append(Opening('window', uc - w / 2, uc + w / 2, z0, z0 + lv['win'], 0.32, level=lv, bay=k))
    for o in out:
        o.key = (edge, o.kind, round(o.u0, 2), round(o.z0, 2))
        shop = o.kind in ('shop', 'arcade')
        o.room = light(look, o.key, 0.75 if shop else look['lit'], shop=shop)
        r = roll(look, 'shop', *o.key)
        o.colour = look['shops'][r.randrange(len(look['shops']))]
        o.left = r.random() < 0.5
        if o.kind == 'arcade':
            o.upper = light(look, o.key + ('upper',), look['lit'])
    return out


def rustication(B, F, openings, lod):
    """The base's channelled stone, near only: courses proud of the wall with a bevelled groove
    under each, broken by the openings and stopping at their reveals."""
    if lod != 'near':
        return
    courses = 12
    h = (BASE_TOP - PLINTH) / courses
    proud = 0.035
    for c in range(courses):
        za, zb = PLINTH + c * h, PLINTH + (c + 1) * h
        # the runs of this course not crossed by an opening
        cuts = sorted((o.u0, o.u1) for o in openings if o.z0 < zb - 0.01 and (o.z1 > za + 0.01))
        runs, u = [], 0.0
        for a, b in cuts:
            if a > u + 0.01:
                runs.append((u, a))
            u = max(u, b)
        if u < F.length - 0.01:
            runs.append((u, F.length))
        for u0, u1 in runs:
            # an arched opening's head cuts the course only where the arch is
            prof = [(0, za), (proud, za + 0.03), (proud, zb), (0, zb)]
            fprism(B, F, u0, u1, prof, STONE)


def heads(B, F, o, lod, pediment):
    """A window's stone surround and what crowns it, by its floor (a balconette's slab is its sill,
    a continuous balcony is the noble and fifth floors'). Near only: past that it is a shade."""
    if lod != 'near':
        return
    lv = o.level
    s, p = 0.2, 0.045
    u0, u1, z0, z1 = o.u0, o.u1, o.z0, o.z1
    fbox(B, F, u0 - s, u0, 0, p, z0, z1, STONE, skip=('back',))
    fbox(B, F, u1, u1 + s, 0, p, z0, z1, STONE, skip=('back',))
    ear = 0.08 if fine(lod) and lv['head'] in ('pediment', 'entablature') else 0.0
    fbox(B, F, u0 - s - ear, u1 + s + ear, 0, p, z1, z1 + s, STONE, skip=('back',))
    if ear:
        fbox(B, F, u0 - s - ear, u0 - s, 0, p, z1 - 0.14, z1, STONE, skip=('back',))
        fbox(B, F, u1 + s, u1 + s + ear, 0, p, z1 - 0.14, z1, STONE, skip=('back',))
    top = z1 + s
    w0, w1 = u0 - s - 0.18, u1 + s + 0.18
    if lv['head'] == 'pediment':
        kind = pediment if pediment != 'alt' else ('tri' if o.bay % 2 == 0 else 'seg')
        # the frieze, then the cornice slab on its consoles, then the pediment
        fbox(B, F, u0 - s, u1 + s, 0, p, top, top + 0.22, STONE, skip=('back',))
        fprism(B, F, w0, w1, [(0, top + 0.22), (0.16, top + 0.24), (0.2, top + 0.3), (0.2, top + 0.36), (0, top + 0.36)], STONE)
        if fine(lod):
            for uc in (u0 - s - 0.05, u1 + s + 0.05):
                prof = [(0, z1 - 0.45), (0.06, z1 - 0.45), (0.12, z1 - 0.2), (0.16, top + 0.1), (0.16, top + 0.22), (0, top + 0.22)]
                fprism(B, F, uc - 0.07, uc + 0.07, prof, STONE)
        base = top + 0.36
        mid = (u0 + u1) / 2
        half = (w1 - w0) / 2
        rise = 0.42
        if kind == 'tri':
            # the raking cornice: two sloped slabs, and the tympanum between them
            pts = [(w0, base), (w1, base), (mid, base + rise)]
            B.poly([F.p(u, 0.14, z) for u, z in pts], STONE, F.n3)
            for (ua, za), (ub, zb) in ((pts[0], pts[2]), (pts[2], pts[1])):
                B.poly([F.p(ua, 0.0, za), F.p(ub, 0.0, zb), F.p(ub, 0.14, zb), F.p(ua, 0.14, za)], STONE, UP)
            B.poly([F.p(w0, 0, base), F.p(w0, 0.14, base), F.p(mid, 0.14, base + rise), F.p(mid, 0, base + rise)], STONE, F.dir(-1, 0, 1))
        else:
            r = (half * half + rise * rise) / (2 * rise)
            cz = base + rise - r
            a0 = math.acos(max(-1, min(1, half / r)))
            pts = arc(mid, cz, r, math.pi - a0, a0, 8 if fine(lod) else 4)
            B.poly([F.p(u, 0.14, z) for u, z in [(w0, base), (w1, base)] + list(reversed(pts[1:-1]))], STONE, F.n3)
            for k in range(len(pts) - 1):
                (ua, za), (ub, zb) = pts[k], pts[k + 1]
                B.poly([F.p(ua, 0.0, za), F.p(ub, 0.0, zb), F.p(ub, 0.14, zb), F.p(ua, 0.14, za)], STONE, UP)
    elif lv['head'] == 'entablature':
        fbox(B, F, u0 - s, u1 + s, 0, p, top, top + 0.2, STONE, skip=('back',))
        fprism(B, F, w0 + 0.05, w1 - 0.05, [(0, top + 0.2), (0.14, top + 0.22), (0.18, top + 0.28), (0.18, top + 0.34), (0, top + 0.34)], STONE)
        if fine(lod):
            for uc in (u0 - s + 0.02, u1 + s - 0.02):
                prof = [(0, top - 0.25), (0.05, top - 0.25), (0.1, top - 0.05), (0.13, top + 0.2), (0, top + 0.2)]
                fprism(B, F, uc - 0.06, uc + 0.06, prof, STONE)
    elif lv['head'] == 'keystone':
        mid = (u0 + u1) / 2
        fprism(B, F, mid - 0.16, mid + 0.16, [(0, z1 - 0.12), (0.1, z1 - 0.12), (0.12, top + 0.12), (0, top + 0.12)], STONE)


def balcony_full(B, path, z, lod, consoles_at):
    """A continuous balcony along a facade path at floor level z: the slab, its consoles, its rail."""
    depth, thick = 0.82, 0.22
    run = trim_path(path, 0.15, 0.15)
    prof =[(v, z - thick + dz) for v, dz in slab_profile(lod, depth, thick)]
    sweep(B, run, prof, STONE)
    front = offset_path(run, depth - 0.04)
    rail(B, front, z, 1.0)
    # the returns at either end, back to the wall
    a0, a1 = run[0], front[0]
    rail(B, [a1, a0], z, 1.0)
    b0, b1 = run[-1], front[-1]
    rail(B, [b0, b1], z, 1.0)
    for F, u in consoles_at:
        console(B, F, u, z - thick, depth - 0.1, 0.62, 0.26, lod)


def edges_of(path, bays, ground, floors, look):
    """A facade path's edges, each its frame and its openings, and where along the whole facade it
    starts."""
    out, along = [], 0.0
    for e, (nb, kinds) in enumerate(zip(bays, ground)):
        F = Frame(path[e], path[e + 1])
        out.append(dict(F=F, bays=nb, ops=openings(F, e, nb, kinds, floors, look), along=along))
        along += F.length
    return out, along


def facade(B, path, bays, ground, floors, top, lod, look):
    """A street facade along a path (one edge, or a corner lot's three): walls and openings with
    their reveals, glass, frames, surrounds and heads, the base's shops, doors and arcades, the
    string courses, the two continuous balconies, the balconettes, and the cornice over it all. Far
    off, the front is one quad of the lot's own impostor (FACADE), the cornice's mass over it."""
    edges, total = edges_of(path, bays, ground, floors, look)
    frames = [e['F'] for e in edges]
    if lod == 'far':
        H = top + 0.8
        v1 = H / (H + IMPOSTOR_ROOF)
        for e in edges:
            F, a = e['F'], e['along']
            B.poly([F.p(0, 0, WALL_FOOT), F.p(F.length, 0, WALL_FOOT), F.p(F.length, 0, 0), F.p(0, 0, 0)], STONE, F.n3, col=shade(0.85))
            u0, u1 = a / total, (a + F.length) / total
            B.poly([F.p(0, 0, 0), F.p(F.length, 0, 0), F.p(F.length, 0, H), F.p(0, 0, H)], FACADE, F.n3,
                   uv=[(u0, 0), (u1, 0), (u1, v1), (u0, v1)])
        sweep(B, path, [(v, top + z) for v, z in cornice_profile('far')], STONE)
        return
    consoles = []
    for e in edges:
        F, nb, ops = e['F'], e['bays'], e['ops']
        wall(B, F, WALL_FOOT, top + 0.8, ops, segs=10 if fine(lod) else 6)
        fbox(B, F, 0, F.length, 0, 0.06, WALL_FOOT, PLINTH, STONE, col=shade(0.88), skip=('back', 'bottom'))
        rustication(B, F, ops, lod)
        bw = F.length / nb
        for k in range(nb + 1):
            consoles.append((F, min(max(k * bw, 0.35), F.length - 0.35)))
        for o in ops:
            reveal(B, F, o, segs=10 if fine(lod) else 6)
            if o.kind == 'window':
                pane(B, F, o, -o.depth + 0.04, o.room)
                if fine(lod):
                    casement(B, F, o, -o.depth + 0.06, look['frame'], imposte=0.6 if o.level['head'] == 'pediment' else None)
                elif lod == 'near':
                    casement(B, F, o, -o.depth + 0.06, look['frame'], transoms=0)
                heads(B, F, o, lod, look['pediment'])
                if o.level['balcony'] == 'ette':
                    fprism(B, F, o.u0 - 0.28, o.u1 + 0.28, [(v, o.z0 - 0.15 + dz) for v, dz in slab_profile(lod, 0.3, 0.14)], STONE)
                    rail(B, [F.p(o.u0 - 0.2, 0.26, 0)[:2], F.p(o.u1 + 0.2, 0.26, 0)[:2]], o.z0 - 0.01, 0.92)
            elif o.kind == 'entresol':
                pane(B, F, o, -o.depth + 0.04, o.room)
                if lod == 'near':
                    casement(B, F, o, -o.depth + 0.06, look['frame'], transoms=1 if fine(lod) else 0)
                fbox(B, F, o.u0 - 0.12, o.u1 + 0.12, 0, 0.08, o.z0 - 0.12, o.z0, STONE, skip=('back',))
            elif o.kind == 'shop':
                shopfront(B, F, o, lod, look)
            elif o.kind == 'door':
                porte(B, F, o, lod, look)
            elif o.kind == 'arcade':
                arcade(B, F, o, lod, look)
        # a keystone over every arch
        if lod == 'near':
            for o in ops:
                if o.spring is not None:
                    apex = o.z1
                    fprism(B, F, o.uc - 0.22, o.uc + 0.22, [(0, apex - 0.45), (0.1, apex - 0.45), (0.14, apex + 0.12), (0, apex + 0.12)], STONE)
    # the string courses at the floors without a continuous balcony, and over the base
    for lv in floors:
        if lv['balcony'] != 'full':
            sweep(B, path, [(v, lv['z0'] - 0.2 + z) for v, z in band_profile(lod)], STONE)
    for lv in floors:
        if lv['balcony'] == 'full':
            balcony_full(B, path, lv['z0'], lod, consoles)
    sweep(B, path, [(v, top + z) for v, z in cornice_profile(lod)], STONE)
    if fine(lod):
        # the modillions under the corona
        for F in frames:
            n = int(F.length / 0.6)
            for k in range(n):
                u = (k + 0.5) * F.length / n
                fbox(B, F, u - 0.07, u + 0.07, 0.06, 0.5, top + 0.24, top + 0.38, STONE, skip=('back',))


SHOP_RISER, SHOP_DOOR, SHOP_TRANSOM = 0.5, 1.0, 0.55


def shopfront(B, F, o, lod, look):
    """A shop's front in its opening: stall riser, framed glass with a door to one side and a
    transom light, all in the shop's colour; the fascia board over the opening; an awning on a café."""
    colour, left = o.colour, o.left
    v = -o.depth + 0.04
    riser = SHOP_RISER
    fbox(B, F, o.u0, o.u1, v - 0.04, v + 0.06, 0, riser, PAINT, colour, skip=('back',))
    transom = o.z1 - SHOP_TRANSOM
    du0, du1 = (o.u0, o.u0 + SHOP_DOOR) if left else (o.u1 - SHOP_DOOR, o.u1)
    gu0, gu1 = (du1, o.u1) if left else (o.u0, du0)
    pane(B, F, o, v, o.room, z0=riser, z1=transom, u0=gu0, u1=gu1)
    pane(B, F, o, v, o.room, z0=0.05, z1=transom, u0=du0, u1=du1)
    pane(B, F, o, v, o.room, z0=transom, z1=o.z1)
    if lod == 'near':
        t = 0.08
        for u0, u1 in ((o.u0, o.u0 + t), (o.u1 - t, o.u1), (du0 if left else du0 - t, (du0 + t) if left else du0)):
            fbox(B, F, u0, u1, v, v + 0.08, 0, o.z1, PAINT, colour, skip=('back',))
        if left:
            fbox(B, F, du1 - t / 2, du1 + t / 2, v, v + 0.08, 0, o.z1, PAINT, colour, skip=('back',))
        fbox(B, F, o.u0, o.u1, v, v + 0.08, transom - 0.06, transom + 0.04, PAINT, colour, skip=('back',))
        fbox(B, F, o.u0, o.u1, v, v + 0.08, o.z1 - 0.07, o.z1, PAINT, colour, skip=('back',))
        if fine(lod):
            mid = (gu0 + gu1) / 2
            fbox(B, F, mid - 0.03, mid + 0.03, v, v + 0.06, riser, transom, PAINT, colour, skip=('back',))
            fbox(B, F, du0 + 0.06, du1 - 0.06, v + 0.01, v + 0.07, 0.05, 0.45, PAINT, colour, skip=('back',))
    # the fascia over the opening, and its gilt edge
    fz0, fz1 = o.z1 + 0.1, o.z1 + 0.62
    fbox(B, F, o.u0 - 0.12, o.u1 + 0.12, 0, 0.09, fz0, fz1, PAINT, colour, skip=('back',))
    if fine(lod):
        gold = lin('#b8913a')
        fbox(B, F, o.u0 - 0.06, o.u1 + 0.06, 0.09, 0.105, fz0 + 0.06, fz0 + 0.09, PAINT, gold, skip=('back',))
        fbox(B, F, o.u0 - 0.06, o.u1 + 0.06, 0.09, 0.105, fz1 - 0.09, fz1 - 0.06, PAINT, gold, skip=('back',))
    if o.cafe:
        awning(B, F, o, lod, look)


def awning(B, F, o, lod, look):
    """A café's striped canvas awning, sloping out over the pavement, a valance hanging off it."""
    a, b = look['awning']
    u0, u1 = o.u0 - 0.1, o.u1 + 0.1
    z_top, out, drop = o.z1 + 0.05, 1.7, 0.85
    strips = 12 if fine(lod) else 6 if lod == 'near' else 1
    for k in range(strips):
        ua = u0 + (u1 - u0) * k / strips
        ub = u0 + (u1 - u0) * (k + 1) / strips
        col = a if k % 2 == 0 or strips == 1 else b
        B.poly([F.p(ua, 0.02, z_top), F.p(ub, 0.02, z_top), F.p(ub, out, z_top - drop), F.p(ua, out, z_top - drop)], PAINT, F.dir(0, drop, out), col=col)
        B.poly([F.p(ua, out, z_top - drop), F.p(ub, out, z_top - drop), F.p(ub, out, z_top - drop - 0.25), F.p(ua, out, z_top - drop - 0.25)], PAINT, F.n3, col=col)
    for u in (u0, u1):
        side = -1 if u == u0 else 1
        B.poly([F.p(u, 0.02, z_top), F.p(u, out, z_top - drop), F.p(u, out, z_top - drop - 0.25)], PAINT, F.dir(side, 0, 0), col=a)


def porte(B, F, o, lod, look):
    """A porte-cochère: two tall leaves of painted wood, panelled, under a fanlight in the arch."""
    v = -o.depth + 0.05
    colour = look['door']
    spring = o.spring
    fbox(B, F, o.u0, o.u1, v - 0.05, v, 0, spring, PAINT, colour, skip=('back',))
    pane(B, F, Opening('fan', o.u0, o.u1, spring, o.z1, 0, spring=spring), v - 0.02, None)
    if lod != 'near':
        return
    uc = o.uc
    fbox(B, F, uc - 0.03, uc + 0.03, v, v + 0.04, 0, spring, PAINT, tuple(c * 0.7 for c in colour[:3]) + (1,), skip=('back',))
    fbox(B, F, o.u0, o.u1, v, v + 0.06, spring - 0.14, spring, PAINT, colour, skip=('back',))
    if not fine(lod):
        return
    for side in (0, 1):
        a = o.u0 + 0.12 if side == 0 else uc + 0.09
        b = uc - 0.09 if side == 0 else o.u1 - 0.12
        for za, zb in ((0.35, 1.25), (1.45, spring - 0.3)):
            fbox(B, F, a, b, v, v + 0.035, za, zb, PAINT, tuple(min(1, c * 1.15) for c in colour[:3]) + (1,), skip=('back',))
    # the fanlight's radiating bars
    r = (o.u1 - o.u0) / 2
    for k in range(1, 6):
        ang = math.pi * k / 6
        cu, cz = uc + math.cos(ang) * r, spring + math.sin(ang) * r
        a = F.p(uc, v + 0.01, spring)
        b = F.p(cu, v + 0.01, cz)
        d = F.dir(-math.sin(ang), 0, math.cos(ang))
        w = 0.025
        B.poly([(a[0] - d[0] * w, a[1] - d[1] * w, a[2] - d[2] * w), (b[0] - d[0] * w, b[1] - d[1] * w, b[2] - d[2] * w),
                (b[0] + d[0] * w, b[1] + d[1] * w, b[2] + d[2] * w), (a[0] + d[0] * w, a[1] + d[1] * w, a[2] + d[2] * w)], PAINT, F.n3, col=colour)


def arcade(B, F, o, lod, look):
    """An arched bay of the base glazed through both floors: a shop below, the entresol in the arch
    over a painted band at its floor."""
    v = -o.depth + 0.04
    colour = o.colour
    fbox(B, F, o.u0, o.u1, v - 0.04, v + 0.06, 0, SHOP_RISER, PAINT, colour, skip=('back',))
    pane(B, F, o, v, o.room, z0=SHOP_RISER, z1=SHOP_TOP)
    fbox(B, F, o.u0, o.u1, v, v + 0.08, SHOP_TOP, SHOP_TOP + 0.45, PAINT, colour, skip=('back',))
    upper = Opening('fan', o.u0, o.u1, SHOP_TOP + 0.45, o.z1, 0, spring=o.spring)
    pane(B, F, upper, v, o.upper)
    if lod == 'near':
        fbox(B, F, o.uc - 0.04, o.uc + 0.04, v, v + 0.07, 0.5, SHOP_TOP, PAINT, colour, skip=('back',))
        fbox(B, F, o.uc - 0.035, o.uc + 0.035, v, v + 0.06, SHOP_TOP + 0.45, o.spring + (o.u1 - o.u0) / 2 - 0.05, PAINT, look['frame'], skip=('back',))


def rear(B, F, floors, top, lod, look):
    """The courtyard side: plain stone, plain windows, a plain cornice; far off, plain stone."""
    ops = []
    nb = max(1, int(F.length / 3.2))
    bw = F.length / nb
    for lv in floors:
        for k in range(nb):
            uc = (k + 0.5) * bw
            ops.append(Opening('window', uc - 0.55, uc + 0.55, lv['z0'] + 0.5, lv['z0'] + 0.5 + min(1.9, lv['win'] - 0.4), 0.2))
    for k in range(nb):
        uc = (k + 0.5) * bw
        ops.append(Opening('window', uc - 0.55, uc + 0.55, 1.0, 3.2, 0.2))
    for o in ops:
        o.room = light(look, ('rear', round(o.u0, 2), round(o.z0, 2)), look['lit'] * 0.8)
    if fine(lod):
        wall(B, F, WALL_FOOT, top + 0.5, ops, col=shade(0.92))
        for o in ops:
            reveal(B, F, o)
            pane(B, F, o, -0.17, o.room)
    else:
        B.poly([F.p(0, 0, WALL_FOOT), F.p(F.length, 0, WALL_FOOT), F.p(F.length, 0, top + 0.5), F.p(0, 0, top + 0.5)], STONE, F.n3, col=shade(0.92))
        if shape(lod) == 'mid':
            for o in ops:
                pane(B, F, o, 0.02, o.room)
    fprism(B, F, 0, F.length, [(0, top + 0.2), (0.25, top + 0.3), (0.25, top + 0.5), (0, top + 0.5)], STONE, caps=False)


# --------------------------------------------------------------------------------------- mansard

MANSARD = [(0.0, 0.0), (0.42, 0.0), (1.5, 3.0), (3.0, 3.75)]  # (inset from the wall, rise over the cornice top)


def inset_polygon(poly, sloped, d):
    """A convex outline (counter-clockwise from above) with each sloped edge moved `d` in."""
    lines = []
    n = len(poly)
    for k in range(n):
        a, b = poly[k], poly[(k + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy)
        inward = (-dy / l, dx / l)
        off = d if sloped[k] else 0.0
        lines.append(((a[0] + inward[0] * off, a[1] + inward[1] * off), (dx / l, dy / l)))
    out = []
    for k in range(n):
        (p1, d1), (p2, d2) = lines[k - 1], lines[k]
        den = d1[0] * d2[1] - d1[1] * d2[0]
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
        out.append((p1[0] + d1[0] * t, p1[1] + d1[1] * t))
    return out


def mansard(B, poly, sloped, z0, lod):
    """The roof: from the cornice's top, a steep lower slope of zinc, a shallow upper one, a flat
    top; the party edges rise straight, the gables of the party walls. Returns the rings."""
    rings = [inset_polygon(poly, sloped, d) for d, _ in MANSARD]
    zs = [z0 + h for _, h in MANSARD]
    n = len(poly)
    for r in range(len(rings) - 1):
        for k in range(n):
            a0, b0 = rings[r][k], rings[r][(k + 1) % n]
            a1, b1 = rings[r + 1][k], rings[r + 1][(k + 1) % n]
            pts = [(a0[0], a0[1], zs[r]), (b0[0], b0[1], zs[r]), (b1[0], b1[1], zs[r + 1]), (a1[0], a1[1], zs[r + 1])]
            dx, dy = b0[0] - a0[0], b0[1] - a0[1]
            l = math.hypot(dx, dy)
            out = (dy / l, -dx / l, 0.0)
            if sloped[k]:
                mat = ZINC_M if r > 0 else ZINC_M
                want = (out[0], out[1], 0.6 if r < 2 else 2.5)
                B.poly(pts, mat, want)
            else:
                B.poly(pts, STONE, out, col=shade(0.9))
    top = rings[-1]
    B.poly([(p[0], p[1], zs[-1]) for p in top], ZINC_M, UP)
    if lod == 'near':
        # the zinc roll along the break between the slopes
        for k in range(n):
            if not sloped[k]:
                continue
            a, b = rings[2][k], rings[2][(k + 1) % n]
            F = Frame(a, b)
            fprism(B, F, 0, F.length, [(0, zs[2] - 0.08), (0.06, zs[2] - 0.04), (0.06, zs[2] + 0.04), (0, zs[2] + 0.08)], ZINC_M, caps=False)
    return rings, zs


def dormer_spots(spec):
    """Where a lot's street dormers stand: over every bay of each facade edge (but the cut of a
    corner lot with a dome), each with the key its lit window is rolled by."""
    path, bays, _ = fronts(spec)
    out = []
    for e, nb in enumerate(bays):
        length = math.dist(path[e], path[e + 1])
        for k in range(nb):
            if spec in CORNERS and spec['dome'] and nb == 1:
                continue
            out.append(dict(edge=e, uc=(k + 0.5) * length / nb, key=(e, k) if spec in CORNERS else ('front', k)))
    return out


def dormers(B, spec, top, lod, look):
    """The street dormers: whole near and mid, and far off each one quad of the lot's impostor."""
    path, _, _ = fronts(spec)
    lengths = [math.dist(path[e], path[e + 1]) for e in range(len(path) - 1)]
    total = sum(lengths)
    z0 = top + 0.8
    H = z0 + IMPOSTOR_ROOF
    for d in dormer_spots(spec):
        F = Frame(path[d['edge']], path[d['edge'] + 1])
        if lod != 'far':
            dormer(B, F, d['uc'], z0, lod, look, d['key'])
            continue
        along = sum(lengths[:d['edge']])
        G = Frame(F.p(0, -DORMER_FACE, 0)[:2], F.p(F.length, -DORMER_FACE, 0)[:2])
        a, b = d['uc'] - DORMER_W / 2, d['uc'] + DORMER_W / 2
        zt = z0 + DORMER_EAVE + DORMER_HEAD
        B.poly([G.p(a, 0, z0), G.p(b, 0, z0), G.p(b, 0, zt), G.p(a, 0, zt)], FACADE, G.n3,
               uv=[((along + a) / total, z0 / H), ((along + b) / total, z0 / H), ((along + b) / total, zt / H), ((along + a) / total, zt / H)])


def dormer(B, F, uc, z0, lod, look, key):
    """A dormer in the lower slope over a bay: a stone front with its window, a curved or pointed
    head, zinc cheeks back to the slope and a little roof."""
    w = DORMER_W
    u0, u1 = uc - w / 2, uc + w / 2
    v_face = DORMER_FACE    # the front, in from the cornice's top edge (MANSARD[1][0] is the slope's foot)
    zf, ze = z0, z0 + DORMER_EAVE  # its face from the gutter to the eave
    slope = (MANSARD[2][0] - MANSARD[1][0]) / (MANSARD[2][1] - MANSARD[1][1])

    def inset(z):
        return MANSARD[1][0] + (z - z0) * slope

    # the face in frame terms: v is out of the wall, so an inset is -v
    win = Opening('window', uc - 0.5, uc + 0.5, z0 + 0.35, z0 + 1.75, 0.15)
    room = light(look, ('dormer',) + key, look['lit'])
    G = Frame(F.p(0, -v_face, 0)[:2], F.p(F.length, -v_face, 0)[:2])
    if lod == 'near':
        pieces = [(u0, win.u0, zf, ze), (win.u1, u1, zf, ze), (win.u0, win.u1, zf, win.z0), (win.u0, win.u1, win.z1, ze)]
        for a, b, c, d in pieces:
            B.poly([G.p(a, 0, c), G.p(b, 0, c), G.p(b, 0, d), G.p(a, 0, d)], STONE, G.n3)
        reveal(B, G, win)
        pane(B, G, win, -win.depth + 0.03, room)
        casement(B, G, win, -win.depth + 0.05, look['frame'], transoms=1 if fine(lod) else 0)
        fbox(B, G, u0 - 0.06, u0 + 0.12, 0, 0.06, zf, ze, STONE, skip=('back',))
        fbox(B, G, u1 - 0.12, u1 + 0.06, 0, 0.06, zf, ze, STONE, skip=('back',))
    else:
        B.poly([G.p(u0, 0, zf), G.p(u1, 0, zf), G.p(u1, 0, ze), G.p(u0, 0, ze)], STONE, G.n3)
        pane(B, G, win, 0.02, room)
    # the cheeks: from the face back to where they meet the slope
    back = lambda z: inset(z) - v_face + 0.05
    for u, side in ((u0, -1), (u1, 1)):
        pts = [G.p(u, 0, zf), G.p(u, -max(back(zf), 0.05), zf), G.p(u, -back(ze), ze), G.p(u, 0, ze)]
        B.poly(pts, ZINC_M, G.dir(side, 0, 0))
    # the head: a curved pediment of stone, or a pointed zinc roof
    ridge = ze + DORMER_HEAD
    deep = back(ridge) + 0.1
    if look['dormer'] == 'round':
        pts = arc(uc, ze - 0.35, w / 2 + 0.08, 0.13, math.pi - 0.13, 8 if fine(lod) else 4)
        B.poly([G.p(u, 0.05, z) for u, z in [(u0 - 0.06, ze), (u1 + 0.06, ze)] + [(pts[k][0], max(pts[k][1], ze)) for k in range(len(pts))]], STONE, G.n3)
        for k in range(len(pts) - 1):
            (ua, za), (ub, zb) = pts[k], pts[k + 1]
            za, zb = max(za, ze), max(zb, ze)
            B.poly([G.p(ua, 0.05, za), G.p(ub, 0.05, zb), G.p(ub, -deep, zb), G.p(ua, -deep, za)], ZINC_M, G.dir((ua + ub) / 2 - uc, 0, 1))
    else:
        for (ua, za), (ub, zb), side in (((u0 - 0.1, ze), (uc, ridge), -1), ((uc, ridge), (u1 + 0.1, ze), 1)):
            B.poly([G.p(ua, 0.08, za), G.p(ub, 0.08, zb), G.p(ub, -deep, zb), G.p(ua, -deep, za)], ZINC_M, G.dir(side * 0.5, 0, 1))
        B.poly([G.p(u0 - 0.04, 0.02, ze), G.p(u1 + 0.04, 0.02, ze), G.p(uc, 0.02, ridge - 0.04)], STONE, G.n3)


def stack(B, x, y, along_y, length, z_base, z_top, lod, look):
    """A chimney stack on a party wall: a long thin mass of rendered masonry, a cap, and a row of
    terracotta pots."""
    rng = roll(look, 'stack', round(x, 2), round(y, 2))
    w = 0.62
    if along_y:
        x0, x1, y0, y1 = x - w / 2, x + w / 2, y - length / 2, y + length / 2
    else:
        x0, x1, y0, y1 = x - length / 2, x + length / 2, y - w / 2, y + w / 2
    F = Frame((x0, y0), (x1, y0))
    body = look['stack']
    fbox(B, F, 0, x1 - x0, -(y1 - y0), 0, z_base, z_top, PAINT, body, skip=('bottom',))
    if lod == 'far':
        return
    cap = tuple(c * 0.75 for c in body[:3]) + (1,)
    fbox(B, F, -0.06, x1 - x0 + 0.06, -(y1 - y0) - 0.06, 0.06, z_top, z_top + 0.14, PAINT, cap, skip=('bottom',))
    if not fine(lod):
        return
    pots = max(2, int(length / 0.34))
    pot = lin('#b05e3c')
    for k in range(pots):
        t = (k + 0.5) / pots
        cx = (x0 + x1) / 2 if along_y else x0 + (x1 - x0) * t
        cy = y0 + (y1 - y0) * t if along_y else (y0 + y1) / 2
        h = 0.38 + 0.25 * rng.random()
        r = 0.1 + 0.03 * rng.random()
        sides = 8
        z0, z1 = z_top + 0.14, z_top + 0.14 + h
        ring0 = [(cx + math.cos(2 * math.pi * s / sides) * r * 1.15, cy + math.sin(2 * math.pi * s / sides) * r * 1.15, z0) for s in range(sides)]
        ring1 = [(cx + math.cos(2 * math.pi * s / sides) * r, cy + math.sin(2 * math.pi * s / sides) * r, z1) for s in range(sides)]
        tone = tuple(c * (0.85 + 0.3 * rng.random()) for c in pot[:3]) + (1,)
        for s in range(sides):
            a, b = s, (s + 1) % sides
            mid = (math.cos(2 * math.pi * (s + 0.5) / sides), math.sin(2 * math.pi * (s + 0.5) / sides), 0)
            B.poly([ring0[a], ring0[b], ring1[b], ring1[a]], PAINT, mid, col=tone)
        B.poly(ring1, PAINT, UP, col=lin('#1c1410'))


def dome(B, cx, cy, z0, lod):
    """A corner's zinc dome: an octagonal drum with oval lights, an ogee dome, a lantern, a finial."""
    sides = 16 if lod != 'far' else 8
    r, drum = 2.2, 2.4
    ring = lambda rad, z: [(cx + math.cos(2 * math.pi * s / sides) * rad, cy + math.sin(2 * math.pi * s / sides) * rad, z) for s in range(sides)]
    rings = [ring(r, z0 - 0.5), ring(r, z0 + drum), ring(r + 0.18, z0 + drum), ring(r + 0.18, z0 + drum + 0.3)]
    prof = [(r, 0.3), (r * 0.97, 0.9), (r * 0.86, 1.6), (r * 0.66, 2.3), (r * 0.42, 2.85), (r * 0.25, 3.25), (r * 0.18, 3.6)]
    if lod == 'far':
        prof = prof[::2]
    for rad, h in prof:
        rings.append(ring(rad, z0 + drum + h))
    mats = [STONE, STONE, STONE] + [ZINC_M] * len(prof)
    for k in range(len(rings) - 1):
        for s in range(sides):
            a, b = s, (s + 1) % sides
            mid = math.cos(2 * math.pi * (s + 0.5) / sides), math.sin(2 * math.pi * (s + 0.5) / sides)
            dz = rings[k + 1][0][2] - rings[k][0][2]
            dr = math.hypot(rings[k + 1][0][0] - cx, rings[k + 1][0][1] - cy) - math.hypot(rings[k][0][0] - cx, rings[k][0][1] - cy)
            want = (mid[0] * dz, mid[1] * dz, -dr)
            B.poly([rings[k][a], rings[k][b], rings[k + 1][b], rings[k + 1][a]], mats[k], want, smooth=mats[k] == ZINC_M)
    if lod != 'far':
        for s in range(0, sides, 2):
            ang = 2 * math.pi * (s + 0.5) / sides
            F = Frame((cx + math.cos(ang) * (r + 0.01) - math.sin(ang) * 0.4, cy + math.sin(ang) * (r + 0.01) + math.cos(ang) * 0.4),
                      (cx + math.cos(ang) * (r + 0.01) + math.sin(ang) * 0.4, cy + math.sin(ang) * (r + 0.01) - math.cos(ang) * 0.4))
            o = Opening('oeil', 0, 0.8, z0 + 0.7, z0 + 1.9, 0)
            pane(B, F, o, 0.0, None)
    top = rings[-1]
    zt = top[0][2]
    lantern = [ring(0.32, zt), ring(0.32, zt + 0.9), ring(0.06, zt + 2.2)]
    for k in range(len(lantern) - 1):
        for s in range(sides):
            a, b = s, (s + 1) % sides
            mid = math.cos(2 * math.pi * (s + 0.5) / sides), math.sin(2 * math.pi * (s + 0.5) / sides)
            B.poly([lantern[k][a], lantern[k][b], lantern[k + 1][b], lantern[k + 1][a]], ZINC_M, (mid[0], mid[1], 0.3))
    B.poly(top, ZINC_M, UP)


# ------------------------------------------------------------------------------------------ lots

LOOKS = {
    'frames': [lin('#e6e1d4'), lin('#ddd6c6'), lin('#c9c5bb'), lin('#e9e6dd')],
    'doors': [lin('#1f3a2c'), lin('#4a1a1c'), lin('#1b2436'), lin('#2a2420'), lin('#173037')],
    'shops': [lin('#1d3a2b'), lin('#531b1b'), lin('#1b2740'), lin('#161616'), lin('#45192e'), lin('#2c3e3f'), lin('#5b4220')],
    'awnings': [(lin('#9e2b25'), lin('#e6dcc4')), (lin('#2f5a3a'), lin('#e6dcc4')), (lin('#1f2f52'), lin('#e6dcc4')), (lin('#6d1f2b'), lin('#6d1f2b'))],
    'stacks': [lin('#c7b59c'), lin('#b9a58a'), lin('#9b5f48'), lin('#cfc2ad')],
}

LOTS = [
    dict(name='lot3a', bays=3, ground='SDS', pediment='tri', extra=False, dormer='round', seed=3),
    dict(name='lot4a', bays=4, ground='SSDS', pediment='seg', extra=False, dormer='point', seed=4),
    dict(name='lot4b', bays=4, ground='AAAA', pediment='alt', extra=True, dormer='round', seed=14),
    dict(name='lot5a', bays=5, ground='SSDSS', pediment='tri', extra=False, dormer='point', seed=5),
    dict(name='lot5b', bays=5, ground='CCSDS', pediment='seg', extra=True, dormer='round', seed=15),
    dict(name='lot6a', bays=6, ground='SSSDSC', pediment='alt', extra=False, dormer='point', seed=6),
]
CORNERS = [
    dict(name='corner_a', ground=('SSC', 'C', 'CSS'), pediment='tri', extra=False, dormer='round', seed=21, dome=False),
    dict(name='corner_b', ground=('SDS', 'A', 'SSS'), pediment='seg', extra=True, dormer='point', seed=22, dome=True),
]


def look_of(spec):
    r = random.Random(spec['seed'] * 7919)
    return dict(
        seed=spec['seed'], lit=0.32, frame=r.choice(LOOKS['frames']), door=r.choice(LOOKS['doors']),
        shops=r.sample(LOOKS['shops'], 3), awning=r.choice(LOOKS['awnings']), stack=r.choice(LOOKS['stacks']),
        pediment=spec['pediment'], dormer=spec['dormer'],
    )


def fronts(spec):
    """A lot's street facade: its path, the bays of each edge, and each edge's ground floor."""
    if spec in CORNERS:
        S, c = CORNER, CUT
        return [(0.0, S), (0.0, c), (c, 0.0), (S, 0.0)], [3, 1, 3], list(spec['ground'])
    W = spec['bays'] * BAY
    return [(-W / 2, 0.0), (W / 2, 0.0)], [spec['bays']], [spec['ground']]


def build_lot(spec, lod):
    B = Build()
    look = look_of(spec)
    floors, top = floors_of(spec['extra'])
    W, D = spec['bays'] * BAY, DEPTH
    poly = [(-W / 2, 0.0), (W / 2, 0.0), (W / 2, D), (-W / 2, D)]
    sloped = [True, False, True, False]
    facade(B, *fronts(spec), floors, top, lod, look)
    rear(B, Frame(poly[2], poly[3]), floors, top, lod, look)
    # the party walls, up to the cornice's top; the mansard makes the gables over them
    for a, b in ((poly[1], poly[2]), (poly[3], poly[0])):
        F = Frame(a, b)
        B.poly([F.p(0, 0, WALL_FOOT), F.p(F.length, 0, WALL_FOOT), F.p(F.length, 0, top + 0.8), F.p(0, 0, top + 0.8)], STONE, F.n3, col=shade(0.9))
    rings, zs = mansard(B, poly, sloped, top + 0.8, lod)
    dormers(B, spec, top, lod, look)
    if fine(lod):
        back = Frame(poly[2], poly[3])
        for k in range(max(1, spec['bays'] - 1)):
            uc = (k + 0.5) * W / max(1, spec['bays'] - 1)
            dormer(B, back, uc, top + 0.8, 'mid', dict(look, dormer='point'), ('back', k))
    # stacks on the right-hand party wall, front and back
    zr = zs[-1]
    for y, length in ((2.6, 2.6), (D - 2.6, 2.6)):
        stack(B, W / 2, y, True, length, zs[1], zr + 1.3 + roll(look, 'height', y).random() * 0.6, lod, look)
    return B


def build_corner(spec, lod):
    B = Build()
    look = look_of(spec)
    floors, top = floors_of(spec['extra'])
    S, c = CORNER, CUT
    poly = [(0.0, c), (c, 0.0), (S, 0.0), (S, S), (0.0, S)]
    sloped = [True, True, False, False, True]
    # the facade runs from the side street's end, round the cut, to the front street's end
    path, bays, ground = fronts(spec)
    facade(B, path, bays, ground, floors, top, lod, look)
    for a, b in ((poly[2], poly[3]), (poly[3], poly[4])):
        F = Frame(a, b)
        B.poly([F.p(0, 0, WALL_FOOT), F.p(F.length, 0, WALL_FOOT), F.p(F.length, 0, top + 0.8), F.p(0, 0, top + 0.8)], STONE, F.n3, col=shade(0.9))
    rings, zs = mansard(B, poly, sloped, top + 0.8, lod)
    dormers(B, spec, top, lod, look)
    if spec['dome']:
        # over the cut, set back so the drum stands on the upper slope
        cx, cy = c / 2 + 2.2, c / 2 + 2.2
        dome(B, cx, cy, zs[2], lod)
    stack(B, S - 3.0, S, False, 2.6, zs[1], zs[-1] + 1.5, lod, look)
    stack(B, S, S - 3.0, True, 2.6, zs[1], zs[-1] + 1.4, lod, look)
    return B


# ------------------------------------------------------------------------------------------- run

bpy.ops.wm.read_factory_settings(use_empty=True)
mats = materials()
made = []
for row, spec in enumerate(LOTS + CORNERS):
    own = mats + [facade_material(spec, look_of(spec))]
    for col, lod in enumerate(LODS):
        B = build_corner(spec, lod) if spec in CORNERS else build_lot(spec, lod)
        name = f"{spec['name']}_{lod}"
        me = B.mesh(name, own, UV_OF, tone)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        # what the game stands it by, carried on the node (glTF extras): a lot's street front and
        # depth, a corner lot's square
        if spec in CORNERS:
            ob['corner'] = CORNER
        else:
            ob['width'] = spec['bays'] * BAY
            ob['depth'] = DEPTH
        # laid out in a grid so the file opens readable; the game reads each by its name
        ob.location = (col * 30.0, row * 30.0, 0.0)
        made.append((name, B.tris()))
for name, tris in made:
    print(f'{name}: {tris} triangles')

export(OUT)
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
