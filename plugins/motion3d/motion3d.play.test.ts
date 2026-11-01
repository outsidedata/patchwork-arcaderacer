// motion3d's playing on a scene this test writes, `world.motion3d.kinds` with one body, its rig file and
// its motion3d file handed to the loader: a pose, its clip held at its frame, faded into as a clip is.
import { expect, test } from 'vitest'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import { animate, play, pose } from './motion3d.play.ts'

const measure = (dur: number) => ({ dur, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [dur, 0, 0, 0]] })
const RIG = {
  clips: { idle: { loop: true }, kick: {} },
  roles: {},
  table: { idle: measure(2), kick: measure(1.2) },
  poses: { chamber: { clip: 'kick', frame: 12, at: 0.4 }, extend: { clip: 'kick', frame: 21, at: 0.7 } },
}
const READS = { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' }

function world() {
  written('test/motion3d-play/rig.json', JSON.stringify(RIG))
  written('test/motion3d-play/motion.json', JSON.stringify({ moves: 0.05, turns: 30 }))
  const asset = (url: string) => ({ type: 'json', url, preload: true })
  const scene: Scene = {
    world: {
      motion3d: { kinds: { body: { rig: 'rig', motion: 'motion', model: 'model', fade: 0.2, reads: READS } } },
      loader: { assets: { rig: asset('test/motion3d-play/rig.json'), motion: asset('test/motion3d-play/motion.json') } },
    },
    prefabs: { loader: {}, body: { pos: [0, 0, 0], yaw: 0 }, probe: {} },
    actors: [{ is: 'loader' }, { is: 'body' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(scene, { loader, body: {}, probe: { before(_me, _dt, got) { w = got } } })
  t.step(0)
  const row = t.rows.find(r => r.kind === 'body') as Row
  return { w, row, d: row.data, step: () => animate(row, w, 1 / 60) }
}

test('a pose is its clip held at its frame: the playhead at its time, not moving, and faded into as a clip is', () => {
  const { w, row, d, step } = world()
  play(row, 'idle')
  step()
  pose(row, w, 'chamber')
  expect([d.clip, d.clipT, d.rate, d.state, d.from, d.blend]).toEqual(['kick', 0.4, 0, 'act', 'idle', 0])
  for (let i = 0; i < 120; i++) step()
  expect([d.clip, d.clipT, d.state, d.blend]).toEqual(['kick', 0.4, 'act', 1])
  // A pose of the same clip fades from the one before it, at its own time.
  pose(row, w, 'extend')
  expect([d.clip, d.clipT, d.from, d.fromT, d.blend]).toEqual(['kick', 0.7, 'kick', 0.4, 0])
  expect(() => pose(row, w, 'dab')).toThrow('motion3d: body\'s rig has no pose dab')
})
