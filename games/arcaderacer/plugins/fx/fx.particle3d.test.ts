// fx's sources for particle3d, read off racers on the game's own definitions and course: particle3d takes the
// game's effects file with the scene's attachments; a racer held on the throttle on the grid burns out at
// every rear tyre and lays no skid smoke, and one pulling away has burnt out less as it goes; a drifting
// racer skids; a racer scraping a wall throws from its side as a wall; and a boost grown since the last
// frame fx drew is paid once at the tail.
import { expect, test } from 'vitest'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { check, type Source } from '#plugins/particle3d/particle3d.plugin.ts'
import { sim } from '../../arcaderacer.sim.ts'
import file from '../../arcaderacer.scene.json' with { type: 'json' }
import defs from '../../assets/arcaderacer.json' with { type: 'json' }
import effects from '../../assets/fx/effects.json' with { type: 'json' }
import { sources } from './fx.particle3d.ts'

const base = new URL('../../', import.meta.url).href
// the tokyo course's world, as the game's manager boots it
let world: Record<string, any>
const racer = (id: number, data: Record<string, any>): Row => ({
  id, kind: 'car',
  data: { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, vel: [0, 0], spin: 0, speed: 0, drift: 0, slip: 0, throttle: 0, brake: 0, held: 0, boost: 0, scrape: 99, seg: 0, car: 'jeep_tj', ...data },
} as Row)
const seen = (rows: Row[], boosts: Record<number, number> = {}): Source[] =>
  sources({ wire: { scene: { world }, rows }, fx: { boosts: (id: number) => boosts[id] } } as unknown as Plugins)
const on = (list: Source[], word: string) => list.filter(s => s.on === word)

test('the sources drive the effects as the racers go', async () => {
  world = (await load(boot(structuredClone(file) as Scene, sim), base)).get('tokyo')!.world
  expect(() => check(effects as any, world.particle3d, {}, world)).not.toThrow()

  // held on the throttle, standing on the grid: a burnout at both rear tyres, no skid
  const grid = seen([racer(1, { throttle: 1 })])
  expect(on(grid, 'wheel').map(s => s.drivers.burnout)).toEqual([1, 1])
  expect(on(grid, 'wheel').map(s => s.drivers.skid)).toEqual([0, 0])
  expect(on(grid, 'side')).toEqual([])
  // pulling away at half the launch speed: half the burnout; at the launch speed, none
  const launch = defs.car.fx.burnout.launch
  expect(on(seen([racer(1, { throttle: 1, speed: launch / 2, vel: [0, launch / 2] })]), 'wheel')[0].drivers.burnout).toBeCloseTo(0.5)
  expect(on(seen([racer(1, { throttle: 1, speed: launch, vel: [0, launch] })]), 'wheel')[0].drivers.burnout).toBe(0)

  // drifting at 30 m/s with 0.5 rad of slip: past the smoke's 0.2
  const drift = on(seen([racer(1, { throttle: 1, speed: 30, vel: [0, 30], drift: 1, slip: 0.5 })]), 'wheel')
  expect(drift[0].drivers.skid).toBeCloseTo(0.5 / defs.car.fx.smoke.slip - 1)

  // boosting: embers at both rear tyres while the boost holds and the racer is past the trail's least speed
  const trail = defs.car.fx.trail.least
  const fast = { speed: trail + 1, vel: [0, trail + 1] }
  expect(on(seen([racer(1, { ...fast, boost: 1 })]), 'wheel').map(s => s.drivers.boosting)).toEqual([1, 1])
  expect(on(seen([racer(1, { ...fast, boost: 0 })]), 'wheel').map(s => s.drivers.boosting)).toEqual([0, 0])
  expect(on(seen([racer(1, { speed: trail / 2, vel: [0, trail / 2], boost: 1 })]), 'wheel').map(s => s.drivers.boosting)).toEqual([0, 0])

  // scraping, alone on the road: off a wall
  const side = on(seen([racer(1, { speed: 30, vel: [0, 30], scrape: 0 })]), 'side')
  expect(side.map(s => s.drivers.racer)).toEqual([0])

  // the pop: paid the frame the boost grows past what fx last drew, and not before fx has drawn it
  const boosted = [racer(1, { speed: 30, vel: [0, 30], boost: 1 })]
  expect(on(seen(boosted, { 1: 0.5 }), 'tail')[0].drivers.paid).toBe(1)
  expect(on(seen(boosted, { 1: 1 }), 'tail')[0].drivers.paid).toBe(0)
  expect(on(seen(boosted), 'tail')[0].drivers.paid).toBe(0)
})
