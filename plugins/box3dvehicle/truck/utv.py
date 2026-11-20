# utv.py: box3dvehicle's UTV, a long-travel sport side-by-side, the glb a vehicle's `look.model` names,
# built to the vehicle `<vehicle>` of `world.box3dvehicle.vehicles` in `<scene.json>`. A game's bake
# runs it into a scratch file and packs it into the game (vehicles.bake.ts):
#
#   Blender -b --factory-startup --python plugins/box3dvehicle/truck/utv.py -- <scene.json> <vehicle> <out.glb>
#
# The chassis's frame (kit.py): +x forward, +y up, +z right, metres. The UTV rides on independent
# suspension, which box3dvehicle draws (`look.independent`: the wishbones, knuckles, trailing arms,
# radius rods, coilovers, anti-roll bars, the rack and tie rods, the half-shafts, hubs and brakes), so
# the model is the frame they hang from and the body round the room they move in, every mount read
# off `look.independent`: a clevis either side of every pivot's bush, a clevis round every coilover's
# top eye and every radius rod's frame end, a ring round the anti-roll bars and the rack, and the
# differential's and transaxle's outputs where the half-shafts start.

import sys, os, json, math
sys.dont_write_bytecode = True      # importing kit leaves no __pycache__ beside the model
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

SCENE_FILE, VEHICLE, OUT = sys.argv[sys.argv.index('--') + 1:][:3]
SCENE = json.load(open(SCENE_FILE))
V0 = SCENE['world']['box3dvehicle']['vehicles'][VEHICLE]
LOOK = V0['look']
P = LOOK['paint']
IND = LOOK['independent']
AXLES = V0['axles']
BODY = V0['body']

reset()
FRAME = mat('frame', P['cabin'], rough=0.45, metal=0.5)
STEEL = steel()
ALLOY = steel('alloy', 0x9a9da0, 0.35)
CASE = mat('case', 0x3a3c3e, rough=0.5, metal=0.6)
RUBBER = rubber('rubber', 0x151515)
SAGE = mat('body', P['body'], rough=0.45, metal=0.1, coat=0.6, coat_rough=0.2)
BLACK = mat('trim', P['trim'], rough=0.7)
GRAPHITE = mat('graphite', 0x3b3f42, rough=0.5, metal=0.2, coat=0.5)
ACCENT = mat('accent', P['hook'], rough=0.35, metal=0.3, coat=0.8)
SEAT = mat('seat', P['seat'], rough=0.65)
GRILLE = mat('grille', 0x101112, rough=0.6, metal=0.3)
LENS = mat('lens', 0xeef2f6, rough=0.05, emit=0.3)
TAIL = lamp('tail', P['tail'], 0.4)
REV = lamp('reverse', P['light'], 0.2)
AMBER = lamp('amber', P['amber'], 0.4)

# ------------------------------------------------------------------------------------- the numbers
GROUND = AXLES[0]['mount'] - AXLES[0]['spring']['length'] + AXLES[0]['spring']['sag'] - AXLES[0]['wheel']['radius']
FLOOR = -BODY['height'] / 2                  # the body box's underside, where the skid plates are
FRONT, REAR = (0, 1) if AXLES[0]['at'] > AXLES[1]['at'] else (1, 0)
W = IND['axles'][FRONT]['wishbones']
T = IND['axles'][REAR]['trailing']
RT = 0.019                                   # the frame's tubes' radius
PLATE = 0.006                                # a clevis plate's thickness


# Axle `i`'s point `p` [along, y, across] (`look.independent`) on side `side`, in the chassis's frame.
def at(i, side, p):
    a = AXLES[i]['at']
    t = -1 if a >= 0 else 1
    return (a + t * p[0], p[1], side * p[2])


# A clevis round the pivot `c`: two plates square to the axis `axis` (0 x, 2 z), `gap` either side of
# `c`, each reaching `reach` out from `c` across the axis' two others ([lo, hi] each, off `c`), and a
# bolt head on each plate's outside.
def clevis(part, c, axis, gap, reach):
    others = [k for k in range(3) if k != axis]
    for s in (-1, 1):
        lo, hi = [0, 0, 0], [0, 0, 0]
        lo[axis], hi[axis] = c[axis] + s * gap, c[axis] + s * (gap + PLATE)
        for k, (a, b) in zip(others, reach):
            lo[k], hi[k] = c[k] + a, c[k] + b
        block(part, tuple(lo), tuple(hi), FRAME, 0.002)
        d = [0, 0, 0]
        d[axis] = 1
        head = list(c)
        head[axis] = c[axis] + s * (gap + PLATE + 0.004)
        cyl(part, 0.012, 0.008, tuple(head), tuple(d), STEEL, 6)


# A ring `clear` metres round a bar `r` round along the axis `axis` at `c`, `thick` thick: a clamp,
# with the bar free inside it.
def ring(part, c, axis, r, clear=0.004, thick=0.006):
    R = r + clear + thick
    pts = []
    for k in range(20):
        a = 2 * math.pi * k / 20
        p = list(c)
        o = [k2 for k2 in range(3) if k2 != axis]
        p[o[0]] += R * math.cos(a)
        p[o[1]] += R * math.sin(a)
        pts.append(tuple(p))
    tube(part, pts, thick, FRAME, 8, closed=True)


f = Part('frame')

# ------------------------------------------------------------------------------------- the front
# Lower rails under the lower wishbones' pivots, upper rails under the upper's, posts between them,
# a crossmember at each end; each pivot's bush in a clevis off its rail, the plates square to the
# pivot's axis (along x), clear of the bush's ends.
FX = AXLES[FRONT]['at']
fl = [at(FRONT, 1, p) for p in W['lower']['pivots']]
fu = [at(FRONT, 1, p) for p in W['upper']['pivots']]
LZ, UZ = fl[0][2] - 0.06, fu[0][2] - 0.08            # the rails' half widths, in from the pivots
LY, UY = fl[0][1], fu[0][1] + 0.04
NOSE, COWL = FX + 0.45, FX - 0.42                     # the frame's front and where the front clip ends
for s in (-1, 1):
    tube(f, [(NOSE, LY, s * LZ), (COWL, LY, s * LZ)], RT, FRAME, 12)
    tube(f, [(NOSE, UY, s * UZ), (COWL, UY, s * UZ)], RT, FRAME, 12)
    for x in (NOSE, COWL):
        tube(f, [(x, LY, s * LZ), (x, UY, s * UZ)], RT, FRAME, 12)
for x in (NOSE, COWL):
    tube(f, [(x, LY, -LZ), (x, LY, LZ)], RT, FRAME, 12)
    tube(f, [(x, UY, -UZ), (x, UY, UZ)], RT, FRAME, 12)
for s in (-1, 1):
    for arm, rail in ((W['lower'], (LY, LZ)), (W['upper'], (UY, UZ))):
        gap = arm['bush'][1] / 2 + 0.014
        for p in arm['pivots']:
            c = at(FRONT, s, p)
            # the plates reach from the rail out to the pivot and up and down round its bolt, inside
            # the bush's round, so the arm's tubes leaving the bush swing clear of them
            zin, zout = s * rail[1] - c[2], s * (abs(c[2]) + arm['bush'][0] - 0.006) - c[2]
            ylo, yhi = min(rail[0] - c[1], -arm['bush'][0] + 0.004), max(rail[0] - c[1], arm['bush'][0] - 0.004)
            clevis(f, c, 0, gap, [(ylo, yhi), tuple(sorted((zin, zout)))])

# The shock towers: from the upper rail up to each coilover's top eye, its clevis square to x round
# the body's top, a bar across between the towers' tops.
sh = W['shock']
for s in (-1, 1):
    top = at(FRONT, s, sh['top'])
    gap = sh['body'][0] + 0.004
    clevis(f, top, 0, gap, [(-0.02, 0.07), tuple(sorted((-s * 0.03, s * 0.035)))])
    tube(f, [(top[0] + 0.06, UY, s * UZ), (top[0] + 0.06, top[1] + 0.05, top[2] - s * 0.03)], RT, FRAME, 12)
    tube(f, [(top[0] - 0.06, UY, s * UZ), (top[0] - 0.06, top[1] + 0.05, top[2] - s * 0.03)], RT, FRAME, 12)
    tube(f, [(top[0] - 0.06, top[1] + 0.05, top[2] - s * 0.03), (top[0] + 0.06, top[1] + 0.05, top[2] - s * 0.03)], RT, FRAME, 12)
top = at(FRONT, 1, sh['top'])
tube(f, [(top[0], top[1] + 0.05, -(top[2] - 0.03)), (top[0], top[1] + 0.05, top[2] - 0.03)], RT, FRAME, 12)

# The rack's housing in two clamps, each on a post down to the lower rail.
rk = W['steer']['rack']
rx = at(FRONT, 1, (rk['along'], 0, 0))[0]
for s in (-1, 1):
    zc = s * (rk['housing'] - 0.05)
    ring(f, (rx, rk['y'], zc), 2, rk['radius'])
    tube(f, [(rx, rk['y'] - rk['radius'] - 0.01, zc), (rx, LY, s * LZ)], 0.012, FRAME, 10)

# The front anti-roll bar in a clamp each side, on a post down to the lower rail.
sw = W['sway']
for s in (-1, 1):
    b = at(FRONT, s, (sw['bar'][0], sw['bar'][1], sw['half'] - 0.07))
    ring(f, b, 2, sw['radius'])
    tube(f, [(b[0], b[1] - sw['radius'] - 0.01, b[2]), (b[0], LY, s * LZ)], 0.012, FRAME, 10)

# The front differential between the lower rails, its outputs where the half-shafts start.
hs = W['shaft']
o = at(FRONT, 1, hs['from'])
sphere(f, 0.1, (o[0], o[1], 0), CASE, 20, 10, (1.0, 0.9, 1.1))
# the output stubs end 5 mm into the half-shafts' cups, inside the part of each cup that sits on them
cyl(f, 0.04, 2 * o[2] + 0.01, (o[0], o[1], 0), (0, 0, 1), CASE, 20, 0.004)
cyl(f, 0.045, 0.2, (o[0] - 0.12, o[1] + 0.01, 0), (1, 0, 0), CASE, 16, 0.004)      # the input, back to the prop shaft
for s in (-1, 1):
    tube(f, [(o[0], o[1] - 0.06, s * 0.08), (o[0], LY, s * LZ)], 0.014, FRAME, 10)

# ------------------------------------------------------------------------------------- the middle
# The floor's rails from the front clip back, the rockers under the doors, crossmembers.
RX = AXLES[REAR]['at']
BACK = RX - 0.45
MZ, RZ = 0.32, BODY['width'] / 2 - 0.02              # the floor's rails and the rockers
MID1 = RX + 0.5
PIVOT = at(REAR, 1, T['pivot'])[0]                    # the trailing arms' pivots along x
for s in (-1, 1):
    tube(f, [(COWL, LY, s * LZ), (COWL - 0.15, LY, s * MZ), (MID1, LY, s * MZ)], RT, FRAME, 12)
    tube(f, [(COWL - 0.1, FLOOR + 0.06, s * RZ), (MID1 + 0.1, FLOOR + 0.06, s * RZ)], 0.024, FRAME, 12)
# crossmembers; ahead of the trailing arms' pivots each also reaches out to the rockers, behind them
# the arms sweep the space between the floor's rails and the rockers, so none does
for x in (COWL - 0.15, 0.3, -0.3, MID1):
    tube(f, [(x, LY, -MZ), (x, LY, MZ)], RT, FRAME, 12)
    if x > PIVOT + 0.1:
        for s in (-1, 1):
            tube(f, [(x, LY, s * MZ), (x, FLOOR + 0.06, s * RZ)], RT, FRAME, 12)

# The trailing arms' pivots: a beam across from the floor's rail to the rocker over each, and a clevis
# hanging from it, square to z round the arm's bush.
# The beam is a plate under the floor (its top 1 mm under the floor's underside, `FLOOR_LOW`), and the
# plates' tops end in its middle, 5 mm from its top and its bottom, so no face of theirs lies on its.
FLOOR_LOW = -0.215
for s in (-1, 1):
    c = at(REAR, s, T['pivot'])
    gap = T['bush'][1] / 2 + 0.004
    za, zb = sorted((s * MZ, s * RZ))
    block(f, (c[0] - 0.04, c[1] + T['bush'][0] + 0.004, za), (c[0] + 0.04, FLOOR_LOW - 0.001, zb), FRAME, 0.002)
    clevis(f, c, 2, gap, [(-0.05, 0.05), (-T['bush'][0] - 0.012, FLOOR_LOW - 0.006 - c[1])])

# The rear anti-roll bar in a clamp each side, on a post down to the floor's rail.
sw = T['sway']
for s in (-1, 1):
    b = at(REAR, s, (sw['bar'][0], sw['bar'][1], sw['half'] - 0.08))
    ring(f, b, 2, sw['radius'])
    tube(f, [(b[0], b[1] - sw['radius'] - 0.01, b[2]), (b[0], LY, s * MZ)], 0.012, FRAME, 10)

# ------------------------------------------------------------------------------------- the rear
# Lower and upper rails back to the rear bumper, the transaxle between them, the radius rods' frame
# ends each in a clevis square to x, the rear coilovers' tops on towers.
RL, RU = 0.13, 0.15
RUY = T['rods'][0]['frame'][1] + 0.06
for s in (-1, 1):
    tube(f, [(MID1, LY, s * MZ), (MID1 - 0.2, LY, s * RL), (BACK, LY, s * RL)], RT, FRAME, 12)
    tube(f, [(MID1, LY, s * MZ), (MID1 - 0.2, RUY, s * RU), (BACK, RUY, s * RU)], RT, FRAME, 12)
    tube(f, [(BACK, LY, s * RL), (BACK, RUY, s * RU)], RT, FRAME, 12)
tube(f, [(BACK, LY, -RL), (BACK, LY, RL)], RT, FRAME, 12)
tube(f, [(BACK, RUY, -RU), (BACK, RUY, RU)], RT, FRAME, 12)
for s in (-1, 1):
    for radius_rod in T['rods']:
        c = at(REAR, s, radius_rod['frame'])
        rail = (LY, RL) if radius_rod['frame'][1] < -0.2 else (RUY, RU)
        clevis(f, c, 0, IND['ball'] + 0.006, [(min(rail[0] - c[1], -0.035), max(rail[0] - c[1], 0.035)), tuple(sorted((s * rail[1] - c[2], s * 0.035)))])

hs = T['shaft']
o = at(REAR, 1, hs['from'])
block(f, (o[0] - 0.17, o[1] - 0.09, -0.12), (o[0] + 0.17, o[1] + 0.13, 0.12), CASE, 0.03)      # the transaxle
cyl(f, 0.045, 2 * o[2] + 0.01, (o[0], o[1], 0), (0, 0, 1), CASE, 20, 0.004)

# the rear towers rise inboard of each shock's top, which leans out and back from there, so the body
# swings clear of them through its travel
sh = T['shock']
for s in (-1, 1):
    top = at(REAR, s, sh['top'])
    # the body leans back and out from its eye, so the plates stand above the eye and wide of it
    gap = sh['body'][0] + 0.012
    clevis(f, top, 0, gap, [(-0.004, 0.07), tuple(sorted((-s * 0.09, s * 0.035)))])
    for dx in (-0.06, 0.06):
        tube(f, [(top[0] + dx, RUY, s * RU), (top[0] + dx, top[1] + 0.05, top[2] - s * 0.09)], RT, FRAME, 12)
    tube(f, [(top[0] - 0.06, top[1] + 0.05, top[2] - s * 0.09), (top[0] + 0.06, top[1] + 0.05, top[2] - s * 0.09)], RT, FRAME, 12)
top = at(REAR, 1, sh['top'])
tube(f, [(top[0], top[1] + 0.05, -(top[2] - 0.09)), (top[0], top[1] + 0.05, top[2] - 0.09)], RT, FRAME, 12)

# The engine, a turbocharged three across the frame behind the seats, on the transaxle.
ex0, ex1 = PIVOT - 0.43, o[0] + 0.17
block(f, (ex1, o[1] + 0.13, -0.26), (ex0, o[1] + 0.45, 0.26), CASE, 0.04)                     # the block
block(f, (ex1 + 0.04, o[1] + 0.45, -0.22), (ex0 - 0.04, o[1] + 0.58, 0.22), ALLOY, 0.03)      # the head
cyl(f, 0.08, 0.12, (ex1 + 0.1, o[1] + 0.52, 0.1), (0, 0, 1), STEEL, 20, 0.01)                 # the turbo, behind the head

# The exhaust: from the engine back to a muffler under the deck, which ends a centimetre short of the
# tailpipe the look draws (`look.exhaust`), so the tailpipe is the look's.
EX = LOOK['exhaust'][0]
tip, d = Vector(EX['at']), Vector(EX['dir']).normalized()
start = tip - 0.3 * d - 0.01 * d
# (the pipe ends 2 cm inside the muffler, so its end lies on no face of the muffler's)
tube(f, [(ex1 + 0.05, o[1] + 0.25, start.z), (ex1 - 0.02, start.y, start.z), (start.x + 0.26, start.y, start.z)], 0.03, STEEL, 12)
cyl(f, 0.08, 0.28, (start.x + 0.14, start.y, start.z), (1, 0, 0), STEEL, 24, 0.01)

# ======================================================================================== the body
# The UTV's own body round the frame, after Can-Am's Maverick X3: one faceted front clip, the short
# hood with a ridge down its middle and a vent either side, joined to the fender shells standing over
# the front wheels; a pointed fascia, its two faces meeting in a V at the nose, with slit headlamps
# along their tops, grille bars across them and a tube bumper round them; two-tone half doors, the
# body's paint above a crease that rises toward the tail and black below it; the side panels behind
# the doors with an intake; the rear fenders, rising from the doors to the tail as the X3's do, and
# the deck over the engine; slit tail lamps; the roll cage and its roof; the floor, the dash, the
# steering wheel, two bucket seats with harnesses; skid plates under it all. Every clearance it keeps
# from the wheels and the suspension is look.py's to prove.
b = Part('utv')

COWL_X, NOSE_X = 0.82, 1.80                     # the hood's back at the cowl and its front at the nose
SIDE = BODY['width'] / 2 + 0.02                 # the side panels' skin
HOOD_W = 0.4                                     # the hood's half width, its edges tucked into the fenders' flank feet
FIN, FOUT = 0.385, 0.97                          # each fender's flank foot and its lip's inner face, out from the middle


def hood_y(x):
    # high at the cowl and falling in one wedge to the nose, its edges only a little under the
    # fenders' crests, as the X3's hood sits between them
    pts = [(COWL_X, 0.54), (1.3, 0.5), (1.6, 0.42), (1.7, 0.36), (NOSE_X, 0.26)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


# A fender's underside along x, angular as the X3's: its points `[(x, y), ...]` from back to front
# joined by straight lines. The front's rises steeply from the nose to its top over the wheel and
# stays high back to the cowl, where the door's top meets it, a wedge from the nose up to the cabin;
# the rear's rises from the side panel's top to a flat top and drops to the tail. Each top stands
# over its wheel pushed in full (look.py's CLEAR).
FRONT_F = [(0.92, 0.6), (1.18, 0.6), (1.55, 0.585), (1.84, 0.31)]
REAR_F = [(-1.82, 0.42), (-1.62, 0.625), (-1.1, 0.625), (-0.93, 0.48)]


def fender_y(x, prof):
    for (x0, y0), (x1, y1) in zip(prof, prof[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return prof[0][1] if x < prof[0][0] else prof[-1][1]

# ---------------------------------------------------------------------------------- panels
# A body panel as a car's is made: a control cage of quads, `rows` of points (game frame) each the same
# count, smoothed by Catmull-Clark subdivision `levels` deep and then given `thick` of thickness under
# its outer face (the side its points' winding faces, turned to face `out` when given). The cage's
# edges along the rows listed in `crease_rows` (edges from point j to j+1 of row i) and down the
# columns in `crease_cols` (from row i to i+1 at point j) are fully creased, so the panel keeps a sharp
# feature line there while it rounds everywhere else, as a pressed or moulded panel does.
def panel(part, rows, thick, m, levels=3, crease_rows=(), crease_cols=(), out=(0, 1, 0)):
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in rows]
    for i in range(len(rows) - 1):
        for j in range(len(rows[0]) - 1):
            bm.faces.new([vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]])
    bm.normal_update()
    o = Vector(out)
    if sum((f.normal.dot(o) for f in bm.faces)) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    cl = bm.edges.layers.float.new('crease_edge')
    for i in crease_rows:
        for j in range(len(rows[0]) - 1):
            bm.edges.get((vs[i][j], vs[i][j + 1]))[cl] = 1.0
    for j in crease_cols:
        for i in range(len(rows) - 1):
            bm.edges.get((vs[i][j], vs[i + 1][j]))[cl] = 1.0
    me = bpy.data.meshes.new('panel_cage')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('panel_cage', me)
    bpy.context.scene.collection.objects.link(ob)
    sub = ob.modifiers.new('subsurf', 'SUBSURF')
    sub.levels = sub.render_levels = levels
    sub.boundary_smooth = 'PRESERVE_CORNERS'
    sol = ob.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness, sol.offset, sol.use_even_offset = thick, -1.0, True
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    em = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(em)
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    return part.take(bm, m, 0.0, sharp=1.2)


# ---------------------------------------------------------------------------------- the hood
# Faceted, as the X3's: across it a ridge down the middle 45 mm proud of its edges, flats either side
# falling to the fenders, 20 mm thick; along it the cowl's height falling to the nose (`hood_y`), a
# station at each of its bends so each facet is flat. A vent either side of the ridge, black, standing
# on the hood and following its slope.
def vent(x, za, zb):
    h = hood_y(x)
    return [(x, h + 0.02, za), (x, h + 0.02, zb), (x, h + 0.062, zb), (x, h + 0.062, za)]


for s in (-1, 1):
    loft(b, [vent(1.0, s * 0.1, s * 0.3), vent(1.25, s * 0.1, s * 0.3)], GRILLE)

# ---------------------------------------------------------------------------------- the fenders
# Each fender one faceted shell over its wheels, as the X3's: its inner wall standing 60 mm above the
# hood (or the deck) at `FIN`, a crest, the top falling outward to the lip at `FOUT`; its underside at
# every station on `prof`, the line the wheel clears pushed in full and at lock (look.py's CLEAR). A
# station at each of the profile's bends, so each facet is flat. Under the shell's outer edge a black
# lip turns down past the tyre, 70 mm. A black wall closes the front fender's back down to the
# quarter panel, and the rear fender's front down to the side panel; the arch under each is open.
# Across a station: the flank's foot standing 20 mm wide at `FIN` beside the hood's edge (or on the
# deck), from below it up to 10 mm over it (`h`, the hood's or the deck's height there), the flank
# raking out and up from there to the inner crest, 70 mm over the clearance line, the top on to the
# outer crest and falling to the lip at `fout`. In plan each fender narrows to its outer end, as the
# X3's do, the lip coming in where the tyre never reaches it: in front of the front tyre's round at its
# height, behind the rear's.
def fender_ring(x, prof, base, h, fout, s):
    fy = fender_y(x, prof)
    zy = [(FIN, base), (FIN, h + 0.01), (0.52, fy + 0.07), (0.66, fy + 0.08), (fout - 0.005, fy + 0.03), (fout, fy + 0.012),
          (0.54, fy), (FIN + 0.02, h), (FIN + 0.02, base)]
    return [(x, y, s * z) for z, y in zy]


def lip_ring(x, prof, fout, s):
    fy = fender_y(x, prof)
    zy = [(fout, fy + 0.012), (fout + 0.02, fy + 0.012), (fout + 0.02, fy - 0.07), (fout, fy - 0.07)]
    return [(x, y, s * z) for z, y in zy]


# each fender's lip out from the middle at each of its stations: full width over the tyre, in toward
# the nose and the tail
FRONT_OUT = [FOUT, FOUT, FOUT, 0.88]
REAR_OUT = [0.9, FOUT, FOUT, FOUT]
DECK = 0.5                                       # the deck's top over the engine, which the rear fenders' flanks stand on


def out_at(x, prof, outs):
    xs = [p[0] for p in prof]
    for (x0, o0), (x1, o1) in zip(zip(xs, outs), list(zip(xs, outs))[1:]):
        if x0 <= x <= x1:
            return o0 + (o1 - o0) * (x - x0) / (x1 - x0)
    return outs[0] if x < xs[0] else outs[-1]


# The front clip, one moulded panel from the cowl to the nose over both front wheels: across each
# station the hood's ridge, its flats falling to a valley at 0.40 out, the flank raking up from there
# to the fender's crest at 0.62, its top falling to the edge; creased along the valleys and crests, so
# those lines stay sharp as the X3's do while every surface between them rounds. Its last station
# gathers it down onto the fascia's top, so the nose closes in a point.
FRONT_X = [0.84, 0.92, 1.1, 1.3, 1.5, 1.66, 1.78]
ACROSS = [0.0, 0.14, 0.3, 0.4, 0.47, 0.62, 0.85]


def front_row(x):
    h, fy, fo = hood_y(min(x, NOSE_X)), fender_y(x, FRONT_F), out_at(x, FRONT_F, FRONT_OUT)
    # the flank rises from the hood's valley to the crest, never below the valley where the fender
    # drops toward the nose
    ys = [h + 0.04, h + 0.035, h + 0.012, h, max(fy + 0.05, h + 0.02), max(fy + 0.085, h + 0.04), fy + 0.06, fy + 0.02]
    zs = ACROSS + [fo]
    half = list(zip(zs, ys))
    full = [(-z, y) for z, y in reversed(half[1:])] + half
    return [(x, y, z) for z, y in full]


nose = [(1.9, 0.25 + 0.03 * (1 - abs(z) / 0.97), z * 0.6) for _, _, z in front_row(1.78)]
rows = [front_row(x) for x in FRONT_X] + [nose]
n = len(rows[0]) // 2
panel(b, rows, 0.02, SAGE, crease_cols=(n - 5, n - 3, n + 3, n + 5))

# Each rear fender, one moulded panel over the rear wheel from the side panel's top to the tail: its
# flank rising from the deck at 0.36 out to the crest at 0.62, its top falling to the edge.
REAR_X = [-1.82, -1.72, -1.62, -1.37, -1.1, -1.0, -0.93]


def rear_row(x, s):
    fy, fo = fender_y(x, REAR_F), out_at(x, REAR_F, REAR_OUT)
    zy = [(0.36, DECK - 0.01), (0.42, DECK + 0.01), (0.48, fy + 0.05), (0.62, fy + 0.085), (0.85, fy + 0.06), (fo, fy + 0.02)]
    return [(x, y, s * z) for z, y in zy]


for s in (-1, 1):
    panel(b, [rear_row(x, s) for x in REAR_X], 0.02, SAGE, crease_cols=(1, 3))

# The wheel-well liners, black, closing each arch on its inner side as a moulded liner does: a wall at
# 0.47 out from the middle from just under the fender down to the frame, along the fender's length,
# the tyre's inner face at full lock coming no nearer than 0.53 out.
LINER = 0.47
for s in (-1, 1):
    front = [[(x, y, s * LINER) for y in (fender_y(x, FRONT_F) + 0.02, 0.4, 0.3, 0.22)] for x in FRONT_X[1:]]
    panel(b, front, 0.01, BLACK, levels=2, out=(0, 0, s))
    rear = [[(x, y, s * LINER) for y in (fender_y(x, REAR_F) + 0.02, 0.45, 0.37, 0.31)] for x in REAR_X]
    panel(b, rear, 0.01, BLACK, levels=2, out=(0, 0, s))
for s in (-1, 1):
    st = [(x, o) for (x, _), o in zip(FRONT_F, FRONT_OUT)]
    loft(b, [lip_ring(x, FRONT_F, o, s) for x, o in st], BLACK)
    st = [(x, o) for (x, _), o in zip(REAR_F, REAR_OUT)]
    loft(b, [lip_ring(x, REAR_F, o, s) for x, o in st], BLACK)
    # the end walls start in the middle of the flank's foot, so no face of the two lies on the other
    xb, yb = FRONT_F[0]
    slab(b, [(s * (FIN + 0.01), 0.3), (s * (FOUT + 0.02), 0.3), (s * (FOUT + 0.02), yb - 0.06), (s * (FIN + 0.01), yb)], 'front', xb - 0.012, xb + 0.006, BLACK, 0.003)
    xr, yr = REAR_F[-1]
    slab(b, [(s * (FIN + 0.01), 0.3), (s * (SIDE - 0.002), 0.3), (s * (SIDE - 0.002), yr), (s * (FIN + 0.01), yr)], 'front', xr - 0.006, xr + 0.012, BLACK, 0.003)

# ---------------------------------------------------------------------------------- the nose
# The X3's pointed fascia under the hood's front edge: in plan two faces meeting in a V at the nose,
# `TIP` forward of their outer ends; across each face three grille bars, and a slit headlamp along
# its top (the lamps' own nodes, below); a tube bumper round the V and back to the frame; the front
# skid plate.
TIP, CORNER, FZ = 1.9, 1.76, 0.46                 # the V's point, its outer ends along x, and their z


def on_face(z, y, out=0.0):
    # the point of the right-hand face (z > 0) at `z` and height `y`, `out` metres off it, forward
    x = TIP - (TIP - CORNER) * abs(z) / FZ
    n = Vector((FZ, 0.0, (TIP - CORNER) * (1 if z >= 0 else -1))).normalized()
    return (x + n.x * out, y, z + n.z * out)


# The fascia, one moulded black panel: its rows run down from under the hood's edge to the chin, each
# row across the V from one outer end through the point to the other, the faces bowed out a little
# and swept back at the chin, creased at the point and along the brow the headlamps sit under; a
# recess across each face holds the grille, a mesh of bars standing in it.
def fascia_row(y, back, bow):
    zs = [-FZ, -0.36, -0.24, -0.12, 0.0, 0.12, 0.24, 0.36, FZ]
    return [(TIP - back - (TIP - CORNER) * abs(z) / FZ + bow * math.sin(math.pi * abs(z) / FZ), y, z) for z in zs]


fascia = [fascia_row(0.235, 0.03, 0.0), fascia_row(0.2, 0.0, 0.01), fascia_row(0.14, 0.0, 0.015),
          fascia_row(0.04, 0.005, 0.015), fascia_row(-0.05, 0.03, 0.01), fascia_row(-0.11, 0.08, 0.0)]
panel(b, fascia, 0.02, BLACK, levels=3, crease_rows=(1,), crease_cols=(4,), out=(1, 0, 0))
for s in (-1, 1):
    # the grille recess, a darker plate set into each face, and its bars
    grid = [[on_face(s * z, y, -0.004) for z in (0.06, 0.16, 0.26, 0.36)] for y in (0.13, 0.08, 0.03, -0.02)]
    panel(b, grid, 0.01, GRILLE, levels=1, out=(1, 0, 0))
    for y in (-0.005, 0.03, 0.065, 0.1):
        tube(b, [on_face(s * 0.07, y, 0.01), on_face(s * 0.36, y + 0.012, 0.01)], 0.007, GRILLE, 6)
    for z in (0.12, 0.2, 0.28):
        tube(b, [on_face(s * z, -0.02, 0.012), on_face(s * z, 0.13, 0.012)], 0.006, GRILLE, 6)
bp = [(CORNER + 0.02, -0.18, -FZ), (TIP + 0.06, -0.14, 0.0), (CORNER + 0.02, -0.18, FZ)]
tube(b, bp, 0.024, BLACK, 12)
tube(b, [(CORNER + 0.02, -0.18, -FZ), (CORNER + 0.02, 0.05, -FZ - 0.02)], 0.02, BLACK, 10)
tube(b, [(CORNER + 0.02, -0.18, FZ), (CORNER + 0.02, 0.05, FZ + 0.02)], 0.02, BLACK, 10)
for s in (-1, 1):
    tube(b, [(CORNER + 0.02, -0.18, s * FZ), (NOSE + 0.005, LY, s * LZ)], 0.02, BLACK, 10)
slab(b, [(0.95, -0.335), (1.7, -0.335), (1.84, -0.24), (1.84, -0.22), (1.7, -0.32), (0.95, -0.32)], 'side', -0.16, 0.16, GRILLE, 0.004)

# ---------------------------------------------------------------------------------- the sides
# As the X3's: from the front fender back to the rear fender, the body's paint above a crease and
# black below it, the crease rising toward the tail (`CREASE`, steepest behind the door), an accent
# line along it; the half door with its handle and the strap it latches by; a black quarter panel
# ahead of the door up to the fender's back; behind the door the side panel with its intake in the
# black, its top rising to the rear fender; the black rocker under it all. The black is set 8 mm in
# from the paint, the accent and the handle stand 4 mm off the paint, so no face lies on another.
CREASE = [(0.8, 0.04), (0.0, 0.12), (-0.36, 0.34), (-0.95, 0.4)]
DOOR_TOP = [(0.8, 0.54), (-0.36, 0.48)]
for s in (-1, 1):
    def side(pts, depth, m, out=0.0):
        za, zb = sorted((s * (SIDE + out), s * (SIDE + out + depth)))
        slab(b, pts, 'side', za, zb, m, 0.004)
    side([(0.85, -0.3), (-0.88, -0.3), (-0.88, -0.19), (0.85, -0.19)], 0.02, BLACK)                                 # the rocker
    side([(0.88, -0.18), (0.81, -0.18), (0.81, 0.56), (0.88, 0.6)], 0.02, BLACK)                                     # the quarter
    # the door, a moulded panel: below the crease black and upright, above it the body's paint turned
    # in toward its top (the X3's tumblehome), the crease a sharp line between them; along its front
    # and back edges it rolls in to its shut lines
    def crease_y(x):
        for (x0, y0), (x1, y1) in zip(CREASE, CREASE[1:]):
            if x1 <= x <= x0:
                return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        return CREASE[0][1] if x > CREASE[0][0] else CREASE[-1][1]

    def top_y(x):
        (x0, y0), (x1, y1) = DOOR_TOP
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0)

    lower, upper = [], []
    for x in (0.8, 0.79, 0.6, 0.3, 0.0, -0.2, -0.35, -0.36):
        roll = 0.012 if x in (0.8, -0.36) else 0.0
        cy, ty = crease_y(x), top_y(x)
        lo = [(-0.18, 0.0), (-0.12, 0.004), ((cy - 0.18) * 0.5, 0.008), (cy, 0.01)]
        up = [(cy + 0.004, 0.022), (cy + (ty - cy) * 0.4, 0.02), (cy + (ty - cy) * 0.8, 0.01), (ty - 0.01, 0.0), (ty, -0.014)]
        lower.append([(x, y, s * (SIDE + o - roll)) for y, o in lo])
        upper.append([(x, y, s * (SIDE + o - roll)) for y, o in up])
    panel(b, lower, 0.012, BLACK, levels=3, out=(0, 0, s))
    panel(b, upper, 0.012, SAGE, levels=3, crease_cols=(0,), out=(0, 0, s))
    # its back edge 0.9 back up to 0.22 high, the rear tyre's front pushed in full reaching to -0.935
    # at its middle, 0.11 high, then raking back with the tyre's round to the crease
    # the side pod behind the door, moulded as the door is: black below the crease, the paint above it
    # turned in and rising to meet the rear fender
    pod_lo, pod_up = [], []
    # its back edge stays forward of -0.9, the rear tyre's front pushed in full reaching -0.935
    for x in (-0.37, -0.5, -0.7, -0.84, -0.9):
        cy = crease_y(x)
        ty = 0.48 + (0.5 - 0.48) * (-0.37 - x) / 0.58
        foot = -0.18 if x > -0.88 else 0.22
        lo = [(foot, 0.0), (foot + 0.06, 0.004), ((cy + foot) * 0.5, 0.008), (cy, 0.01)]
        up = [(cy + 0.004, 0.022), (cy + (ty - cy) * 0.4, 0.02), (cy + (ty - cy) * 0.8, 0.01), (ty - 0.01, 0.0), (ty, -0.014)]
        pod_lo.append([(x, y, s * (SIDE + o)) for y, o in lo])
        pod_up.append([(x, y, s * (SIDE + o)) for y, o in up])
    panel(b, pod_lo, 0.012, BLACK, levels=3, out=(0, 0, s))
    panel(b, pod_up, 0.012, SAGE, levels=3, crease_cols=(0,), out=(0, 0, s))
    side([(-0.88, -0.18), (-0.9, -0.18), (-0.9, 0.22), (-0.88, 0.22)], 0.012, BLACK)
    side([(-0.48, -0.02), (-0.86, -0.02), (-0.86, 0.3), (-0.52, 0.26)], 0.012, GRILLE, 0.014)                       # the intake
    for k in range(4):
        y = 0.02 + 0.065 * k
        side([(-0.52, y), (-0.84, y), (-0.84, y + 0.015), (-0.52, y + 0.015)], 0.006, BLACK, 0.026)
    side(band(CREASE, 0.012), 0.004, ACCENT, 0.026)                                                                  # the accent
    side([(-0.06, 0.36), (-0.22, 0.38), (-0.22, 0.405), (-0.06, 0.385)], 0.012, BLACK, 0.022)                        # the handle
    # the strap a half door is latched by, from the door's top to the cage
    tube(b, [(-0.3, 0.45, s * (SIDE + 0.012)), (-0.44, 0.62, s * 0.68)], 0.01, BLACK, 6)

# ---------------------------------------------------------------------------------- the rear
# The deck over the engine, a cargo rail round it, the rear fascia with the tail and reverse lamps,
# the rear bumper and skid plate.
# the deck and the fascia end in the middle of the rear fenders' flank feet
# The engine cover, one moulded black panel between the rear fenders from behind the seats to the
# tail, crowned across, its back rolled down into the rear fascia, with louvres over the engine; the
# cargo rail round it.
def cover_row(x, y, crown=0.04, edge=0.4):
    zs = [-0.4, -0.3, -0.15, 0.0, 0.15, 0.3, 0.4]
    return [(x, y + crown * (1 - (z / 0.4) ** 2), z * edge / 0.4) for z in zs]


# crowned along its length, rising to a lip at the tail that stands out over the fascia as the X3's
# spoiler does, then turned down and under into the fascia and the diffuser below it
cover = [cover_row(-0.52, 0.49, 0.02), cover_row(-0.62, 0.505), cover_row(-1.0, 0.51), cover_row(-1.4, 0.52),
         cover_row(-1.66, 0.55, 0.03), cover_row(-1.76, 0.56, 0.02), cover_row(-1.74, 0.5, 0.0),
         cover_row(-1.69, 0.4, 0.0, 0.38), cover_row(-1.7, 0.26, 0.0, 0.36), cover_row(-1.74, 0.21, 0.0, 0.32)]
# (its foot stays over the tailpipe the look draws at y 0.12, 45 mm round)
panel(b, cover, 0.015, BLACK, levels=3, crease_rows=(5, 7), out=(0, 1, 0))
for k in range(6):
    x = -0.75 - 0.08 * k
    tube(b, [(x, 0.53, -0.24), (x, 0.53, 0.24)], 0.008, GRILLE, 6)
rail = [(-0.9, 0.58, -0.34), (-1.62, 0.58, -0.34), (-1.62, 0.58, 0.34), (-0.9, 0.58, 0.34)]
tube(b, rail, 0.012, BLACK, 8, closed=True)
for p in rail:
    tube(b, [(p[0], 0.51, p[2]), p], 0.012, BLACK, 8)
rb = [(-1.8, -0.15, -0.42), (-1.86, -0.05, -0.38), (-1.87, 0.06, -0.3), (-1.87, 0.06, 0.3), (-1.86, -0.05, 0.38), (-1.8, -0.15, 0.42)]
tube(b, rb, 0.022, BLACK, 12)
for s in (-1, 1):
    tube(b, [(-1.8, -0.15, s * 0.42), (BACK - 0.005, LY, s * RL)], 0.02, BLACK, 10)
block(b, (-1.75, -0.335, -0.1), (-0.9, -0.32, 0.1), GRILLE, 0.004)
block(b, (0.95, -0.335, -0.42), (-0.9, -0.32, 0.42), GRILLE, 0.004)

# ---------------------------------------------------------------------------------- the cage
# A pillars from the cowl to the roof, roof rails back to the main hoop behind the seats, a shoulder
# bar and the hoop's top bar, braces from the hoop back to the deck, intrusion bars down each side,
# and the roof over it all.
# Each bar bent as a cage's tubes are, every corner of its line an arc `r` round, not a mitre.
def bent(pts, r, n=6):
    P = [Vector(p) for p in pts]
    out = [P[0]]
    for a, c, d in zip(P, P[1:], P[2:]):
        u, v = (a - c).normalized(), (d - c).normalized()
        k = min(r, (a - c).length * 0.45, (d - c).length * 0.45)
        p0, p1 = c + u * k, c + v * k
        for i in range(n + 1):
            t = i / n
            out.append((p0 * (1 - t) ** 2 + c * 2 * t * (1 - t) + p1 * t * t))
    out.append(P[-1])
    return [q.to_tuple() for q in out]


CR = 0.027
for s in (-1, 1):
    # the A pillar from the cowl beside the hood, swept up and back to the roof, along the roof rail to
    # the hoop and down behind the seats to the floor
    tube(b, bent([(0.84, 0.5, s * 0.58), (0.62, 0.78, s * 0.6), (0.4, 0.97, s * 0.6), (-0.48, 0.985, s * 0.62), (-0.52, 0.6, s * 0.66), (-0.5, -0.04, s * 0.68)], 0.14), CR, FRAME, 14)
    # the rear braces from the hoop's top back and down to the shock towers
    tube(b, bent([(-0.48, 0.985, s * 0.56), (-0.9, 0.78, s * 0.45), (-1.25, 0.52, s * 0.34)], 0.12), CR, FRAME, 14)
    # the door bar, the A pillar's foot down to the rocker, and the harness bar
    tube(b, bent([(0.8, 0.3, s * 0.7), (0.2, 0.42, s * 0.71), (-0.46, 0.55, s * 0.7)], 0.1), 0.02, FRAME, 12)
    tube(b, bent([(0.84, 0.5, s * 0.58), (0.82, 0.2, s * 0.66), (0.8, -0.18, s * 0.7)], 0.08), 0.022, FRAME, 12)
for (x, y, z) in ((0.42, 0.97, 0.6), (-0.48, 0.985, 0.62), (-0.5, 0.56, 0.66)):
    tube(b, [(x, y, -z), (x, y, z)], CR, FRAME, 14)
# the roof, a moulded black top over the cage: crowned, its front lip turned down over the screen line,
# two ribs along it
roof = [[(x, 1.01 + 0.02 * (1 - (z / 0.66) ** 2) - (0.03 if x > 0.42 else 0.0), z) for z in (-0.66, -0.6, -0.3, 0.0, 0.3, 0.6, 0.66)]
        for x in (0.5, 0.44, 0.3, 0.0, -0.3, -0.48, -0.52)]
panel(b, roof, 0.014, FRAME, levels=3, out=(0, 1, 0))
for z in (-0.3, 0.3):
    tube(b, [(0.3, 1.035, z), (-0.4, 1.035, z)], 0.01, FRAME, 8)

# ---------------------------------------------------------------------------------- the cabin
# The floor and the tunnel down its middle, the firewall behind the seats, the dash and its screen,
# the steering column; two bucket seats, each with a five-point harness in the accent colour.
# Behind the trailing arms' pivots the arms sweep up under the cabin's sides, so the floor there is a
# raised platform for the seats, `PLAT` up and `PLAT_W` each side, the arms swinging past outboard of
# it and under the firewall's sides.
PLAT, PLAT_W, PLAT_X = -0.085, 0.44, PIVOT + 0.02
block(b, (PLAT_X, FLOOR_LOW, -0.72), (0.8, -0.2, 0.72), BLACK, 0.004)
block(b, (-0.5, PLAT - 0.015, -PLAT_W), (PLAT_X - 0.009, PLAT, PLAT_W), BLACK, 0.004)
slab(b, [(-PLAT_W, FLOOR_LOW + 0.005), (PLAT_W, FLOOR_LOW + 0.005), (PLAT_W, PLAT - 0.005), (-PLAT_W, PLAT - 0.005)], 'front', PLAT_X - 0.016, PLAT_X - 0.004, BLACK, 0.004)
# the tunnel down the floor to the platform, and the console on the platform behind it, the rear
# anti-roll bar running across under the platform between them
block(b, (PLAT_X + 0.004, -0.2, -0.1), (0.7, 0.1, 0.1), GRAPHITE, 0.03)
block(b, (-0.48, PLAT, -0.1), (PLAT_X - 0.02, 0.1, 0.1), GRAPHITE, 0.03)
cyl(b, 0.012, 0.12, (0.25, 0.16, 0.06), (0, 1, 0), FRAME, 10)                                    # the shifter
sphere(b, 0.025, (0.25, 0.225, 0.06), BLACK, 12, 6)
slab(b, [(-PLAT_W, PLAT), (PLAT_W, PLAT), (PLAT_W, -0.04), (0.66, -0.04), (0.66, 0.47), (-0.66, 0.47), (-0.66, -0.04), (-PLAT_W, -0.04)], 'front', -0.53, -0.51, BLACK, 0.006)
slab(b, [(0.55, 0.12), (0.82, 0.12), (0.82, 0.44), (0.6, 0.41), (0.55, 0.33)], 'side', -0.68, 0.68, BLACK, 0.01)
slab(b, rrect(0.24, 0.12, 0.012, 3, -0.36, 0.33), 'front', 0.541, 0.546, GRAPHITE, 0.002)
slab(b, rrect(0.2, 0.1, 0.01, 3, 0.0, 0.3), 'front', 0.541, 0.546, GRAPHITE, 0.002)
SEATS = 0.27                                     # each seat's middle out from the car's middle
hub = Vector((0.3, 0.42, -SEATS))
down = Vector((math.cos(0.9), -math.sin(0.9), 0.0))          # down the column into the dash
rod(b, hub.to_tuple(), (hub + down * 0.32).to_tuple(), 0.025, BLACK, 12)
e1 = Vector((math.sin(0.9), math.cos(0.9), 0.0))             # up the wheel's face
e2 = Vector((0, 0, 1))
sp = Part('steer', hub, Matrix.Rotation(-0.9, 3, 'Z'))
tube(sp, [(hub + 0.17 * (math.cos(2 * math.pi * k / 28) * e1 + math.sin(2 * math.pi * k / 28) * e2)).to_tuple() for k in range(28)], 0.016, BLACK, 8, closed=True)
for a in (0.0, 2.2, -2.2):
    rod(sp, hub.to_tuple(), (hub + 0.16 * (math.cos(a) * e1 + math.sin(a) * e2)).to_tuple(), 0.011, GRAPHITE, 6)
cyl(sp, 0.045, 0.04, (hub - 0.01 * down).to_tuple(), (-down).to_tuple(), GRAPHITE, 16, 0.005)
for c in (-SEATS, SEATS):
    y0 = PLAT                                                                                    # the cushion's foot
    # a moulded bucket seat: the shell's rows from the cushion's front, back along it, up the back and
    # over its top, each row across the seat dished between raised bolsters
    def across(x, y, lift):
        return [(x, y + lift * b_, c + z) for z, b_ in ((-0.18, 1.0), (-0.15, 1.0), (-0.1, 0.2), (0.0, 0.0), (0.1, 0.2), (0.15, 1.0), (0.18, 1.0))]
    seat = [across(0.03, y0 + 0.06, 0.03), across(0.0, y0 + 0.12, 0.05), across(-0.2, y0 + 0.1, 0.06),
            across(-0.36, y0 + 0.12, 0.08), across(-0.4, y0 + 0.3, 0.0), across(-0.44, y0 + 0.55, 0.0),
            across(-0.47, y0 + 0.72, 0.0), across(-0.52, y0 + 0.72, 0.0)]
    for row in seat[4:]:
        for i, (x, y, z) in enumerate(row):
            if i in (0, 1, 5, 6):
                row[i] = (x + 0.07, y, z)
    panel(b, seat, 0.05, SEAT, levels=2, out=(1, 1, 0))
    for k in (-1, 1):
        # the shoulder straps from over the back down its front to the buckle, and the lap belts from
        # the cushion's sides to it, each ending short of the buckle and of the others
        quad(b, (-0.44, y0 + 0.69, c + k * 0.07 - 0.022), (-0.44, y0 + 0.69, c + k * 0.07 + 0.022), (-0.355, y0 + 0.33, c + k * 0.06 + 0.022), (-0.355, y0 + 0.33, c + k * 0.06 - 0.022), 0.004, ACCENT)
        quad(b, (-0.355, y0 + 0.33, c + k * 0.06 - 0.022), (-0.355, y0 + 0.33, c + k * 0.06 + 0.022), (-0.07, y0 + 0.145, c + k * 0.03 + 0.022), (-0.07, y0 + 0.145, c + k * 0.03 - 0.022), 0.004, ACCENT)
        za, zb = sorted((c + k * 0.15, c + k * 0.07))
        quad(b, (-0.3, y0 + 0.137, za), (-0.3, y0 + 0.137, zb), (-0.09, y0 + 0.137, zb), (-0.09, y0 + 0.137, za), 0.004, ACCENT)
    block(b, (-0.075, y0 + 0.13, c - 0.035), (-0.02, y0 + 0.165, c + 0.035), STEEL, 0.006)       # the buckle

# ---------------------------------------------------------------------------------- the lamps
# The X3's slit headlamps along the top of each face of the fascia, rising to its outer ends; an amber
# slit along each face's foot and a side marker on each front fender's lip; the tail lamps slits
# rising to the rear fascia's outer corners, the reverse lamps under them.
for s, sd in ((-1, 'L'), (1, 'R')):
    hp = Part('head.' + sd)
    tube(hp, [on_face(s * 0.1, 0.16, 0.008), on_face(s * 0.42, 0.205, 0.008)], 0.014, LENS, 10)
    # a slit on the rear fascia's upper corner, and one across the back of the rear fender, between its
    # underside and its top there, standing 6 mm proud of it
    tp = Part('tail.' + sd)
    slab(tp, [(s * 0.22, 0.4), (s * 0.37, 0.44), (s * 0.37, 0.47), (s * 0.22, 0.43)], 'front', -1.716, -1.706, TAIL, 0.003)
    xt = REAR_F[0][0]
    slab(tp, [(s * 0.56, 0.425), (s * 0.88, 0.435), (s * 0.88, 0.448), (s * 0.56, 0.445)], 'front', xt - 0.006, xt + 0.006, TAIL, 0.002)
    rp = Part('reverse.' + sd)
    slab(rp, [(s * 0.24, 0.33), (s * 0.36, 0.35), (s * 0.36, 0.375), (s * 0.24, 0.355)], 'front', -1.708, -1.696, REV, 0.003)
    ap = Part('amber.' + sd)
    tube(ap, [on_face(s * 0.3, -0.035, 0.007), on_face(s * 0.42, -0.035, 0.007)], 0.01, AMBER, 8)
    za, zb = sorted((s * (FOUT + 0.024), s * (FOUT + 0.03)))
    block(ap, (1.7, 0.37, za), (1.74, 0.395, zb), AMBER, 0.003)

objs = build()
for s, sd in ((-1, 'L'), (1, 'R')):
    node('beam.' + sd, on_face(s * 0.3, 0.185, 0.03))
export(OUT)
