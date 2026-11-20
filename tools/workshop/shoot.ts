// One view of an effect played on a stage (`stage.ts`) from nothing to its moment, and drawn: the views page
// (`views.ts`) takes its pictures with it, and the scorer (`score.ts`) looks at its pixels, on the views page
// and on the particle workshop's own hidden stage (`particles.ts`, Score effect).
//
// `shooter(st, found, effects, more)` hands back `{ shoot, look }` for the stage `st` of the effects file
// `found`, playing `effects`, every effect by name, with the drivers and force generators `more` gives (the
// file's when it gives none). A view is
//
//   effect   the effect thrown.
//   camera   [x, y, z] where the camera stands, `target` [x, y, z] the point it looks at, `fov` its
//            vertical field of view in degrees.
//   preroll  the seconds the effect has run when it is drawn, stepped by the scene's `dt`, so the same
//            view is the same picture every time.
//   off, only   which layers are played, each `{ <effect>: [layer, ...] }`, a layer its place in its
//            effect's list from 0: `only` plays those layers of that effect and no others of it, `off`
//            plays every layer of it but those. An effect neither names is played whole. They reach
//            the effects an effect names and the effects its particles carry, by those effects' names.
//   at, dir, to, scale, seed   the spawn (particle3d's header): its point, the way a layer with no
//            `dir` throws, where a beam ends, its size, and what its rolls come from.
//   from     `still`, thrown from `at`; or `thrown`, riding the bomb box3d throws across the stage
//            (`thrown.ts`), thrown again with it every so many seconds, as the workshop's page does.
//   stage    whether the grid and the 1.8 m stick are drawn.
//   sky      an sRGB number, the colour behind the effect; the stage's own background when left out.
//   drawer   `particle3d` or `gpuparticle3d`, the plugin that steps and draws it (`stage.ts`'s `use`).
//
// The effect is thrown as the workshop's page throws it: a stream (`stage.ts`'s `streams`) with a life
// without end, any other as one burst. A view that asks for a picture not yet loaded (a sheet's page, a
// mesh's model) is played again once everything asked for has landed, so it is never drawn half loaded.
//
// `shoot(view)` plays it and leaves it drawn on the stage's canvas, handing back `{ particles, effects }`,
// how many particles and effects are in the air in it. `look(view)` does the same and hands back its pixels
// too, `pic`, read off the canvas the moment it is drawn.
import * as THREE from 'three'
import { streams, type Found, type stage } from './stage.ts'
import type { Effects, Layer } from '#plugins/particle3d/particle3d.plugin.ts'
import type { Picture } from './score.ts'

export type View = {
  effect: string; camera: number[]; target: number[]; fov: number; preroll: number
  off: Record<string, number[]>; only: Record<string, number[]>
  at: number[]; dir: number[]; to: number[]; scale: number; seed: number
  from: 'still' | 'thrown'; stage: boolean; sky?: number; drawer: 'particle3d' | 'gpuparticle3d'
}
export type Stage = Awaited<ReturnType<typeof stage>>

export function shooter(st: Stage, found: Found, effects: Record<string, Layer[]>, more?: Pick<Effects, 'drivers' | 'forceGenerators'>) {
  const { camera, toss } = st
  // the stage's own background, put back for every view that names no sky
  const background = st.three.background

  // One view played from nothing to its `preroll`, particle by particle as the game steps them.
  const play = (v: View) => {
    if (st.drawer !== v.drawer) st.use(v.drawer)
    const fx = st.fx
    fx.close(st.plugins)
    st.show(Object.fromEntries(Object.entries(effects).map(([n, layers]) =>
      [n, layers.filter((_, i) => (v.only[n] ? v.only[n].includes(i) : true) && !v.off[n]?.includes(i))])), more)
    camera.position.fromArray(v.camera)
    camera.fov = v.fov
    camera.lookAt(v.target[0], v.target[1], v.target[2])
    st.grid.visible = st.stick.visible = v.stage
    st.bomb.visible = v.from === 'thrown'
    st.three.background = v.sky === undefined ? background : new THREE.Color(v.sky)
    st.fit()
    st.tick()
    const stream = streams(effects, v.effect)
    let thrown = 0
    let riding: ReturnType<typeof fx.emit> | undefined
    const throwIt = () => {
      if (v.from === 'thrown') toss.again()
      const at = v.from === 'thrown' ? [...toss.pos] : [...v.at]
      // the stage's ground is y 0: a layer that bounces bounces off it, any other rests on it
      riding = fx.emit(v.effect, at, { life: stream ? Infinity : 0, scale: v.scale, dir: [...v.dir], to: [...v.to], floor: 0, seed: v.seed + thrown++ })
    }
    throwIt()
    // the step the effect is thrown on, then every step of its preroll
    st.step(found.dt)
    for (let n = Math.round(v.preroll / found.dt); n > 0; n--) {
      if (v.from === 'thrown') {
        toss.step(found.dt)
        if (toss.since >= toss.every - 1e-9) {
          for (const e of fx.effects) e.life = Math.min(e.life, e.age)
          throwIt()
        }
        riding!.at = [...toss.pos]
      }
      st.step(found.dt)
    }
  }

  const loading = () => { const { done, started } = st.loader.progress(); return done < started }
  // the canvas copied the moment it is drawn, before the browser shows it and clears it
  const copy = document.createElement('canvas')
  const pixels = (): Picture => {
    const c = st.canvas
    copy.width = c.width
    copy.height = c.height
    const ctx = copy.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(c, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
    return { width, height, data }
  }
  const drawn = async (v: View, read: boolean) => {
    if (!effects[v.effect]) throw new Error(`${found.file} has no effect ${v.effect}`)
    play(v)
    while (loading()) {
      while (loading()) {
        await new Promise(r => setTimeout(r, 50))
        st.tick()
      }
      play(v)
    }
    // drawn twice, so lights3d has every lamp the last step lit
    for (let i = 0; i < 2; i++) {
      st.tick()
      st.draw()
    }
    const pic = read ? pixels() : undefined
    return { particles: st.fx.count, effects: st.fx.effects.length, pic }
  }
  return {
    shoot: async (v: View) => { const { particles, effects } = await drawn(v, false); return { particles, effects } },
    look: async (v: View) => { const { particles, effects, pic } = await drawn(v, true); return { particles, effects, pic: pic! } },
  }
}
