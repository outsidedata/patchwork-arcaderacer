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

// A skinned model's clips, held posed: `has(name)` whether the glb has an animation of that name, `pose(name, at)` the
// clip put `at` of the way through it, 0 its first key and 1 its last, 0.5 the pose it adds nothing at (it throws for a
// name the glb has not), and `apply()` the poses made since the last, put on the bones. A clip stays where it was posed
// until it is posed again, and clips add.
export type Rig = { has(name: string): boolean; pose(name: string, at: number): void; apply(): void }

export type Models = {
  unpack(bytes: Uint8Array): Promise<Unpacked>
  build(unpacked: Unpacked, own: Looks): THREE.Object3D | undefined
  twin(dark: string, lit: string): [number, number]
  rig(unpacked: Unpacked, mesh: THREE.Object3D): Rig
}

export function models(plugins: Plugins): Models {
  return {
    unpack,
    // The glb's animations as three plays them on `mesh`'s bones, each made when it is first posed and held paused so a car
    // poses it where its physics says: a bone's rotation a quaternion track, its translation or scale a vector track, linear
    // between keys. A clip is additive on the bones' bind pose, its middle key (`at` 0.5) the pose that adds nothing, so
    // clips that move one bone (a solid axle's two wheels) add up instead of averaging. A glb with no skin has no
    // animations (`unpack`), so its rig has none.
    rig(unpacked, mesh) {
      const T = plugins.render3d.THREE as typeof THREE
      const bones = (mesh as THREE.SkinnedMesh).skeleton?.bones ?? []
      const mixer = new T.AnimationMixer(mesh)
      const actions = new Map<string, { action: THREE.AnimationAction; seconds: number }>()
      const made = (name: string) => {
        const a = unpacked.animations.find(a => a.name === name)
        if (!a) throw new Error(`supershader3d: the model has no animation ${name}`)
        const tracks = a.tracks.map(t => {
          const bone = bones[t.joint].uuid
          return t.path === 'rotation'
            ? new T.QuaternionKeyframeTrack(`${bone}.quaternion`, t.times, t.values)
            : new T.VectorKeyframeTrack(`${bone}.${t.path === 'scale' ? 'scale' : 'position'}`, t.times, t.values)
        })
        const clip = new T.AnimationClip(name, -1, tracks)
        T.AnimationUtils.makeClipAdditive(clip, clip.duration / 2, clip, 1)
        const action = mixer.clipAction(clip)
        action.play()
        action.paused = true
        const made = { action, seconds: clip.duration }
        actions.set(name, made)
        return made
      }
      return {
        has: name => unpacked.animations.some(a => a.name === name),
        pose(name, at) {
          const c = actions.get(name) ?? made(name)
          c.action.time = at * c.seconds
        },
        apply: () => { mixer.update(0) },
      }
    },
    // The scene's look numbers of the materials `dark` and `lit`, a lamp's lens off and on. A model's vertices can be
    // moved from one to the other only where both are drawn in one call, so two in different calls throw.
    twin(dark, lit) {
      const looks: Looks | undefined = plugins.supershader3d.looks()
      if (!looks) throw new Error(`supershader3d: the twin of ${dark} was asked before the scene's looks file landed`)
      const ids = [dark, lit].map(m => {
        const id: number | undefined = plugins.supershader3d.idOf(m)
        if (id === undefined) throw new Error(`supershader3d: a lamp draws the material ${m}, which the scene's looks file does not hold`)
        return id
      })
      if (looks.materials[ids[0]].call !== looks.materials[ids[1]].call) throw new Error(`supershader3d: the lamp materials ${dark} and ${lit} are drawn in different calls (${looks.materials[ids[0]].call}, ${looks.materials[ids[1]].call}), so a model cannot change one for the other`)
      return [ids[0], ids[1]]
    },
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
