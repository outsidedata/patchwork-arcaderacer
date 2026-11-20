// supershader3d's mod for box3dvehicle (`addons/scenemanager`'s mods), the page's. A scene with
// `world.box3dvehicle.mods: { models: 'supershader3d' }` has box3dvehicle draw every model a car's look names (its
// body, its wheels, its hubs) that names its own looks file as a pro-ng glb in the scene's one shader.
//
// `models(plugins)` is `{ unpack(bytes), build(unpacked, own) }`: `unpack` reads a glb (`supershader3d.glb.ts`);
// `build` assembles one mesh of it in supershader3d's calls, each drawn by the call's material, casting and taking
// shadows, or hands back undefined while the scene's looks file has not landed. A glb counts its materials as its
// own looks file lists them, `own` (pro-ng's build writes one beside each glb), and the scene's looks file counts
// them its own way, so each vertex's `lookId` is taken from the glb's numbering to the scene's by the material's
// name. A material the scene's looks file does not hold throws, naming it; so does a call it has no material for.
// supershader3d is listed before box3dvehicle, which box3dvehicle checks with `ahead`.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Call, Looks } from './supershader3d.plugin.ts'
import { assemble, unpack, type Unpacked } from './supershader3d.glb.ts'

export type Models = {
  unpack(bytes: Uint8Array): Promise<Unpacked>
  build(unpacked: Unpacked, own: Looks): THREE.Object3D | undefined
}

export function models(plugins: Plugins): Models {
  return {
    unpack,
    build(unpacked, own) {
      const looks: Looks | undefined = plugins.supershader3d.looks()
      if (!looks) return undefined
      const T = plugins.render3d.THREE as typeof THREE
      // each of the glb's material numbers as the scene's looks file counts it
      const to = own.materials.map(m => {
        const id: number | undefined = plugins.supershader3d.idOf(m.name)
        if (id === undefined) throw new Error(`supershader3d: a model draws the material ${m.name}, which the scene's looks file does not hold`)
        return id
      })
      const meshes = unpacked.meshes.map(m => {
        const from = m.inputs.lookId, lookId = new Float32Array(from.length)
        for (let i = 0; i < from.length; i++) lookId[i] = to[Math.round(from[i])]
        return { ...m, inputs: { ...m.inputs, lookId } }
      })
      const mesh = assemble(T, { ...unpacked, meshes }, looks, (call: Call) => {
        const material = plugins.supershader3d.material(call)
        if (!material) throw new Error(`supershader3d: a model draws ${call} triangles, and supershader3d has no ${call} material`)
        return material
      })
      mesh.castShadow = mesh.receiveShadow = true
      return mesh
    },
  }
}
