// parts.ts: every part box3dvehicle draws of a vehicle's solid axles (`look.solid`), in every state
// look.py checks them in, written as JSON for look.py to read.
//
//   node --experimental-strip-types plugins/box3dvehicle/truck/parts.ts <scene.json> <vehicle> <outdir>
//
// <vehicle> is a vehicle of `world.box3dvehicle.vehicles` in <scene.json> whose look has `solid`.
// It writes <outdir>/<vehicle>-parts.json: for each axle and each state, its two wheels' middles in
// the chassis's frame and their steering, and the parts `solidParts` (`box3dvehicle.sim.ts`) places
// for them, the very function the page draws them with. The states: both wheels at rest (`sag`),
// both pushed in full (`bump`), both hanging at full droop (`droop`), and the axle crossed, one wheel
// pushed in full and the other at full droop each way (`crossL`, the left pushed in, and `crossR`);
// and on a steered axle each of those at full lock each way too.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { corners, solidParts, wheelAt, type Vehicle } from '../box3dvehicle.sim.ts'

const [file, name, out] = process.argv.slice(2)
const scene = JSON.parse(readFileSync(file, 'utf8'))
const v: Vehicle = scene.world.box3dvehicle.vehicles[name]
if (!v?.look.solid) throw new Error(`${file}'s vehicle ${name} has no look.solid`)
const cs = corners(v)
const states = []
for (const [i, axle] of v.axles.entries()) {
  const [l, r] = [cs.find(c => c.axle === axle && c.side < 0)!, cs.find(c => c.axle === axle && c.side > 0)!]
  const { sag, travel } = axle.spring
  const pushes: [string, number, number][] = [['rest', sag, sag], ['bump', travel, travel], ['droop', 0, 0], ['crossL', travel, 0], ['crossR', 0, travel]]
  // a steered axle behind the middle of the wheelbase turns its wheels the other way
  const lock = axle.steered ? v.steering.angle * (axle.at >= 0 ? 1 : -1) : 0
  const steers: [string, number][] = lock ? [['', 0], ['+lock', lock], ['-lock', -lock]] : [['', 0]]
  for (const [push, cl, cr] of pushes) for (const [turned, steer] of steers) {
    const left = wheelAt(l, cl), right = wheelAt(r, cr)
    states.push({
      axle: i, name: push + turned,
      wheels: [{ side: -1, centre: left, steer, rise: cl - sag }, { side: 1, centre: right, steer, rise: cr - sag }],
      parts: solidParts(v, i, left, right, steer, steer),
    })
  }
}
mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${name}-parts.json`), JSON.stringify({ vehicle: name, states }))
console.log(`PARTS ${name} states=${states.length} parts=${states.map(s => s.parts.length).join(',')} -> ${join(out, `${name}-parts.json`)}`)
