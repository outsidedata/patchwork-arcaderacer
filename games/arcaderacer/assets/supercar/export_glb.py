# Writes the supercar's glb from its scene: the car only, modifiers applied, no studio, no cutters.
# Run it after supercar.py, which builds the scene, in the same Blender:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#       --python games/arcaderacer/assets/supercar/supercar.py \
#       --python games/arcaderacer/assets/supercar/export_glb.py [-- out.glb]
# or on the saved scene, `Blender -b supercar.blend --python export_glb.py [-- out.glb]`. It writes
# the plain glb Blender exports, to `out.glb` when given, else supercar.glb beside itself; `yarn bake
# arcaderacer` packs it into the game (`arcaderacer.bake.ts`).
import bpy, os, sys

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = ARGS[0] if ARGS else os.path.join(os.path.dirname(os.path.abspath(__file__)), "supercar.glb")
sc = bpy.data.scenes["supercar"]
if bpy.context.window_manager.windows:
    bpy.context.window_manager.windows[0].scene = sc
vl = sc.view_layers[0]
for ob in sc.objects:
    ob.select_set(False, view_layer=vl)
root = sc.objects["supercar"]
# the boolean cutters are named car.sc_*: they cut the body and doors and are never drawn
keep = [root] + [o for o in root.children_recursive if "sc_" not in o.name]
for ob in keep:
    ob.hide_set(False, view_layer=vl)
    ob.select_set(True, view_layer=vl)
with bpy.context.temp_override(scene=sc, view_layer=vl):
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False)
print("GLB", out, os.path.getsize(out), "objects", len(keep))
