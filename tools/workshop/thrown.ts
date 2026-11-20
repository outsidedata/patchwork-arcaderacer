// The particle workshop's thrown source: one body thrown by box3d across the stage, bouncing on the
// ground, which an effect rides, put back and thrown again. It is a truth of its own on the page
// (`boot`), the box3d row and one `bomb` row, stepped by the seconds the page hands it, the bomb thrown
// by writing its `pos`, `rot`, `vel` and `spin`, which box3d pushes into its body because they differ
// from what it wrote. Every number is the stage file's `thrown` (`particles.stage.json`):
//   every  seconds from one throw to the next.
//   from   [x, y, z] metres where it is thrown from.
//   vel    [x, y, z] m/s it is thrown at.
//   spin   [x, y, z] rad/s it turns at as it leaves the hand.
//   body   the bomb, a box3d Body (`box3d.sim.ts`): its shapes, mass and how it bounces.
//   world  box3d's world (`world.box3d` without `kinds`): gravity, sub-steps, and `static`, the ground
//          it lands on, whose top is the stage's grid.
import { boot, type Row } from '#engine/engine.ts'
import { box3d, type Body, type World } from '#plugins/box3d/box3d.sim.ts'

export type Thrown = { every: number; from: number[]; vel: number[]; spin: number[]; body: Body; world: Omit<World, 'kinds'> }

export function thrown(t: Thrown) {
  const truth = boot({
    world: { box3d: { ...t.world, kinds: { bomb: t.body } } },
    prefabs: { box3d: {}, bomb: { pos: [...t.from], rot: [0, 0, 0, 1], vel: [...t.vel], spin: [...t.spin], awake: true } },
    actors: [{ is: 'box3d' }, { is: 'bomb' }],
  }, { box3d, bomb: {} })
  const bomb = (): Row => truth.rows.find(r => r.kind === 'bomb')!
  let since = 0
  return {
    every: t.every,
    // Seconds since the last throw.
    get since() { return since },
    // Back in the hand and thrown again.
    again() {
      Object.assign(bomb().data, { pos: [...t.from], rot: [0, 0, 0, 1], vel: [...t.vel], spin: [...t.spin] })
      since = 0
    },
    step(dt: number) {
      truth.step(dt)
      since += dt
    },
    get pos(): number[] { return bomb().data.pos },
    get rot(): number[] { return bomb().data.rot },
    get vel(): number[] { return bomb().data.vel },
  }
}
