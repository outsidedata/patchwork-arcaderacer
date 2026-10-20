# truck.py: box3dvehicle's monster truck, the glb a vehicle's `look.model` names, built to the vehicle
# `<vehicle>` of `world.box3dvehicle.vehicles` in `<scene.json>`, modelled on the original Bigfoot: a
# 1970s square-body ("dentside") pickup lifted on a ladder frame over tyres that stand out past its
# sides. A game's bake runs it into a scratch file and packs it into the game (vehicles.bake.ts):
#
#   Blender -b --factory-startup --python plugins/box3dvehicle/truck/truck.py -- <scene.json> <vehicle> <out.glb>
#
# The numbers below are vehicles's truck's, as its scene gives them.
# The chassis's frame (kit.py): +x forward, +y up, +z right, metres; the body's box 5 × 1 × 2.4 centred
# on the origin, the ground at y −1.5 (each axle's hub at rest is its mount 0.3 less its spring's 1.2
# plus its sag 0.25, at −0.65, less the wheel's 0.85). The axles at x ±1.9, 3.6 apart, wheels 0.85
# round and 0.9 wide, so each tyre's inner face is at z ±1.35; the front is steered 0.45 rad, and a
# wheel is pushed up to 0.75 above rest. The cabin's hull is x −0.91 … 0.85 at its base (y 0.5) and
# 1.35 long at its roof (y 1.5).
#
# What the reference and those numbers make the truck:
#   - The body is 1.97 wide (z ±0.985) and shallow, as the reference's is: its rocker at y 0.15
#     (1.65 m off the ground, a hair under the tyres' tops at rest) and its belt at 0.88; the roof at
#     1.5. That width also keeps it clear of a front tyre at full lock and full bump, whose inner edge
#     comes in to z ±1.03; the rocker's chrome strip stops well short of the front arch for the same
#     tyre.
#   - Each side is three panels, the lower and upper flush and a band between them set 2 cm in: the
#     crease down the side of a dentside Ford. Round wheel arches, 0.58 round about each axle's x a
#     hair above its hub at rest, are cut through all three, with a dark tub behind each and a rubber
#     lip round it; in the bed the tubs stand up through the floor as wheel humps.
#   - Under the body the frame shows: two rails, crossmembers, the engine's sump, the transmission,
#     the transfer case and the fuel tank, none lower than y −0.45, within the viewer's tolerance of
#     the body's box (y −0.5) the truck collides with.
#   - The truck rides on solid axles, which box3dvehicle draws (`look.solid`: the housings and their
#     pumpkins, the four-links and track bars, four shocks a wheel, the steering, the bump stops and
#     straps, the driveshafts), so the model is the room they move in, every number of it read off
#     `look.solid`. Each axle has a tunnel across the body, its roof at the `ceiling` (0.33), from 0.45
#     in toward the middle to 0.36 out past the axle: at full bump the housing's top comes to 0.185
#     and the pumpkin's to 0.30, through where the rails, the engine bay's floor, the bed's underside
#     and the tubs' walls (which start at 0.21 over it) would be. The rails stop at each tunnel and are
#     boxed up into its roof; the engine bay stands on the front tunnel's roof; the sump sits behind
#     the front tunnel; the transmission ends at the sump, beside the front driveshaft; the transfer
#     case has its outputs where the driveshafts start. The links' chassis ends are clevises: the
#     lower links' under the rails, the upper links' on a bar out from the rails, the track bars' down
#     from the tunnels' roofs. A tab off each tub's wall holds each shock's top; the bed's liner stops
#     at the rear tubs, whose roofs are the wheel humps, hollow over the wells where the shocks' tops
#     are; each strap hangs from a tab `strap.drop` under the roof. The exhaust runs out past the
#     upper links' brackets.
#   - Two chrome stacks rise behind the cab, the truck's own (`STACKS`): each ends a centimetre short
#     of a 0.07 m pipe 0.3 m long whose top is at [−1.2, 1.8, ±0.6], pointing up, so a look that
#     gives the truck an exhaust puts its tailpipes there. The stacks and the roof's light bar stand at most 0.3 over the hull's roof.
#   - Every colour is the scene's `look.paint`; the paint is a metallic blue under clearcoat.
#
# No wheels (box3dvehicle draws them, with their axles). Nodes: `truck` (the body, the
# frame and everything fixed to them), `head.L/R` (the headlamps' lenses), `beam.L/R` (empties at the
# headlamps, +x along the beam, dipped `lights.beam.dip`), and the lamps the plugin lights by name:
# `tail.L/R` and `reverse.L/R` (in the bed's rear corner posts), `amber.L/R` (the parking lamps in
# the bumper, the side markers on the front fenders, the five cab-roof markers), and `steer` (the
# steering wheel's rim and spokes, at its hub, its +x down the column into the dash, +y up its face and
# +z right, which box3dvehicle turns about its x with the steering).

import sys, os, json, math
sys.dont_write_bytecode = True      # importing kit leaves no __pycache__ beside the model
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

SCENE_FILE, VEHICLE, OUT = sys.argv[sys.argv.index('--') + 1:][:3]
SCENE = json.load(open(SCENE_FILE))
V0 = SCENE['world']['box3dvehicle']['vehicles'][VEHICLE]
LOOK = V0['look']
P = LOOK['paint']

reset()
BLUE = mat('body', P['body'], rough=0.28, metal=0.45, coat=1.0, coat_rough=0.04)
BLACK = mat('trim', P['trim'], rough=0.55)
RUBBER = rubber('rubber', 0x151515)
FRAME = mat('frame', 0x1c1d1f, rough=0.5, metal=0.4)
STEEL = steel()
CHROME = steel('chrome', P['chrome'], 0.08)
GLASS = glass('glass', P['glass'], 0.38)
INSIDE = mat('inside', 0x26272a, rough=0.8)
SEAT = mat('seat', P['seat'], rough=0.6)
RED = paint('hook', P['hook'])
LENS = mat('lens', 0xeef2f6, rough=0.05, emit=0.25)
TAIL = lamp('tail', P['tail'], 0.4)
REV = lamp('reverse', P['light'], 0.2)
AMBER = lamp('amber', P['amber'], 0.4)

# ------------------------------------------------------------------------------------- the numbers
W = 0.985                                # the body's half width
ROCK, BELT, ROOF = 0.15, 0.88, 1.5       # the rocker's foot, the belt line, the roof's top
DENT = (0.52, 0.60)                      # the crease band, set 2 cm in
COWL, NOSE = 0.85, 2.5                   # the cowl and the grille's face
CABB, BX = -0.9, -0.72                   # the cab's back and its B pillar
BED0, BED1 = -2.5, -1.0                  # the tailgate's face and the bed's front wall
FLOOR = 0.39                             # the bed floor's top
SILL, TOP = W - 0.06, W - 0.13           # the greenhouse's half width at the belt and at the roof
A0, A1 = 0.80, 0.48                      # the windshield's foot and head along x
GH = ROOF - 0.06                         # the greenhouse's top, under the roof panel
AX = [a['at'] for a in V0['axles']]      # the axles along x, front first
ARCH = 0.58                              # the wheel arches' radius, about (axle, 0.0)
SOLID = LOOK['solid']                    # the solid axles box3dvehicle draws
CEIL = SOLID['ceiling']                  # the tunnels' roofs, where the bump stops and straps hang
TIN, TOUT = 0.45, 0.36                   # each tunnel's reach in toward the middle and out past its axle
TUN = [tuple(sorted((x + (-1 if x >= 0 else 1) * TIN, x - (-1 if x >= 0 else 1) * TOUT))) for x in AX]
WALL0 = 0.21                             # where the tubs' inner walls start, over the housing at full bump


def side_z(y):      # the greenhouse's side at height y, leaning in from the sill to the roof
    return SILL + (TOP - SILL) * (y - BELT) / (GH - BELT)


def arcpts(cx, cy, r, t0, t1, n=28):
    return [(cx + r * math.cos(t0 + (t1 - t0) * k / n), cy + r * math.sin(t0 + (t1 - t0) * k / n)) for k in range(n + 1)]


# The side outline [x0, x1] × [ya, yb] (x along, y up) with the arch about (cx, cy) of radius r cut
# out of it from below: one outline, or two where the arch rises through its top.
def cut(x0, x1, ya, yb, arch):
    if arch is None:
        return [[(x0, ya), (x1, ya), (x1, yb), (x0, yb)]]
    cx, cy, r = arch
    if ya >= cy + r or x1 <= cx - r or x0 >= cx + r:
        return [[(x0, ya), (x1, ya), (x1, yb), (x0, yb)]]
    da = math.sqrt(r * r - (ya - cy) ** 2)
    tl, tr = math.atan2(ya - cy, -da), math.atan2(ya - cy, da)
    if yb < cy + r:
        db = math.sqrt(r * r - (yb - cy) ** 2)
        tbl, tbr = math.atan2(yb - cy, -db), math.atan2(yb - cy, db)
        return [[(x0, ya)] + arcpts(cx, cy, r, tl, tbl) + [(x0, yb)],
                arcpts(cx, cy, r, tbr, tr) + [(x1, ya), (x1, yb)]]
    return [[(x0, ya)] + arcpts(cx, cy, r, tl, tr) + [(x1, ya), (x1, yb), (x0, yb)]]


# Where the arch meets the line y: its two x, or None.
def meets(arch, y):
    cx, cy, r = arch
    if abs(y - cy) >= r:
        return None
    d = math.sqrt(r * r - (y - cy) ** 2)
    return cx - d, cx + d


# The arch's opening above the line y, closed along it.
def opening(arch, y):
    cx, cy, r = arch
    d = math.sqrt(r * r - (y - cy) ** 2)
    return arcpts(cx, cy, r, math.atan2(y - cy, -d), math.atan2(y - cy, d))


# A run of body side from x0 to x1, both sides: the lower and upper panels flush at the skin, the
# crease band between them 2 cm in, the arch (if any) cut through all three.
def sides(t, x0, x1, arch=None):
    for ya, yb, inset in ((ROCK, DENT[0], 0.0), (DENT[0], DENT[1], 0.02), (DENT[1], BELT, 0.0)):
        for pts in cut(x0, x1, ya, yb, arch):
            for s in (-1, 1):
                za, zb = sorted((s * (W - 0.04 - inset), s * (W - inset)))
                slab(t, pts, 'side', za, zb, BLUE, 0.008)


# The tub behind an arch: its inner wall at `wall`, its roof following the arch out to the skin,
# and a rubber lip round the opening.
def tub(t, arch, wall):
    for s in (-1, 1):
        za, zb = sorted((s * (wall - 0.04), s * wall))
        slab(t, opening(arch, WALL0), 'side', za, zb, BLACK, 0.004)
        za, zb = sorted((s * wall, s * (W - 0.045)))
        slab(t, band(opening(arch, ROCK), 0.03), 'side', za, zb, BLACK, 0.004)
        lip = [(x, y, s * (W + 0.006)) for x, y in opening(arch, ROCK + 0.01)]
        tube(t, lip, 0.016, RUBBER, 8)


t = Part('truck')
FRONT, REAR = (AX[0], 0.0, ARCH), (AX[1], 0.0, ARCH)

# ------------------------------------------------------------------------------------- the frame
# Two boxed rails from bumper to bumper just under the body, broken at each axle by its tunnel: a
# roof at the solid axles' `ceiling`, `TIN` in toward the middle and `TOUT` out past the axle, the
# rails boxed up into it by a plate at each end, so the axle, its pumpkin and its links rise into it
# at full bump. Crossmembers, the engine's sump behind the front tunnel, the transmission, the
# transfer case with its outputs where the driveshafts start (`solid.axles[i].shaft`), and the fuel
# tank. Under the rails, the links' brackets where the scene puts the links' chassis ends.
for lo, hi in [(-2.62, TUN[1][0])] + [(TUN[1][1], TUN[0][0])] + [(TUN[0][1], 2.62)]:
    for s in (-1, 1):
        block(t, (lo, -0.1, s * 0.4), (hi, 0.12, s * 0.5), FRAME, 0.012)
for (lo, hi), wide in zip(TUN, (0.78, 0.62)):
    block(t, (lo, CEIL, -wide), (hi, CEIL + 0.015, wide), FRAME, 0.004)              # the tunnel's roof
    for e, d in ((lo, 1), (hi, -1)):
        for s in (-1, 1):
            # a hair wider and deeper than the rail, so no face of it lies on the rail's
            block(t, (e - 0.025 * d, -0.106, s * 0.394), (e + 0.005 * d, CEIL + 0.015, s * 0.506), FRAME, 0.006)
for x in (2.3, 0.9, -0.5, -2.3):
    block(t, (x - 0.06, -0.06, -0.4), (x + 0.06, 0.08, 0.4), FRAME, 0.01)
block(t, (1.0, -0.25, -0.2), (TUN[0][0] - 0.03, 0.149, 0.2), FRAME, 0.03)          # sump
block(t, (0.25, -0.2, -0.22), (1.0, 0.12, 0.22), FRAME, 0.03)                     # transmission
block(t, (-0.4, -0.45, -0.25), (0.25, -0.05, 0.2), FRAME, 0.03)                   # transfer case
cyl(t, 0.1, 0.4, (-0.08, -0.3, -0.25), (0, 0, 1), FRAME, 20, 0.01)                # its chain case
for a in SOLID['axles']:
    fx, fy, fz = a['shaft']
    if fx > 0:      # the front output, beside the transmission: a case out to the slip yoke
        block(t, (0.12, fy - 0.1, fz - 0.08), (fx, fy + 0.1, fz + 0.08), FRAME, 0.02)
    else:           # the rear output, out of the case's back
        # stopping a centimetre short of the slip yoke, which tilts as the axle moves
        cyl(t, 0.07, -0.41 - fx, ((-0.4 + fx + 0.01) / 2, fy, fz), (1, 0, 0), FRAME, 20, 0.008)
block(t, (-1.0, -0.2, -0.38), (-0.55, 0.11, -0.05), BLACK, 0.03)                  # fuel tank

# The links' chassis ends, each a clevis: two plates either side of the link's end with a bolt
# through them, the lower links' hanging from the rail, the upper links' from a bar out from the
# rail's outer face, the track bar's from the tunnel's roof.
LK = SOLID['links']
def clevis(at, axis, span, top, gap=0.05, plate=0.014):
    # plates square to `axis` (0 x, 2 z), `gap` either side of `at`, each `span` across and reaching
    # from 6 cm under the end up to `top`; a bolt along `axis` through them
    x, y, z = at
    for k in (-1, 1):
        lo, hi = [x - span / 2, y - 0.06, z - span / 2], [x + span / 2, top, z + span / 2]
        lo[axis], hi[axis] = at[axis] + k * gap - plate / 2, at[axis] + k * gap + plate / 2
        block(t, tuple(lo), tuple(hi), FRAME, 0.003)
    d = [0, 0, 0]
    d[axis] = 1
    cyl(t, 0.016, 2 * gap + 0.03, at, tuple(d), CHROME, 12, 0.003)
for ax in AX:
    tw = -1 if ax >= 0 else 1                                  # toward the car's middle
    for s in (-1, 1):
        f = LK['lower']['frame']
        clevis((ax + tw * f[0], f[1], s * f[2]), 2, 0.08, -0.1)
        f = LK['upper']['frame']
        za, zb = sorted((s * 0.495, s * (f[2] + 0.08)))
        block(t, (ax + tw * f[0] - 0.045, f[1] + 0.09, za), (ax + tw * f[0] + 0.045, f[1] + 0.13, zb), FRAME, 0.004)
        # its plates 6 cm either side, so the inner one stands clear of the rail's outer face
        clevis((ax + tw * f[0], f[1], s * f[2]), 2, 0.08, f[1] + 0.12, gap=0.06)
    f = LK['track']['frame']
    clevis((ax + tw * f[0], f[1], f[2]), 0, 0.08, CEIL)

# ------------------------------------------------------------------------- the body's sides, tubs
sides(t, COWL, NOSE, FRONT)              # the front fenders
sides(t, CABB, COWL)                     # the cab, its doors
sides(t, BED0 + 0.09, BED1, REAR)        # the bed
tub(t, FRONT, 0.8)
tub(t, REAR, 0.64)
for arch, wall in ((FRONT, 0.8), (REAR, 0.64)):
    x = arch[0]
    tw = -1 if x >= 0 else 1                                   # toward the car's middle
    for s in (-1, 1):
        # a tab off the tub's wall over each shock's top, which box3dvehicle hangs the shock's body from
        for sh in SOLID['shocks']:
            sx, (sy, sz) = x + tw * sh['along'], sh['top']
            block(t, (sx - 0.03, sy, s * (wall - 0.02)), (sx + 0.03, sy + 0.025, s * (sz + 0.03)), FRAME, 0.004)
        # where the limit strap hangs past the tunnel's roof, a tab off the wall at the roof's height
        st = SOLID['strap']
        sx = x + tw * st['along']
        if st['across'] > (0.78 if arch is FRONT else 0.62):
            block(t, (sx - 0.04, CEIL, s * (wall - 0.02)), (sx + 0.04, CEIL + 0.015, s * (st['across'] + 0.04)), FRAME, 0.003)
        # and the strap's own tab, `drop` down from the roof, the strap's top on its foot
        block(t, (sx - 0.02, CEIL - st['drop'], s * (st['across'] - 0.035)), (sx + 0.02, CEIL + 0.005, s * (st['across'] + 0.035)), FRAME, 0.003)
# the chrome strip along the rocker, broken at the arches
for x0, x1, arch in ((COWL, NOSE - 0.04, FRONT), (CABB, COWL, None), (BED0 + 0.1, BED1, REAR)):
    runs = [(x0, x1)]
    if arch:
        m = meets(arch, 0.2)
        runs = [(x0, m[0] - 0.12), (m[1] + 0.03, x1)]
    for a, b in runs:
        if b - a > 0.05:
            for s in (-1, 1):
                box(t, (b - a, 0.03, 0.014), ((a + b) / 2, 0.2, s * (W + 0.009)), CHROME, 0.004)

# ---------------------------------------------------------------------------------- the front clip
# The hood, crowned and rounding into the grille, over the fenders; the engine bay closed behind the
# grille; the cowl's vent; two chrome air cleaners up through the hood.
rings = []
for x in (COWL + 0.005, 1.3, 1.8, 2.2, 2.4, 2.46, NOSE - 0.005):
    nose = max(0.0, (x - 2.38) / 0.12)
    pts = []
    for k in range(17):
        z = -(W - 0.02) + 2 * (W - 0.02) * k / 16
        pts.append((z, 0.905 + 0.025 * (1 - (z / W) ** 2) - 0.03 * nose ** 2))
    pts += [(W - 0.02, 0.62), (-(W - 0.02), 0.62)]
    rings.append([(x, y, z) for z, y in pts])
loft(t, rings, BLUE, sharp=0.9)
# the engine bay, over the front tunnel from its roof up
block(t, (1.0, ROCK + 0.005, -0.76), (TUN[0][0], 0.62, 0.76), BLACK, 0.02)
block(t, (TUN[0][0], CEIL + 0.015, -0.76), (TUN[0][1], 0.62, 0.76), BLACK, 0.02)
block(t, (TUN[0][1], ROCK + 0.005, -0.76), (2.44, 0.62, 0.76), BLACK, 0.02)
block(t, (COWL - 0.1, BELT - 0.01, -W + 0.06), (COWL - 0.005, BELT + 0.02, W - 0.06), BLACK, 0.008)
for k in range(13):
    box(t, (0.05, 0.008, 0.08), (COWL - 0.05, BELT + 0.024, -0.84 + k * 0.14), FRAME, 0.002)
for z in (-0.26, 0.26):
    cyl(t, 0.12, 0.04, (1.62, 0.95, z), (0, 1, 0), BLACK, 28, 0.008)              # the scoop's base
    cyl(t, 0.14, 0.05, (1.62, 0.985, z), (0, 1, 0), CHROME, 32, 0.012)
    cyl(t, 0.128, 0.06, (1.62, 1.04, z), (0, 1, 0), BLACK, 32, 0.004)             # the filter
    cyl(t, 0.142, 0.03, (1.62, 1.085, z), (0, 1, 0), CHROME, 32, 0.01)            # its lid
    cyl(t, 0.02, 0.02, (1.62, 1.105, z), (0, 1, 0), CHROME, 12)                   # wing nut
for s in (-1, 1):
    # the fenders' tops run flat to the nose, a hair over the belt where the hood meets them
    box(t, (NOSE - COWL - 0.06, 0.012, 0.02), ((NOSE + COWL) / 2, 0.905, s * (W - 0.01)), BLACK, 0.003)

# ------------------------------------------------------------------------------ the grille, lamps
gx = NOSE
slab(t, rrect(2 * W - 0.04, 0.52, 0.04, 3, 0, 0.6), 'front', gx - 0.01, gx + 0.03, CHROME, 0.01)
slab(t, rrect(1.0, 0.38, 0.02, 3, 0, 0.6), 'front', gx + 0.02, gx + 0.036, BLACK, 0.004)
for y in (0.49, 0.6, 0.71):                                  # the egg-crate's bars
    box(t, (0.02, 0.022, 1.0), (gx + 0.045, y, 0), CHROME, 0.005)
for z in (-0.33, -0.17, 0.0, 0.17, 0.33):                    # set 5 mm back, so no face lies on a bar's
    box(t, (0.02, 0.38, 0.022), (gx + 0.04, 0.6, z), CHROME, 0.005)
for s in (-1, 1):
    # the headlamp's square bezel and its reflector ring
    slab(t, rrect(0.3, 0.3, 0.03, 3, s * 0.73, 0.6), 'front', gx + 0.02, gx + 0.04, BLACK, 0.006)
    cyl(t, 0.125, 0.03, (gx + 0.04, 0.6, s * 0.73), (1, 0, 0), CHROME, 28, 0.006)
# the stone guard under the grille, the bumper, its winch and tow hooks, the frame's horns
slab(t, rrect(2 * W - 0.12, 0.2, 0.03, 3, 0, 0.25), 'front', gx - 0.04, gx, BLUE, 0.01)
slab(t, rrect(1.9, 0.24, 0.05, 4, 0, 0.24), 'front', gx, gx + 0.16, CHROME, 0.025)
block(t, (gx + 0.16, 0.16, -0.24), (gx + 0.2, 0.32, 0.24), FRAME, 0.01)           # winch plate
cyl(t, 0.075, 0.36, (gx + 0.25, 0.24, 0), (0, 0, 1), BLACK, 24, 0.008)            # its drum
for z in (-0.2, 0.2):
    cyl(t, 0.09, 0.03, (gx + 0.25, 0.24, z), (0, 0, 1), FRAME, 24, 0.006)
block(t, (gx + 0.2, 0.155, -0.24), (gx + 0.34, 0.175, 0.24), FRAME, 0.006)
for s in (-1, 1):
    tube(t, [(gx + 0.15, 0.14, s * 0.6), (gx + 0.24, 0.14, s * 0.6), (gx + 0.28, 0.1, s * 0.6),
             (gx + 0.28, 0.04, s * 0.6), (gx + 0.24, 0.0, s * 0.6), (gx + 0.17, 0.0, s * 0.6)], 0.022, RED, 10)
    block(t, (gx + 0.13, 0.13, s * 0.6 - 0.03), (gx + 0.17, 0.17, s * 0.6 + 0.03), FRAME, 0.004)

# ------------------------------------------------------------------------------ the cab's lower body
# Its back wall, firewall, floor pan and floor, so it is open above the floor and what is in it shows
# through the glass; the doors' seams and handles; the mirrors; a step under each door.
# (each ends 1 cm inside the side panels and 5 mm short of their faces, so no face lies on theirs)
block(t, (CABB + 0.005, ROCK + 0.005, -W + 0.03), (COWL - 0.005, ROCK + 0.07, W - 0.03), BLUE, 0.01)
block(t, (CABB + 0.04, 0.2, -W + 0.05), (COWL - 0.06, 0.24, W - 0.05), INSIDE, 0.005)
block(t, (CABB + 0.005, ROCK + 0.07, -W + 0.03), (CABB + 0.045, BELT - 0.005, W - 0.03), BLUE, 0.01)
block(t, (COWL - 0.045, 0.24, -W + 0.05), (COWL - 0.005, BELT, W - 0.05), INSIDE, 0.005)
block(t, (0.5, 0.68, -W + 0.05), (COWL - 0.055, BELT + 0.05, W - 0.05), INSIDE, 0.03)      # dash
for s in (-1, 1):
    o = s * W                     # 12 mm thick about the skin, so neither face lies on it
    box(t, (0.012, BELT - ROCK - 0.06, 0.012), (COWL - 0.06, (BELT + ROCK) / 2 + 0.03, o), BLACK, 0.002)
    box(t, (0.012, BELT - ROCK - 0.06, 0.012), (BX + 0.01, (BELT + ROCK) / 2 + 0.03, o), BLACK, 0.002)
    box(t, (COWL - 0.06 - BX - 0.01, 0.012, 0.012), ((COWL - 0.06 + BX + 0.01) / 2, ROCK + 0.06, o), BLACK, 0.002)
    box(t, (0.16, 0.035, 0.03), (BX + 0.16, 0.76, s * (W + 0.012)), CHROME, 0.008)
    # the west-coast mirror on two arms off the door's front
    for y in (0.9, 1.12):
        tube(t, [(0.7, y, s * (W + 0.01)), (0.68, y, s * 1.2)], 0.012, CHROME, 8)
    box(t, (0.06, 0.36, 0.16), (0.66, 1.01, s * 1.26), BLACK, 0.015)
    box(t, (0.005, 0.32, 0.13), (0.627, 1.01, s * 1.26), CHROME, 0.002)
    # a step under the door, on hangers to the frame rail
    tube(t, [(-0.55, -0.12, s * 0.98), (0.45, -0.12, s * 0.98)], 0.035, CHROME, 14)
    for x in (-0.4, 0.3):
        tube(t, [(x, -0.12, s * 0.98), (x, 0.0, s * 0.5)], 0.022, FRAME, 10)

# -------------------------------------------------------------------------------- the greenhouse
# Pillars, a roof with drip rails, the back wall round its window, the glass; inside, a bench seat,
# the steering wheel on its column, the gauges, a roll cage.
for s in (-1, 1):
    rod(t, (A0, BELT, s * side_z(BELT)), (A1, GH, s * side_z(GH)), 0.04, BLUE, 12)                 # A
    rod(t, (BX, BELT, s * side_z(BELT)), (BX + 0.01, GH, s * side_z(GH)), 0.035, BLUE, 12)          # B
    # the sail panel from the B pillar back, 4 cm thick inward of the greenhouse's side on both sides
    # (kit's quad thickens away from (b − a) × (d − a), so the left is wound the other way)
    sail = [(CABB, BELT, s * side_z(BELT)), (BX - 0.02, BELT, s * side_z(BELT)), (BX - 0.01, GH, s * side_z(GH)), (CABB, GH, s * side_z(GH))]
    quad(t, *(sail if s > 0 else [sail[0], sail[3], sail[2], sail[1]]), 0.04, BLUE)
    quad(t, (A0 - 0.05, BELT + 0.02, s * (side_z(BELT) - 0.01)), (BX + 0.04, BELT + 0.02, s * (side_z(BELT) - 0.01)),
         (BX + 0.05, GH - 0.02, s * (side_z(GH) - 0.01)), (A1 - 0.05, GH - 0.02, s * (side_z(GH) - 0.01)), 0.008, GLASS)
    box(t, (A0 - BX, 0.03, 0.05), ((A0 + BX) / 2, BELT + 0.012, s * (side_z(BELT) - 0.005)), BLACK, 0.006)
slab(t, rrect(A1 - CABB + 0.06, 2 * TOP + 0.06, 0.06, 4, (A1 + CABB) / 2, 0), 'top', GH - 0.01, ROOF, BLUE, 0.025)
for s in (-1, 1):
    box(t, (A1 - CABB - 0.04, 0.014, 0.014), ((A1 + CABB) / 2, GH + 0.005, s * (TOP + 0.035)), CHROME, 0.004)
box(t, (0.06, 0.05, 2 * TOP), (A1 + 0.01, GH - 0.02, 0), BLUE, 0.015)
quad(t, (A0 - 0.01, BELT + 0.02, -side_z(BELT) + 0.04), (A0 - 0.01, BELT + 0.02, side_z(BELT) - 0.04),
     (A1 - 0.01, GH - 0.04, side_z(GH) - 0.04), (A1 - 0.01, GH - 0.04, -side_z(GH) + 0.04), 0.01, GLASS)
for z in (-0.5, 0.08):                                       # the wipers parked at the windshield's foot
    box(t, (0.02, 0.012, 0.46), (A0 + 0.005, BELT + 0.05, z), BLACK, 0.003)
wz, wy0, wy1 = 0.6, 0.98, 1.32
bz = lambda y: side_z(y) - 0.01
wx0, wx1 = CABB + 0.005, CABB + 0.045
slab(t, [(-SILL + 0.01, BELT), (SILL - 0.01, BELT), (bz(wy0), wy0), (-bz(wy0), wy0)], 'front', wx0, wx1, BLUE, 0.006)
slab(t, [(-bz(wy1), wy1), (bz(wy1), wy1), (bz(GH), GH), (-bz(GH), GH)], 'front', wx0, wx1, BLUE, 0.006)
for s in (-1, 1):
    slab(t, [(s * wz, wy0), (s * bz(wy0), wy0), (s * bz(wy1), wy1), (s * wz, wy1)], 'front', wx0, wx1, BLUE, 0.006)
quad(t, (CABB + 0.025, wy0, -wz), (CABB + 0.025, wy0, wz), (CABB + 0.025, wy1, wz), (CABB + 0.025, wy1, -wz), 0.008, GLASS)
block(t, (-0.82, 0.24, -W + 0.08), (-0.38, 0.5, W - 0.08), SEAT, 0.05)            # the bench seat
box(t, (0.12, 0.62, 2 * W - 0.16), (-0.8, 0.82, 0), SEAT, 0.05, rot=euler(0, 0, 0.12))
hub = Vector((0.3, 1.02, -0.45))
col = Vector((-math.cos(0.9), math.sin(0.9), 0.0))       # the wheel's face looks back and up at the driver
rod(t, hub.to_tuple(), (hub + Vector((math.cos(0.9), -math.sin(0.9), 0)) * 0.36).to_tuple(), 0.03, INSIDE, 10)
e1 = col.cross(Vector((0, 0, 1))).normalized()
e2 = col.cross(e1).normalized()
# The wheel (its rim and spokes; the column is the truck's) is its own node, `steer`, at the hub, turned
# as the chassis pitched 0.9 down its column: +x down the column into the dash, +y up the wheel's face
# (e1), +z right (−e2), so box3dvehicle turns it about its x.
sp = Part('steer', hub, Matrix.Rotation(-0.9, 3, 'Z'))
tube(sp, [(hub + 0.19 * (math.cos(2 * math.pi * k / 24) * e1 + math.sin(2 * math.pi * k / 24) * e2)).to_tuple() for k in range(24)], 0.018, BLACK, 8, closed=True)
for a in (0.0, math.pi):
    rod(sp, hub.to_tuple(), (hub + 0.18 * (math.cos(a) * e1 + math.sin(a) * e2)).to_tuple(), 0.012, BLACK, 6)
for z in (-0.6, -0.3):                                       # each a dial in a chrome ring
    cyl(t, 0.06, 0.02, (0.49, 0.8, z), (1, 0, 0), BLACK, 20)
    tube(t, [(0.478, 0.8 + 0.064 * math.sin(2 * math.pi * k / 20), z + 0.064 * math.cos(2 * math.pi * k / 20)) for k in range(20)], 0.007, CHROME, 6, closed=True)
for s in (-1, 1):                                            # the roll cage's hoop behind the seat
    tube(t, [(-0.85, 0.24, s * 0.8), (-0.85, 1.36, s * 0.8)], 0.025, BLACK, 10)
tube(t, [(-0.85, 1.36, -0.8), (-0.85, 1.36, 0.8)], 0.025, BLACK, 10)

# ------------------------------------------------------------------------------------------ the bed
# Corner posts, the front wall between the sides, a liner floor with the tubs standing up through it
# as wheel humps, the tailgate and a body-colour panel under it, rail caps; the rear bumper.
for s in (-1, 1):
    za, zb = sorted((s * (W - 0.17), s * W))
    block(t, (BED0, ROCK, za), (BED0 + 0.09, BELT, zb), BLUE, 0.02)                     # corner post
    za, zb = sorted((s * (W - 0.08), s * (W + 0.006)))
    block(t, (BED0 + 0.02, BELT, za), (BED1 - 0.01, BELT + 0.025, zb), BLACK, 0.008)   # rail cap
block(t, (BED1 - 0.065, ROCK + 0.005, -W + 0.03), (BED1 - 0.005, BELT - 0.005, W - 0.03), BLUE, 0.02)   # front wall
# the liner, between the tubs where the wheel wells rise through it: the tubs' roofs are the wheel
# humps, hollow over the wells, where the shocks' tops are
a0, a1 = meets(REAR, FLOOR - 0.04)
for lo, hi, wide in ((BED0 + 0.05, a0, W - 0.05), (a0, a1, 0.62), (a1, BED1 - 0.06, W - 0.05)):
    block(t, (lo, FLOOR - 0.04, -wide), (hi, FLOOR, wide), BLACK, 0.006)
for k in range(7):
    box(t, (BED1 - BED0 - 0.2, 0.02, 0.05), ((BED0 + BED1) / 2, FLOOR + 0.008, -0.6 + k * 0.2), BLACK, 0.006)
for lo, hi in ((BED0 + 0.06, TUN[1][0]), (TUN[1][1], BED1 - 0.07)):                         # under the floor,
    block(t, (lo, ROCK + 0.01, -0.6), (hi, FLOOR - 0.04, 0.6), BLUE, 0.02)                    # either side of the tunnel
block(t, (BED0, FLOOR - 0.01, -W + 0.17), (BED0 + 0.05, BELT - 0.005, W - 0.17), BLUE, 0.02)  # tailgate
box(t, (0.02, 0.06, 0.28), (BED0 - 0.005, BELT - 0.1, 0), BLACK, 0.008)
box(t, (0.006, 0.03, 0.24), (BED0 - 0.019, BELT - 0.1, 0), CHROME, 0.003)
block(t, (BED0 + 0.005, ROCK + 0.01, -W + 0.17), (BED0 + 0.05, FLOOR - 0.01, W - 0.17), BLUE, 0.02)
slab(t, rrect(2 * W - 0.04, 0.2, 0.05, 4, 0, 0.23), 'front', BED0 - 0.17, BED0 - 0.01, CHROME, 0.025)
box(t, (0.12, 0.02, 0.5), (BED0 - 0.09, 0.335, 0), BLACK, 0.006)                      # step pad
for s in (-1, 1):
    za, zb = sorted((s * (W - 0.165), s * (W - 0.015)))
    block(t, (BED0 - 0.012, 0.35, za), (BED0 + 0.01, 0.83, zb), CHROME, 0.006)          # lamp housing

# ------------------------------------------------------------------------------ the exhaust stacks
# From the engine back under the body either side, up through the bed's front into two chrome stacks
# behind the cab, clamped to the wall; each stops a centimetre short of its pipe in the look.
STACKS = [{'at': [-1.2, 1.8, s * 0.6], 'dir': [0, 1, 0], 'pipe': 0.07} for s in (-1, 1)]
for ex in STACKS:
    ed = Vector(ex['dir']).normalized()
    start = Vector(ex['at']) - 0.3 * ed
    sx, sz, r = ex['at'][0], ex['at'][2], ex['pipe']
    s = 1 if sz > 0 else -1
    # out of the engine bay's floor beside the engine, clear of the upper links under it
    # out past the upper links' brackets and over the steps' hangers, in to the stack behind the cab
    tube(t, [(1.2, 0.25, s * 0.68), (1.05, 0.08, s * 0.75), (sx + 0.15, 0.08, s * 0.75), (sx, 0.15, sz), (sx, 0.3, sz)], 0.05, STEEL, 14)
    top = (start - 0.01 * ed).y
    cyl(t, r, top - 0.3, (sx, (0.3 + top) / 2, sz), (0, 1, 0), CHROME, 24)
    sz = abs(sz)
    for y in (0.75, 1.25):                                    # its clamps to the bed's front wall
        block(t, (sx, y - 0.018, s * sz - 0.02), (BED1 - 0.06, y + 0.018, s * sz + 0.02), FRAME, 0.005)
        cyl(t, r + 0.012, 0.05, (sx, y, s * sz), (0, 1, 0), FRAME, 24, 0.004)

# ------------------------------------------------------------------------------------ the light bar
# A bar across the cab's roof on two feet, five round lamp pods on it facing forward.
by = ROOF + 0.045
for s in (-1, 1):
    block(t, (0.1, ROOF - 0.01, s * 0.82 - 0.03), (0.22, by, s * 0.82 + 0.03), FRAME, 0.006)
cyl(t, 0.025, 1.76, (0.16, by, 0), (0, 0, 1), FRAME, 12, 0.004)
for z in (-0.68, -0.34, 0.0, 0.34, 0.68):
    cyl(t, 0.075, 0.1, (0.2, by + 0.03, z), (1, 0, 0), BLACK, 24, 0.01)
    cyl(t, 0.064, 0.01, (0.252, by + 0.03, z), (1, 0, 0), LENS, 24)
    box(t, (0.03, 0.03, 0.02), (0.16, by + 0.01, z), FRAME, 0.004)

# -------------------------------------------------------------------------------------- the lamps
for s, side in ((-1, 'L'), (1, 'R')):
    hp = Part('head.' + side)
    sphere(hp, 0.115, (gx + 0.05, 0.6, s * 0.73), LENS, 24, 8, (0.25, 1, 1))
    za, zb = sorted((s * (W - 0.15), s * (W - 0.03)))
    tp = Part('tail.' + side)
    block(tp, (BED0 - 0.022, 0.47, za), (BED0 - 0.008, 0.81, zb), TAIL, 0.006)
    rp = Part('reverse.' + side)
    block(rp, (BED0 - 0.022, 0.37, za), (BED0 - 0.008, 0.44, zb), REV, 0.006)
    ap = Part('amber.' + side)
    za, zb = sorted((s * 0.62, s * 0.86))
    block(ap, (gx + 0.155, 0.2, za), (gx + 0.17, 0.28, zb), AMBER, 0.006)            # parking lamp
    za, zb = sorted((s * W - 0.004 * s, s * (W + 0.012)))
    block(ap, (2.3, 0.7, za), (2.42, 0.76, zb), AMBER, 0.004)                         # side marker
    if s < 0:
        for z in (-0.4, -0.2, 0.0, 0.2, 0.4):                                         # roof markers
            sphere(ap, 0.035, (A1 + 0.02, ROOF + 0.005, z), AMBER, 12, 6, (1.4, 0.7, 1))

objs = build()
dip = LOOK['lights']['beam']['dip']
for s, side in ((-1, 'L'), (1, 'R')):
    node('beam.' + side, (gx + 0.08, 0.6, s * 0.73), dip=dip)
export(OUT)
