// The browser half of world3d (`world3d.sim.ts` says what world3d is and every part of a place): it draws the scene's
// place, plays its moving things and burns its effects. It builds on render3d, supershader3d, particle3d and the
// loader, which it takes out of `plugins`.
//
// The place. On its first tick it reads the place's clips and effects (each a preloaded `json` entry) and starts the
// glb's (`binary`); once the glb has landed and supershader3d's looks file has, it unpacks the glb and assembles it
// (supershader3d's `supershader3d.glb.ts`), each call drawn by supershader3d's material for it, writes the course table's rows, and adds
// the mesh to render3d's scene, casting and taking shadows. A call supershader3d has no material for throws, naming
// it. `close` takes it away and disposes its geometry, its skeleton and its mixer's cache.
//
// The course table. The wall looks read each row's course feet (its courses' heights off the ground) and its thing's
// walls' thickness from `csCourses`, a float texture of COURSES + 1 columns, a row for each thing and look that
// courses it, the row the vertex's slot `s2` names (its fourth number, % 256). `courses(three)` hands out the one
// table, made on its first call, ROWS rows so every row a vertex can name is there; the place's rows (its glb's extras'
// `courses`) are written into it as the place is built, and a place of more rows than ROWS throws. supershader3d binds
// it as its shared texture `courses` through world3d's mod (`world3d.supershader3d.ts`). `close` disposes it.
//
// The clips. Every clip of the place's clips file plays on its one mesh, by one mixer. Each whose `start` is on plays
// from the moment the place is built, looping where its `loop` says, and a clip that does not loop holds its last
// frame. Each tick the mixer goes on by the page's time since the tick before, or by `advance(seconds)`. A game starts
// and stops a clip by its thing's and its own name: `clip('tavern/tavern fan', 'spin', true)`, `false` to stop it.
// Stopped, the thing stands where it was; started again, it goes on from there. A clip asked for before the place is
// built, or by a name the place has not, throws. `only(clip)` plays that clip of every thing that has it, from its
// start, whether it starts on or off, and stops every other, its things standing at rest; a clip no thing has throws.
// `clips()` is every clip the place has, `{ thing, clip, start, loop }`,
// none before it is built. `hold(seconds)` stands every clip playing at that time into it (a clip that does not loop
// past its end holding its last frame) and the mixer goes on no more, a shot of one moment; `hold()` lets it go on
// again from there.
//
// The joints. The clips file's `joints` are the bones a game turns with no clip (`Joint`, `world3d.place.ts`).
// `pose(thing, bone, degrees)` turns one that far from rest about its axis, and every joint it drives (its `couple`)
// `ratio` times as far, each held within its range; from the first pose on, every posed joint stands so after the
// clips each tick. A joint the place has not, one driven by another, or a turn past its range throws. `joints()` is
// every joint the place has.
//
// The hair. A scene listing hair3d grows the hair the place's kit things grow (its `hairs` part, `world3d.sim.ts`) on
// world3d's one wearer, `world3d`, of the kind `world3d`, through world3d's `skins` mod (`world3d.hair3d.ts`) and
// render3d's `behaviors`: `wearers()` hands it, once the place is built, with a skin for each part that grows hair,
// `{ skinned }`, a three SkinnedMesh named `<row> <part>` (which a hair's `on.meshes` matches), drawn by nothing, of
// that part's triangles of the kit mesh as the glb has them, on the place's own skeleton, so its hair is carried as
// the clips and the joints move the part. A part with no triangle in the kit mesh throws, naming it. A scene not
// listing hair3d never reads the part; `wearers()` is none until the place is built.
//
// The effects. Each spawn of the place's effects file is emitted through particle3d, at its point along its way, for
// ever, on the first tick particle3d holds every effect the spawns name. A spawn with a `node` goes with that joint of
// the place's skin: every tick, once the place is built, its effect's point and way are the spawn's carried by how far
// the joint stands from its rest (its world matrix times its inverse bind matrix), after the clips and the poses, so a
// lamp on a folding arm or a drone carried round a conveyor goes with it. A node the skin has not throws, naming it.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import type { Looks } from '#plugins/supershader3d/supershader3d.plugin.ts'
import { entry } from './world3d.sim.ts'
import { assemble, unpack, type CourseRow, type Unpacked } from '#plugins/supershader3d/supershader3d.glb.ts'
import { played, type Clips, type Grow, type Joint, type Played, type Spawn } from './world3d.place.ts'
import type { Wearer } from '#plugins/hair3d/hair3d.sim.ts'
import type { Effect } from '#plugins/particle3d/particle3d.plugin.ts'

export const COURSES = 256
export const ROWS = 256

export function world3d() {
  let started = false
  let gone = false
  // the place unpacked, waiting for supershader3d's looks file, and its clips
  let waiting: Unpacked | undefined
  let clips: Clips = { things: [] }
  let spawns: Spawn[] = []
  // each emitted effect a joint carries: the effect, its spawn's point and way at rest, its node and that node's bone's
  // number in the skeleton once the place is built
  let follows: { fx: Effect; at: number[]; dir?: number[]; node: string; bone?: number }[] = []
  let mesh: THREE.Mesh | undefined
  let table: THREE.DataTexture | undefined
  let data: Float32Array | undefined
  let mixer: THREE.AnimationMixer | undefined
  let actions = new Map<string, Played>()
  let last: number | undefined
  // the moment the clips are held at, undefined while they play on
  let held: number | undefined
  // each posed joint's degrees, by its number among the skin's joints, and every bone's rest
  const posed = new Map<number, number>()
  let rests: THREE.Quaternion[] = []
  let turn: THREE.Quaternion | undefined
  let axis: THREE.Vector3 | undefined
  // the parts that grow hair, as the hairs file has them, and each a SkinnedMesh of its triangles, made as the place is
  // built
  let grows: Grow[] = []
  let hairSkins: THREE.SkinnedMesh[] = []
  // the kit mesh's vertices among the place's: its first and how many
  let kit: { first: number; count: number } | undefined

  // each part that grows hair, its triangles out of the kit mesh's, its vertices numbered afresh, on the place's skeleton
  const grow = (T: typeof THREE, grows: Grow[]) => {
    const sk = (mesh as THREE.SkinnedMesh).skeleton
    if (!sk) throw new Error('world3d: the place grows hair and its glb has no skin to carry it')
    if (!kit) throw new Error('world3d: the place grows hair and its glb has no kit mesh')
    const g = mesh!.geometry
    const info = g.getAttribute('lookInfo'), pos = g.getAttribute('position'), nor = g.getAttribute('normal')
    const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight'), index = g.getIndex()!
    const done = new Set<string>()
    for (const grown of grows) {
      const name = `${grown.row} ${grown.part}`
      if (done.has(name)) continue
      done.add(name)
      const mine = (v: number) => v >= kit!.first && v < kit!.first + kit!.count && info.getY(v) === grown.row && info.getZ(v) === grown.number
      const from = new Map<number, number>(), tris: number[] = []
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2)
        if (!mine(a) || !mine(b) || !mine(c)) continue
        for (const v of [a, b, c]) {
          if (!from.has(v)) from.set(v, from.size)
          tris.push(from.get(v)!)
        }
      }
      if (!tris.length) throw new Error(`world3d: the hair ${grown.hair} of ${grown.thing} grows on its part ${grown.part}, and the kit mesh has no triangle of it`)
      const n = from.size
      const p = new Float32Array(n * 3), q = new Float32Array(n * 3), j = new Uint16Array(n * 4), w = new Float32Array(n * 4)
      for (const [v, k] of from) {
        p.set([pos.getX(v), pos.getY(v), pos.getZ(v)], k * 3)
        q.set([nor.getX(v), nor.getY(v), nor.getZ(v)], k * 3)
        j.set([si.getX(v), si.getY(v), si.getZ(v), si.getW(v)], k * 4)
        w.set([sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)], k * 4)
      }
      const geo = new T.BufferGeometry()
      geo.setAttribute('position', new T.BufferAttribute(p, 3))
      geo.setAttribute('normal', new T.BufferAttribute(q, 3))
      geo.setAttribute('skinIndex', new T.BufferAttribute(j, 4))
      geo.setAttribute('skinWeight', new T.BufferAttribute(w, 4))
      geo.setIndex(tris)
      const part = new T.SkinnedMesh(geo, new T.MeshBasicMaterial())
      part.name = name
      part.visible = false
      part.frustumCulled = false
      mesh!.add(part)
      part.bind(sk, new T.Matrix4())
      hairSkins.push(part)
    }
  }

  const jointOf = (thing: string, bone: string): Joint => {
    const j = clips.joints?.find(x => x.thing === thing && x.bone === bone)
    if (!j) throw new Error(`world3d: the place has no joint ${bone} of ${thing}; it has ${(clips.joints ?? []).map(x => `${x.bone} of ${x.thing}`).join(', ') || 'none'}`)
    return j
  }
  // every posable joint stood as posed: its own turn, or its driver's times its ratio, within its range
  const stand = () => {
    const bones = (mesh as THREE.SkinnedMesh | undefined)?.skeleton?.bones
    if (!posed.size || !bones || !turn || !axis) return
    for (const j of clips.joints ?? []) {
      const degrees = j.couple ? j.couple.ratio * (posed.get(j.couple.joint) ?? 0) : posed.get(j.joint)
      if (degrees === undefined) continue
      const d = Math.min(Math.max(degrees, j.range[0]), j.range[1])
      axis.set(j.axis[0], j.axis[1], j.axis[2])
      bones[j.joint].quaternion.copy(rests[j.joint]).multiply(turn.setFromAxisAngle(axis, (d * Math.PI) / 180))
    }
  }

  // every effect a joint carries set where its joint has it now
  let move: THREE.Matrix4 | undefined
  let p: THREE.Vector3 | undefined
  const carry = (T: typeof THREE) => {
    const sk = (mesh as THREE.SkinnedMesh | undefined)?.skeleton
    if (!follows.length || !sk) return
    move ??= new T.Matrix4()
    p ??= new T.Vector3()
    mesh!.updateMatrixWorld(true)
    for (const f of follows) {
      if (f.bone === undefined) {
        const k = sk.bones.findIndex(b => b.name === f.node)
        if (k < 0) throw new Error(`world3d: the effect ${f.fx.name} goes with the joint ${f.node}, which the place's skin has not`)
        f.bone = k
      }
      move.multiplyMatrices(sk.bones[f.bone].matrixWorld, sk.boneInverses[f.bone])
      p.set(f.at[0], f.at[1], f.at[2]).applyMatrix4(move)
      f.fx.at = [p.x, p.y, p.z]
      if (f.dir) {
        p.set(f.dir[0], f.dir[1], f.dir[2]).transformDirection(move)
        f.fx.dir = [p.x, p.y, p.z]
      }
    }
  }

  const find = (thing: string, clip: string) => {
    if (!mixer) throw new Error(`world3d: no place is animated, so no clip ${clip} of ${thing}`)
    const p = actions.get(`${thing}\n${clip}`)
    if (!p) throw new Error(`world3d: the place has no clip ${clip} of ${thing}; it has ${[...actions.values()].map(a => `${a.clip} of ${a.thing}`).join(', ') || 'none'}`)
    return p
  }

  const courses = (three: typeof THREE) => {
    if (!table) {
      data = new Float32Array((COURSES + 1) * ROWS)
      table = new three.DataTexture(data, COURSES + 1, ROWS, three.RedFormat, three.FloatType)
      table.minFilter = table.magFilter = three.NearestFilter
      table.needsUpdate = true
    }
    return table
  }

  const write = (three: typeof THREE, rows: CourseRow[]) => {
    if (rows.length > ROWS) throw new Error(`world3d: the place has ${rows.length} course rows, and the course table ${ROWS}`)
    const t = courses(three)
    const width = COURSES + 1
    rows.forEach((r, row) => {
      for (let c = 0; c < COURSES; c++) data![row * width + c] = c < r.feet.length ? r.feet[c] : 1e4 + c
      data![row * width + COURSES] = r.wallDepth
    })
    t.needsUpdate = true
  }

  const animate = (three: typeof THREE, m: THREE.AnimationMixer, made: Played[]) => {
    mixer = m
    for (const p of made) {
      const key = `${p.thing}\n${p.clip}`
      if (actions.has(key)) throw new Error(`world3d: the place has the clip ${p.clip} of ${p.thing} twice`)
      actions.set(key, p)
      p.action.setLoop(p.loop ? three.LoopRepeat : three.LoopOnce, Infinity)
      p.action.clampWhenFinished = !p.loop
      if (p.start) p.action.play()
    }
  }

  const build = (plugins: Plugins, town: Unpacked) => {
    const T = plugins.render3d.THREE as typeof THREE
    const looks: Looks = plugins.supershader3d.looks()
    write(T, town.info.courses)
    mesh = assemble(T, town, looks, call => {
      const material = plugins.supershader3d.material(call)
      if (!material) throw new Error(`world3d: the place draws ${call} triangles, and supershader3d has no ${call} material`)
      return material
    })
    mesh.castShadow = mesh.receiveShadow = true
    plugins.render3d.scene.add(mesh)
    rests = ((mesh as THREE.SkinnedMesh).skeleton?.bones ?? []).map(b => b.quaternion.clone())
    const k = town.info.vertex.meshes.indexOf('kit')
    kit = k < 0 ? undefined : { first: town.meshes.slice(0, k).reduce((n, m) => n + m.count, 0), count: town.meshes[k].count }
    if (grows.length) grow(T, grows)
    turn = new T.Quaternion()
    axis = new T.Vector3()
    if (clips.things.length) {
      const m = new T.AnimationMixer(mesh)
      animate(T, m, played(T, m, mesh, town, clips))
      if (held !== undefined) m.setTime(held)
    }
    stand()
  }

  const me = {
    courses,
    clip(thing: string, clip: string, on: boolean) {
      const { action } = find(thing, clip)
      if (!on) { action.paused = true; return }
      if (action.paused) action.paused = false
      if (!action.isRunning()) action.reset().play()
    },
    advance(seconds: number) {
      if (held === undefined) mixer?.update(seconds)
      stand()
    },
    clips: () => [...actions.values()].map(({ thing, clip, start, loop }) => ({ thing, clip, start, loop })),
    only(clip: string) {
      const of = [...actions.values()].filter(p => p.clip === clip)
      if (!of.length) throw new Error(`world3d: no thing of the place has a clip ${clip}; the clips: ${[...new Set([...actions.values()].map(p => p.clip))].join(', ') || 'none'}`)
      for (const p of actions.values()) if (p.clip !== clip) p.action.stop()
      for (const p of of) { p.action.paused = false; p.action.reset().play() }
      if (held !== undefined) mixer!.setTime(held)
      stand()
    },
    hold(seconds?: number) {
      if (seconds !== undefined && !(seconds >= 0)) throw new Error(`world3d: hold is a number of seconds, 0 or more, not ${seconds}`)
      held = seconds
      if (seconds !== undefined) mixer?.setTime(seconds)
      stand()
    },
    joints: (): readonly Joint[] => clips.joints ?? [],
    wearers: (): Wearer[] => (hairSkins.length ? [{ id: 'world3d', kind: 'world3d', skins: hairSkins.map(skinned => ({ skinned })) }] : []),
    pose(thing: string, bone: string, degrees: number) {
      const j = jointOf(thing, bone)
      if (j.couple) throw new Error(`world3d: the joint ${bone} of ${thing} is driven by its linkage, not posed alone`)
      if (!(degrees >= j.range[0] && degrees <= j.range[1])) throw new Error(`world3d: the joint ${bone} of ${thing} turns ${j.range[0]} to ${j.range[1]} degrees, not ${degrees}`)
      posed.set(j.joint, degrees)
      stand()
    },
    tick(plugins: Plugins) {
      if (!started) {
        started = true
        const world = plugins.wire.scene.world ?? {}
        clips = json(plugins.wire, entry(world, 'clips')) as Clips
        if (plugins.wire.scene.plugins?.includes('hair3d')) grows = (json(plugins.wire, entry(world, 'hairs')) as { grows: Grow[] }).grows
        spawns = (json(plugins.wire, entry(world, 'effects')) as { spawns: Spawn[] }).spawns
        plugins.loader.load(entry(world, 'glb')).then(async (glb: { bytes: Uint8Array }) => {
          const town = await unpack(glb.bytes)
          if (!gone) waiting = town
        })
      }
      if (spawns.length && spawns.every(s => plugins.particle3d.has(s.effect))) {
        for (const s of spawns) {
          const fx: Effect = plugins.particle3d.emit(s.effect, s.at, { dir: s.dir, life: Infinity })
          if (s.node) follows.push({ fx, at: [...s.at], dir: s.dir && [...s.dir], node: s.node })
        }
        spawns = []
      }
      if (waiting && plugins.supershader3d.looks()) {
        const town = waiting
        waiting = undefined
        build(plugins, town)
      }
      const now = performance.now()
      if (last !== undefined) me.advance((now - last) / 1000)
      last = now
      carry(plugins.render3d.THREE as typeof THREE)
    },
    close(plugins: Plugins) {
      gone = true
      waiting = undefined
      mixer?.stopAllAction()
      if (mesh) {
        plugins.render3d.scene.remove(mesh)
        mesh.geometry.dispose()
        mixer?.uncacheRoot(mesh)
        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) (mesh as THREE.SkinnedMesh).skeleton.dispose()
      }
      mesh = undefined
      mixer = undefined
      actions = new Map()
      held = undefined
      posed.clear()
      rests = []
      for (const part of hairSkins) part.geometry.dispose()
      hairSkins = []
      grows = []
      kit = undefined
      follows = []
      table?.dispose()
      table = undefined
      data = undefined
    },
  }
  return me
}
