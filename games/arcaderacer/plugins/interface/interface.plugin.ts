// The interface: the game's things drawn in 3D over the race for ui3d to show (`plugins/ui3d`), and the
// words that move them (`interface.ui3d.ts`). Loaded by `shipped`, it hands out:
//
// `word(node, faceFinish, sideFinish, env?)`: the node `node` of the loader's model `title` (made by
// `assets/title/title.py`, one node per word, its faces' material named `face` and its walls' and
// bevel's `side`) made a word of its own: its geometry copied, its faces and sides each a material of
// its own set to a finish, reflecting `env`. A finish is { colour, metalness, roughness, env,
// clearcoat? }: `colour` one colour, or [bottom, top], a gradient up the word's capitals, laid in the
// word's own copy of its geometry's colours. It hands back { node, face, side }, and the word's
// geometries and materials are let go with `letGo(word)`.
// `finish(material, finish)`: the finish set on a material again, as a word's look sets it each frame.
// `environment(env)`: what the finishes reflect, a sphere seen from inside, coloured from `ground` below
// to `horizon` at the level and `sky` above, with a band of `band` round the level `width` radians tall
// (so chrome shows a bright line across it, as polished metal does), `size` metres across, drawn through
// the renderer's PMREM; undefined with no renderer (in node), and the finishes reflect nothing.
//
// Every number is the definition's of the kind whose look calls it.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { environment, finish, made } from './interface.ui3d.ts'

export type Finish = { colour: string | string[]; metalness: number; roughness: number; env: number; clearcoat?: number }
export type Env = { sky: string; horizon: string; ground: string; band: string; width: number; size: number }
export type Word = { node: THREE.Object3D; face: THREE.MeshPhysicalMaterial; side: THREE.MeshPhysicalMaterial; geometries: THREE.BufferGeometry[] }


function iface() {
  let plugins: Plugins | undefined
  const three = () => plugins!.render3d.THREE as typeof THREE

  const me = {
    tick(p: Plugins) { plugins = p },
    word(root: THREE.Object3D, node: string, faceFinish: Finish, sideFinish: Finish, env?: THREE.Texture): Word {
      return made(three(), root, node, faceFinish, sideFinish, env)
    },
    letGo(w: Word) {
      w.face.dispose()
      w.side.dispose()
      for (const g of w.geometries) g.dispose()
    },
    finish,
    environment(E: Env): THREE.Texture | undefined {
      return environment(three(), plugins!.render3d.renderer, E)
    },
  }
  return me
}

export { iface as interface }
export type Interface = ReturnType<typeof iface>
