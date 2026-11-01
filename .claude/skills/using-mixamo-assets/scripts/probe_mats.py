# Every material of an FBX as Blender's importer makes it: each link into its Principled BSDF and the
# image behind it, and the BSDF's unlinked Metallic, Roughness, Specular IOR Level and Alpha.
#   Blender -b --factory-startup --python probe_mats.py -- <fbx>
import bpy, sys, json

p = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=p)
out = {}
for m in bpy.data.materials:
    if not m.node_tree:
        continue
    links = []
    for l in m.node_tree.links:
        fn = l.from_node
        links.append(f'{fn.bl_idname}:{getattr(getattr(fn, "image", None), "name", "")}.{l.from_socket.name} -> {l.to_node.bl_idname}.{l.to_socket.name}')
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    vals = {}
    if bsdf:
        for k in ('Metallic', 'Roughness', 'Specular IOR Level', 'Alpha'):
            s = bsdf.inputs.get(k)
            if s is not None and not s.is_linked:
                vals[k] = s.default_value
    out[m.name] = {'links': links, 'unlinked': vals}
print('MATS ' + json.dumps(out, indent=1))
