// parts.ts: every part box3dvehicle draws of a vehicle's solid axles (`look.solid`) or independent
// suspension (`look.independent`), in every state look.py checks them in, written as JSON for look.py
// to read.
//
//   node --experimental-strip-types plugins/box3dvehicle/truck/parts.ts <scene.json> <vehicle> <outdir>
//
// <vehicle> is a vehicle of `world.box3dvehicle.vehicles` in <scene.json> whose look has `solid` or
// `independent`. It writes <outdir>/<vehicle>-parts.json: for each axle and each state, its two
// wheels' middles in the chassis's frame and their steering, and the parts `solidParts` or
// `independentParts` (`box3dvehicle.sim.ts`) places for them, the very functions the page draws them
// with. The states: both wheels at rest (`sag`), both pushed in full (`bump`), both hanging at full
// droop (`droop`), and the axle crossed, one wheel pushed in full and the other at full droop each
// way (`crossL`, the left pushed in, and `crossR`); and on a steered axle each of those at full lock
// each way too.
//
// With `independent`, each wheel also carries where it is drawn, `drawn` (its middle on the arc its
// arms give it) and `turn` (its turn from rest, by rows), each state the pairs of bodies joined to each
// other, `joints`, and a line is printed for each wheel in each state: OFFSET, how far the drawn
// wheel's middle sits from the physics wheel's (x along the car, y up, z out from its middle), its
// camber (degrees, negative with its top in toward the car's middle) and its steer against the
// physics wheel's (degrees, positive left).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { corners, independentParts, solidParts, steerOf, wheelAt, type Vehicle } from '../box3dvehicle.sim.ts'

const [file, name, out] = process.argv.slice(2)
const scene = JSON.parse(readFileSync(file, 'utf8'))
const v: Vehicle = scene.world.box3dvehicle.vehicles[name]
if (!v?.look.solid && !v?.look.independent) throw new Error(`${file}'s vehicle ${name} has no look.solid or look.independent`)
const cs = corners(v)
const states = []
const deg = (a: number) => (a * 180) / Math.PI
for (const [i, axle] of v.axles.entries()) {
  const [l, r] = [cs.find(c => c.axle === axle && c.side < 0)!, cs.find(c => c.axle === axle && c.side > 0)!]
  const { sag, travel } = axle.spring
  const pushes: [string, number, number][] = [['rest', sag, sag], ['bump', travel, travel], ['droop', 0, 0], ['crossL', travel, 0], ['crossR', 0, travel]]
  // a steered axle behind the middle of the wheelbase turns its wheels the other way
  const lock = axle.steered ? v.steering.angle * (axle.at >= 0 ? 1 : -1) : 0
  const steers: [string, number][] = lock ? [['', 0], ['+lock', lock], ['-lock', -lock]] : [['', 0]]
  for (const [push, cl, cr] of pushes) for (const [turned, steer] of steers) {
    const left = wheelAt(l, cl), right = wheelAt(r, cr), state = push + turned
    const wheels = [{ side: -1, centre: left, steer, rise: cl - sag }, { side: 1, centre: right, steer, rise: cr - sag }]
    if (v.look.solid) {
      states.push({ axle: i, name: state, wheels, parts: solidParts(v, i, left, right, steer, steer) })
      continue
    }
    const made = independentParts(v, i, left, right, steer, steer)
    const drawn = wheels.map((w, k) => ({ ...w, drawn: made.wheels[k].centre, turn: made.wheels[k].turn }))
    for (const w of drawn) {
      const d = w.drawn.map((x, j) => x - w.centre[j]), outward = w.turn.map(row => row[2] * w.side)
      console.log(`  OFFSET axle=${i} ${w.side < 0 ? 'L' : 'R'} ${state.padEnd(12)} x=${d[0].toFixed(3)} y=${d[1].toFixed(3)} z=${(d[2] * w.side).toFixed(3)} camber=${(-deg(Math.asin(outward[1]))).toFixed(2)} steer=${deg(steerOf(w.turn) - steer).toFixed(2)}`)
    }
    states.push({ axle: i, name: state, wheels: drawn, parts: made.parts, joints: made.joints })
  }
}
mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${name}-parts.json`), JSON.stringify({ vehicle: name, states }))
console.log(`PARTS ${name} states=${states.length} parts=${states.map(s => s.parts.length).join(',')} -> ${join(out, `${name}-parts.json`)}`)
