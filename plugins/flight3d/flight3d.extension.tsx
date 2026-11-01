// flight3d's extension: the Flight panel.
//
// The panel (`flight3d.components.tsx`) works on the planes of the scene `ed.focus` says: the one
// selected, else the one the game view shows, else the first scene with a flight3d row or a
// `world.flight3d`. It has two halves:
//   - the planes as they fly: a plane picked from the scene's `flight3d` rows, named with its type,
//     and its stick (`pitch`, `roll`, `yaw`), `throttle`, `airbrake` and `brake` on sliders, each set
//     on the live row through the recorder from the step shown on, as one undo; a value being dragged
//     shows on the row until it is let go. Beside them, what it is doing as its row says (flight3d's
//     `aero`): its speed and height, its angle of attack and sideslip, how stalled its wing is, and
//     whether it has crashed;
//   - the planes as they are written: `world.flight3d` in the file that holds it (`focus`'s
//     `worldFile`), every plane of its `planes` among it, each value written on its own as one undo
//     when it is let go, and shown on the scene's `world` while it is dragged, the planes drawn from it
//     at once and flown on it from the next step. Above it, what each plane's sheet makes of its
//     airframe (`price`, `topSpeed`, `stallSpeed`): its mass, its top speed and its stall speed at y = 0.
//
// What the panel's sliders, its readouts and its grid do is done by functions here, which they and
// the commands call alike: a plane's stick set by `fly`, what it is doing read by `flying`, the
// airframes priced by `priced`, and a value of the sheet written as the editor's `worldGridEdits`
// holds a grid's fields.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here, on
// any scene with planes, whatever the game view shows, since all of it is the rows and the files:
//   flight.state   a scene's planes, each with its type and stick, and what each sheet makes of its
//                  airframe; or one plane: its stick and what it is doing;
//   flight.stick   a plane's stick, throttle, airbrake and brakes set on the live row from this step
//                  on, as the sliders set them;
//   flight.design  values of the scene's `world.flight3d` written, each a field the grid shows, of
//                  the shape of the one there.
// Each write is one undo, answering the state it left.
import { z } from 'zod'
import { worldGridEdits, written, type Edits, type Editor } from '#editor/editor.ts'
import type { Row, Truth } from '#engine/engine.ts'
import { Flight as Panel } from './flight3d.components.tsx'
import { aero, airframeOf, stallSpeed, topSpeed, type Flight, type Plane } from './flight3d.sim.ts'

export const KIND = 'flight3d'
// Each input a plane's row carries, and the range a rule may set it in, to 1.
export const INPUTS = { pitch: -1, roll: -1, yaw: -1, throttle: 0, airbrake: 0, brake: 0 } as const
export type Input = keyof typeof INPUTS

// A plane's inputs set on its live row, from this step on, each an edit of `e`.
export function fly(e: Pick<Edits, 'editRow'>, scene: string, id: number, inputs: Partial<Record<Input, number>>) {
  for (const [field, v] of Object.entries(inputs)) if (v !== undefined) e.editRow(scene, id, [field], v)
}

// What a plane is doing, as its row says: its speed (m/s) and height (m), its angle of attack and
// sideslip (degrees), how much of its wing's flow has let go (0 to 1), and whether it has crashed.
export function flying(design: Flight, plane: Row) {
  const p = plane.data as Plane
  const now = aero(p, p, design, airframeOf(design, p.type), 0)
  return { speed: now.speed, height: p.pos[1], aoa: (now.aoa * 180) / Math.PI, slip: (now.slip * 180) / Math.PI, stall: now.stall, crashed: !!p.crashed }
}

// What each plane's sheet makes of its airframe, by the plane's name: its mass (kg), and its top and
// stall speeds (m/s) at y = 0.
export function priced(design: Flight) {
  return Object.fromEntries(Object.keys(design.planes).map(type => {
    const airframe = airframeOf(design, type)
    return [type, { mass: airframe.mass, topSpeed: topSpeed(airframe, design.air.density), stallSpeed: stallSpeed(airframe, design.gravity, design.air.density) }]
  }))
}
// How the panel shows one of them.
export const pricedText = (a: { mass: number; topSpeed: number; stallSpeed: number }) =>
  `${Math.round(a.mass)} kg · top speed ${a.topSpeed.toFixed(1)} m/s · stall ${a.stallSpeed.toFixed(1)} m/s`

// The planes of a truth: its flight3d rows that fly, which have a place.
export const planesOf = (t: Truth) => t.rows.filter(r => r.kind === KIND && r.data.pos)

// Plane `id` of scene `scene`, refused naming the scene's planes.
function planeOf(ed: Editor, scene: string, id: number): Row {
  const planes = planesOf(ed.sceneOf(scene, KIND))
  const plane = planes.find(r => r.id === id)
  if (!plane) throw new Error(`row ${id} of ${scene} is no plane: its planes are ${planes.map(r => r.id).join(', ') || 'none yet'}`)
  return plane
}

export function flight3d(ed: Editor) {
  ed.panel({ id: 'flight3d', title: 'Flight', area: 'right', component: Panel })

  const scene = z.string().describe('a scene with planes')
  const id = z.number().int().describe('a plane, by its row id')
  const inputsOf = (r: Row) => Object.fromEntries(Object.keys(INPUTS).map(k => [k, r.data[k] ?? 0]))
  // A plane as flight.state answers it.
  const shown = (name: string, plane: Row) => {
    const design = ed.sceneOf(name).world[KIND] as Flight | undefined
    return { scene: name, id: plane.id, type: plane.data.type, ...inputsOf(plane), ...(design && { now: flying(design, plane) }) }
  }

  ed.command({
    id: 'flight.state',
    title: 'Flight: state',
    input: z.object({
      scene,
      id: id.optional().describe('one plane, by its row id: its stick and what it is doing; every plane\'s stick when left out'),
    }).describe('The Flight panel\'s readouts: every plane of a scene with its type and its pitch, roll, yaw, throttle, airbrake and brake, and the airframe each plane\'s sheet makes, by plane (mass kg, top and stall speed m/s at y = 0); or one plane, with what it is doing now: speed m/s, height m, angle of attack and sideslip in degrees, stall 0 to 1, and whether it has crashed.'),
    run: ({ scene, id }) => {
      const t = ed.sceneOf(scene, KIND)
      if (id !== undefined) return shown(scene, planeOf(ed, scene, id))
      const design = t.world[KIND] as Flight | undefined
      return { scene, planes: planesOf(t).map(r => ({ id: r.id, type: r.data.type, ...inputsOf(r) })), ...(design && { airframes: priced(design) }) }
    },
  })
  ed.command({
    id: 'flight.stick',
    title: 'Flight: stick',
    input: z.object({
      scene,
      id,
      pitch: z.number().min(INPUTS.pitch).max(1).optional().describe('-1 to 1, positive pulls the nose up'),
      roll: z.number().min(INPUTS.roll).max(1).optional().describe('-1 to 1'),
      yaw: z.number().min(INPUTS.yaw).max(1).optional().describe('-1 to 1'),
      throttle: z.number().min(INPUTS.throttle).max(1).optional().describe('0 to 1'),
      airbrake: z.number().min(INPUTS.airbrake).max(1).optional().describe('0 to 1'),
      brake: z.number().min(INPUTS.brake).max(1).optional().describe('the wheel brakes, 0 to 1'),
    }).describe('Sets a plane\'s stick, throttle, airbrake and wheel brakes on its live row from this step on, as the Flight panel\'s sliders do: an edit the recording keeps, one undo. Answers the plane as flight.state does.'),
    run: ({ scene, id, ...inputs }, e) => {
      planeOf(ed, scene, id)
      if (Object.values(inputs).every(v => v === undefined)) throw new Error(`hand one of ${Object.keys(INPUTS).join(', ')} to set`)
      fly(e, scene, id, inputs)
      return shown(scene, planeOf(ed, scene, id))
    },
  })
  ed.command({
    id: 'flight.design',
    title: 'Flight: design',
    input: z.object({
      scene: z.string().describe('a scene with a world.flight3d'),
      values: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.array(z.number())])).describe('values by their paths in world.flight3d joined by dots, as "planes.cessna.airframe.maxThrust" or "planes.camel.gear.wheels.2.spring": numbers, booleans, strings, or lists of as many numbers'),
    }).describe('Writes values of a scene\'s world.flight3d, as the Flight panel\'s grid does, the planes flown on them from the next step: one undo, each refused unless it is a field the grid shows and of the shape of the one there. Answers the sheet and the airframe each plane\'s sheet makes.'),
    run: async ({ scene, values }, e) => {
      const { file, value: design } = ed.worldOf(scene, KIND)
      await written(e, worldGridEdits(ed, KIND, file, design, values))
      const now = ed.worldOf(scene, KIND).value
      return { scene, file, design: now, airframes: priced(now as unknown as Flight) }
    },
  })
}
