// box3dvehicle's extension: the Vehicle panel.
//
// The panel (`box3dvehicle.components.tsx`) works on the cars of the scene `ed.focus` says: the one
// selected, else the one the game view shows, else the first scene with a box3dvehicle row or a
// `world.box3dvehicle`. It has two halves:
//   - the cars as they run: a car picked from the scene's `box3dvehicle` rows, and its `throttle`,
//     `brake` and `steer` on sliders, each set on the live row through the recorder from the step
//     shown on, as one undo; a value being dragged shows on the row until it is let go. Beside them,
//     its suspension as the row reports it, a meter a wheel: how far the spring is pushed in, from
//     full droop to the end of its travel, with a tick where it rests, the load on it, and whether
//     the wheel is on the ground;
//   - the cars as they are written: `world.box3dvehicle` in the file that holds it (`focus`'s
//     `worldFile`), each value written on its own as one undo when it is let go, and shown on the
//     scene's `world` while it is dragged, the look drawn from it at once and the bodies made from it
//     when it is written. Above it, what each axle's numbers make of the picked car's vehicle standing still
//     (`ride`) in the gravity the scene's `world.box3dvehicle.mods.gravity` hands the cars' rule:
//     how often it bounces there, its dampers' ratios to critical, each wheel's load and the gap
//     under the body; or, in a scene that names no gravity, that it names none (`WEIGHTLESS`).
//
// The grid shows every field the file's `world.box3dvehicle` holds, a vehicle's `look.model` among
// them: its `at` as three numbers and its `scale` as a number, as the look's other fields, and its
// `asset` as a field of its own type, `box3dvehicle.model` (bound to `vehicles.*.look.model.asset`),
// a choice of the `model` entries of the scene's loader catalogue (`modelChoices`), the name there
// marked when it is none of them.
//
// What the panel's sliders, its readouts and its grid do is done by functions here, which they and
// the commands call alike: a car's inputs set by `drive`, its suspension read by `suspension`, and a
// value of the design written as the editor's `worldGridEdits` holds a grid's fields, a model's
// `asset` refused unless it names a `model` entry of the catalogue (`unmodelled`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here, on
// any scene with cars, whatever the game view shows, since all of it is the rows and the files:
//   vehicle.state   a scene's cars, each with its vehicle and inputs, and what each axle's numbers
//                   make of each vehicle of the fleet standing still, as the panel's ride shows it; or one car: its inputs and its
//                   suspension, a wheel at a time, with the same;
//   vehicle.drive   a car's throttle, brake and steer set on the live row from this step on, as the
//                   sliders set them;
//   vehicle.design  values of the scene's `world.box3dvehicle` written, each a field the grid shows,
//                   of the shape of the one there, a model's `asset` a `model` entry of the scene's
//                   catalogue.
// Each write is one undo, answering the state it left.
import { z } from 'zod'
import { reading, worldGridEdits, written, type Edits, type Editor } from '#editor/editor.ts'
import type { Row, Truth } from '#engine/engine.ts'
import { entriesOf } from '#plugins/loader/loader.extension.tsx'
import { ModelName, Vehicle as Panel } from './box3dvehicle.components.tsx'
import { corners, design, pull, ride, type Fleet, type Ride, type Vehicle } from './box3dvehicle.sim.ts'

export const KIND = 'box3dvehicle'
// What the ride says in place of its numbers in a scene whose `world.box3dvehicle.mods` names no
// gravity, which a car's weight is reckoned in.
export const WEIGHTLESS = 'world.box3dvehicle.mods names no gravity, which the ride is worked out in'

// How hard a truth's gravity pulls, as its cars' rule reckons it (`pull`), or undefined when its
// scene names none.
export const gravityOf = (t: Truth) => pull(reading(t, 'the Vehicle panel'))
// Each input a car's row carries, and the range a rule may set it in, to 1.
export const INPUTS = { throttle: -1, brake: 0, steer: -1 } as const
export type Input = keyof typeof INPUTS

// A corner's name: its axle, counted from the front of the list, and its side.
const cornerName = (i: number) => `axle ${Math.floor(i / 2)} ${i % 2 ? 'right' : 'left'}`

// A car's inputs set on its live row, from this step on, each an edit of `e`.
export function drive(e: Pick<Edits, 'editRow'>, scene: string, id: number, inputs: Partial<Record<Input, number>>) {
  for (const [field, v] of Object.entries(inputs)) if (v !== undefined) e.editRow(scene, id, [field], v)
}

// Each wheel's suspension as the car's row reports it, with the travel and the rest point of its
// spring; undefined until the car has stepped.
export function suspension(design: Vehicle, car: Row) {
  const d = car.data
  if (!d.compression) return undefined
  return corners(design).map((c, i) => ({
    wheel: cornerName(i), compression: d.compression[i] as number, load: d.load[i] as number, grounded: !!d.grounded[i],
    travel: c.axle.spring.travel, sag: c.axle.spring.sag,
  }))
}

// The cars of a truth: its box3dvehicle rows.
export const carsOf = (t: Truth) => t.rows.filter(r => r.kind === KIND)

// What each axle's numbers make of each vehicle of a truth's fleet standing still, by the vehicle's
// name, or `WEIGHTLESS` when its scene names no gravity.
export function rideOf(t: Truth): Record<string, ({ axle: number } & Ride)[]> | typeof WEIGHTLESS {
  const fleet = t.world[KIND] as Fleet | undefined
  if (!fleet) return {}
  const g = gravityOf(t)
  if (g === undefined) return WEIGHTLESS
  return Object.fromEntries(Object.entries(fleet.vehicles).map(([name, v]) => [name, ride(v, g).map((r, i) => ({ axle: i, ...r }))]))
}

// The type of the field a vehicle's `look.model.asset` is drawn as.
export const MODEL = 'box3dvehicle.model'
const MODEL_ASSET = /^vehicles\.[^.]+\.look\.model\.asset$/

// What a model field offers: each `model` entry of the catalogue, `models`, and the name it holds,
// marked when it is none of them.
export const modelChoices = (value: string, models: string[]) =>
  [...new Set([value, ...models])].map(n => ({ value: n, label: models.includes(n) ? n : `${n} (not in the catalogue)` }))

// Why `values`, by their paths in `world.box3dvehicle`, are refused: a model's `asset` that is no
// `model` entry of the catalogue, `models`; undefined when none is.
export function unmodelled(values: Record<string, unknown>, models: string[]): string | undefined {
  const bad = Object.entries(values).filter(([path, v]) => MODEL_ASSET.test(path) && !models.includes(v as string))
  if (!bad.length) return undefined
  return `${bad.map(([path, v]) => `${path} is ${JSON.stringify(v)}`).join(', ')}, and the catalogue's models are ${models.join(', ') || 'none'}`
}

// Car `id` of scene `scene`, refused naming the scene's cars.
function carOf(ed: Editor, scene: string, id: number): Row {
  const cars = carsOf(ed.sceneOf(scene, KIND))
  const car = cars.find(r => r.id === id)
  if (!car) throw new Error(`row ${id} of ${scene} is no car: its cars are ${cars.map(r => r.id).join(', ') || 'none yet'}`)
  return car
}

export function box3dvehicle(ed: Editor) {
  ed.panel({ id: 'box3dvehicle', title: 'Vehicle', area: 'right', component: Panel })
  ed.field(MODEL, ModelName)
  ed.bind(KIND, { 'vehicles.*.look.model.asset': MODEL })

  const scene = z.string().describe('a scene with cars')
  const id = z.number().int().describe('a car, by its row id')
  // A car as vehicle.state answers it.
  const shown = (name: string, car: Row) => {
    const t = ed.sceneOf(name)
    return {
      scene: name, id: car.id, vehicle: car.data.vehicle,
      ...Object.fromEntries(Object.keys(INPUTS).map(k => [k, car.data[k] ?? 0])),
      suspension: suspension(design(t.world, car), car) ?? 'the car reports its suspension once it has stepped',
      ride: rideOf(t),
    }
  }

  ed.command({
    id: 'vehicle.state',
    title: 'Vehicle: state',
    input: z.object({
      scene,
      id: id.optional().describe('one car, by its row id: its inputs and its suspension; every car\'s inputs when left out'),
    }).describe('The Vehicle panel\'s readouts: every car of a scene with its vehicle, throttle, brake and steer, and what each axle\'s numbers make of each vehicle of the fleet standing still in the scene\'s gravity (bounce hz, bump and rebound ratios to critical, load a wheel in N, clearance in m), or a note in its place when world.box3dvehicle.mods names no gravity; or one car, with the ride too and each wheel\'s spring compression (m), load (N), whether it is on the ground, its travel and its rest point.'),
    run: ({ scene, id }) => {
      const t = ed.sceneOf(scene, KIND)
      if (id !== undefined) return shown(scene, carOf(ed, scene, id))
      return { scene, cars: carsOf(t).map(r => ({ id: r.id, vehicle: r.data.vehicle, ...Object.fromEntries(Object.keys(INPUTS).map(k => [k, r.data[k] ?? 0])) })), ride: rideOf(t) }
    },
  })
  ed.command({
    id: 'vehicle.drive',
    title: 'Vehicle: drive',
    input: z.object({
      scene,
      id,
      throttle: z.number().min(INPUTS.throttle).max(1).optional().describe('-1 to 1, reverse to full'),
      brake: z.number().min(INPUTS.brake).max(1).optional().describe('0 to 1'),
      steer: z.number().min(INPUTS.steer).max(1).optional().describe('-1 to 1, positive turns left'),
    }).describe('Sets a car\'s inputs on its live row from this step on, as the Vehicle panel\'s sliders do: an edit the recording keeps, one undo. Answers the car as vehicle.state does.'),
    run: ({ scene, id, ...inputs }, e) => {
      carOf(ed, scene, id)
      if (Object.values(inputs).every(v => v === undefined)) throw new Error(`hand one of ${Object.keys(INPUTS).join(', ')} to set`)
      drive(e, scene, id, inputs)
      return shown(scene, carOf(ed, scene, id))
    },
  })
  ed.command({
    id: 'vehicle.design',
    title: 'Vehicle: design',
    input: z.object({
      scene: z.string().describe('a scene with a world.box3dvehicle'),
      values: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.array(z.number())])).describe('values by their paths in world.box3dvehicle joined by dots, as "vehicles.jeep.engine.final" or "vehicles.jeep.axles.0.at": numbers, booleans, strings, or lists of as many numbers'),
    }).describe('Writes values of a scene\'s world.box3dvehicle, as the Vehicle panel\'s grid does, the car made again from them: one undo, each refused unless it is a field the grid shows and of the shape of the one there, and a vehicle\'s look.model.asset unless it names a model entry of the scene\'s loader catalogue. Answers the design and each axle\'s ride.'),
    run: async ({ scene, values }, e) => {
      const { file, value: design } = ed.worldOf(scene, KIND)
      const edits = worldGridEdits(ed, KIND, file, design, values)
      const refused = unmodelled(values, entriesOf(ed, scene, 'model'))
      if (refused) throw new Error(refused)
      await written(e, edits)
      return { scene, file, design: ed.worldOf(scene, KIND).value, ride: rideOf(ed.sceneOf(scene)) }
    },
  })
}
