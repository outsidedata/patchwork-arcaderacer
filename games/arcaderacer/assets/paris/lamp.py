# Makes lamp.glb: a Paris street lamp, one object `lamp`, its foot at the origin. A cast-iron post
# painted the city's dark green: a moulded pedestal, a fluted shaft tapering up to a collar, the
# lamplighter's ladder bar across it under the head, and a hexagonal lantern of six lit panes
# under a pointed roof with a finial. HEAD is the middle of its glass, where the game puts its light.
# Materials: `iron` (the paint) and `lit` (the panes, glowing).
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#       --python games/arcaderacer/assets/paris/lamp.py [-- out.glb]
# It writes the plain glb Blender exports, to `out.glb` when given, else beside itself; `yarn bake
# arcaderacer` packs it into the game (`arcaderacer.bake.ts`).
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kit import UP, Build, export, lin, principled, vertex_tinted  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else os.path.join(HERE, 'lamp.glb')
HEAD = 4.22
IRON, LIT = range(2)


def lathe(B, profile, sides, mat, flutes=0, flute=0.0):
    """A surface of revolution through (radius, height) points, smooth; with `flutes`, its radius
    dips by `flute` on every other facet."""
    def ring(r, z, k):
        return [(math.cos(2 * math.pi * s / sides) * (r - (flute if flutes and s % 2 else 0)),
                 math.sin(2 * math.pi * s / sides) * (r - (flute if flutes and s % 2 else 0)), z) for s in range(sides)]
    rings = [ring(r, z, k) for k, (r, z) in enumerate(profile)]
    for k in range(len(rings) - 1):
        (ra, za), (rb, zb) = profile[k], profile[k + 1]
        for s in range(sides):
            n = (s + 1) % sides
            mid = (math.cos(2 * math.pi * (s + 0.5) / sides), math.sin(2 * math.pi * (s + 0.5) / sides))
            want = (mid[0] * (zb - za), mid[1] * (zb - za), -(rb - ra))
            B.poly([rings[k][s], rings[k][n], rings[k + 1][n], rings[k + 1][s]], mat, want, smooth=not flutes)


def bar(B, a, b, s):
    """A square iron bar from a to b along x."""
    (x0, y, z), (x1, _, _) = a, b
    h = s / 2
    for (y0, z0), (y1, z1), want in (((-h, -h), (h, -h), (0, 0, -1)), ((h, -h), (h, h), (0, 1, 0)), ((h, h), (-h, h), UP), ((-h, h), (-h, -h), (0, -1, 0))):
        B.poly([(x0, y + y0, z + z0), (x1, y + y0, z + z0), (x1, y + y1, z + z1), (x0, y + y1, z + z1)], IRON, want)
    for x, want in ((x0, (-1, 0, 0)), (x1, (1, 0, 0))):
        B.poly([(x, y - h, z - h), (x, y + h, z - h), (x, y + h, z + h), (x, y - h, z + h)], IRON, want)


bpy.ops.wm.read_factory_settings(use_empty=True)
iron, nt, bsdf = principled('iron')
rgb = nt.nodes.new('ShaderNodeRGB')
rgb.outputs[0].default_value = lin('#1d2620')
vertex_tinted(nt, bsdf, rgb.outputs[0])
bsdf.inputs['Roughness'].default_value = 0.45
bsdf.inputs['Metallic'].default_value = 0.35
lit, nt, bsdf = principled('lit')
bsdf.inputs['Base Color'].default_value = (0.9, 0.85, 0.7, 1)
bsdf.inputs['Emission Color'].default_value = lin('#ffcf8a')
bsdf.inputs['Emission Strength'].default_value = 3.0

B = Build()
# the pedestal: a plinth, a torus, a bell, a neck
lathe(B, [(0.2, 0.0), (0.2, 0.12), (0.17, 0.14), (0.17, 0.22), (0.21, 0.27), (0.17, 0.33), (0.15, 0.55),
          (0.12, 0.72), (0.1, 0.78), (0.115, 0.82), (0.095, 0.86)], 16, IRON)
# the fluted shaft
lathe(B, [(0.09, 0.86), (0.07, 3.42)], 24, IRON, flutes=12, flute=0.008)
# the collar under the head, and its cup
lathe(B, [(0.07, 3.42), (0.095, 3.46), (0.075, 3.5), (0.075, 3.62), (0.1, 3.66), (0.06, 3.72), (0.05, 3.86)], 16, IRON)
# the ladder bar
bar(B, (-0.34, 0.0, 3.56), (0.34, 0.0, 3.56), 0.035)
# the lantern: a cone up to the panes, six panes between six posts, a roof, a finial
lathe(B, [(0.05, 3.86), (0.12, 3.94), (0.2, 4.0), (0.2, 4.02)], 6, IRON)
lathe(B, [(0.2, 4.02), (0.24, 4.44)], 6, LIT)
(r0, z0), (r1, z1) = (0.2, 4.02), (0.24, 4.44)
for s in range(6):
    # a post at each corner of the panes, just proud of the glass
    a = 2 * math.pi * s / 6
    c, d = math.cos(a) * 1.01, math.sin(a) * 1.01
    w = 0.014
    B.poly([(c * r0 - d * w, d * r0 + c * w, z0), (c * r0 + d * w, d * r0 - c * w, z0), (c * r1 + d * w, d * r1 - c * w, z1), (c * r1 - d * w, d * r1 + c * w, z1)], IRON, (c, d, 0))
lathe(B, [(0.24, 4.44), (0.29, 4.47), (0.27, 4.5), (0.14, 4.62), (0.05, 4.7), (0.035, 4.74), (0.05, 4.78), (0.0, 4.86)], 6, IRON)

me = B.mesh('lamp', [iron, lit])
ob = bpy.data.objects.new('lamp', me)
bpy.context.scene.collection.objects.link(ob)
ob['head'] = HEAD
print(f'lamp: {B.tris()} triangles, head at {HEAD} m')
export(OUT)
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
