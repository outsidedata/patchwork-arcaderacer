# Renders the supercar scene from the angles a car is judged from, one `v_<view>.png` a view into the
# folder given, every view with the doors shut and `doors` with them open DOORS degrees:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#       --python games/arcaderacer/assets/supercar/supercar.py \
#       --python games/arcaderacer/assets/supercar/views.py -- <out dir>
import bpy, os, sys
from math import radians
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1]
DOORS = 70
sc = bpy.data.scenes["supercar"]
cam = sc.objects["car.cam"]

VIEWS = {
    "front34": ((-5.2, -5.6, 1.45), (0, 0.1, 0.45), 55),
    "side": ((-9.0, 0.0, 0.75), (0, 0.0, 0.5), 50),
    "rear34": ((4.8, 5.4, 1.6), (0, -0.1, 0.5), 55),
    "front": ((0.0, -9.0, 0.9), (0, 0, 0.5), 60),
    "rear": ((0.0, 9.0, 1.0), (0, 0, 0.5), 60),
    "top": ((0.0, 0.0, 12.0), (0, 0.0001, 0), 50),
    "doors": ((-4.6, -3.8, 2.4), (0, 0.2, 0.7), 45),
    "hood": ((-2.2, -3.6, 1.9), (0, -1.2, 0.6), 50),
    "wheel": ((-2.4, -2.2, 0.45), (-0.8, -1.25, 0.32), 50),
    "nose": ((-1.2, -4.2, 0.55), (0, -2.1, 0.38), 50),
    "tail": ((1.6, 4.2, 0.95), (0, 1.9, 0.6), 50),
    "wing": ((-2.4, 3.6, 1.5), (0, 1.75, 1.0), 50),
}


def set_doors(angle):
    sc.objects["car.door_l"].rotation_euler = (0, radians(-angle), 0)
    sc.objects["car.door_r"].rotation_euler = (0, radians(angle), 0)


def shot(name, doors=0.0):
    loc, target, lens = VIEWS[name]
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    set_doors(doors)
    sc.render.filepath = os.path.join(OUT, "v_" + name + ".png")
    bpy.ops.render.render(write_still=True, scene=sc.name)
    set_doors(0.0)
    return sc.render.filepath


SHOTS = [(name, DOORS if name == "doors" else 0.0) for name in VIEWS]
os.makedirs(OUT, exist_ok=True)
result = [shot(n, d) for n, d in SHOTS]
print("rendered", len(result), "views into", OUT)
