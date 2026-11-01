// A Mixamo clip laid on another body as anim's export lays it (`plugins/anim/anim.export.py`), shared by
// the workshop's page (a pack clip tried on a body before it is baked) and the pose lab (a pose taken
// from a frame of a clip). Bones are matched by name without the `mixamorig…` prefix, which differs
// between packs and bodies.
//   boneName(name)   the name without its prefix
//   restOf(root)     each bone's rest under `root`, by its name without the prefix: its own name, its
//                    turn and its place in its parent's frame
//   retarget(clip, from, onto, name)   the clip, made on the bones `from`, laid on the bones `onto`: each
//                    bone's turn on each key taken as a turn from its rest in `from` and laid on its rest
//                    in `onto`; the hips keep their travel, scaled by the two hip heights; every other bone
//                    keeps the body's own length
import * as THREE from 'three'

export const boneName = (name: string) => name.replace(/^mixamorig\d*:?/, '')

export type Rest = Map<string, { name: string; quaternion: THREE.Quaternion; position: THREE.Vector3 }>

export const restOf = (root: THREE.Object3D): Rest => {
  const r: Rest = new Map()
  root.traverse(o => { if ((o as THREE.Bone).isBone && !r.has(boneName(o.name))) r.set(boneName(o.name), { name: o.name, quaternion: o.quaternion.clone(), position: o.position.clone() }) })
  return r
}

export function retarget(c: THREE.AnimationClip, from: Rest, onto: Rest, name: string) {
  const tracks: THREE.KeyframeTrack[] = []
  for (const track of c.tracks) {
    const dot = track.name.lastIndexOf('.')
    const bone = boneName(track.name.slice(0, dot)), what = track.name.slice(dot + 1)
    const a = from.get(bone), b = onto.get(bone)
    if (!a || !b) continue
    if (what === 'quaternion') {
      const v = track.values.slice(), q = new THREE.Quaternion(), inv = a.quaternion.clone().invert()
      for (let i = 0; i < v.length; i += 4) q.fromArray(v, i).premultiply(inv).premultiply(b.quaternion).toArray(v, i)
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, track.times, v))
    } else if (what === 'position' && bone === 'Hips') {
      const k = Math.abs(a.position.y) > 1e-6 ? b.position.y / a.position.y : 1
      const v = track.values.slice(), p = new THREE.Vector3()
      for (let i = 0; i < v.length; i += 3) p.fromArray(v, i).sub(a.position).multiplyScalar(k).add(b.position).toArray(v, i)
      tracks.push(new THREE.VectorKeyframeTrack(`${b.name}.position`, track.times, v))
    }
  }
  return new THREE.AnimationClip(name, c.duration, tracks)
}
