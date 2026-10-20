// ocean3d's extension: the Sea panel, and the types of the sea's fields.
//
// The panel (`ocean3d.components.tsx`) works on the sea of the scene selected, else of the one the
// game view shows, else of the first scene with an ocean3d row. It shows the sea's numbers, each in
// its range, and writes each into `world.ocean3d` of the file that gives it (`focus`'s `worldFile`),
// a value at a time, as one undo, when it is let go: the sea's numbers are no row's, so there is no
// live row to show a drag on. Each number says whether a change of it makes the spectrum again
// (`keyed` in `ocean3d.sim.ts`) or is read as it stands. `patches` that break the cascades' rule are
// refused with the sentence `bands` throws, and a `repeat` not above 0 is refused, each said in the
// panel and the console and written nowhere. Two charts: the drawn
// surface's height along 200 m through the camera, the way it looks, from the server's `waveAt` over
// the live rows, a few times a second, through the view's camera and over the ground the scene's
// `land` mod hands the sea there while the game view shows the scene, and else from the origin,
// looking along −z, over open ocean; and the
// energy of the spectrum's cells against their wavelength, each cascade's band shaded.
//
// What the panel's fields and charts do is done by functions here, which they and the commands call
// alike: a number held to its range and the sea's rules by `seaRefusal` (with `patchesRefusal` for
// the cascades) and written by `seaEdits`, the height chart's samples taken by `profile`, and the
// energy chart's by `energy`, from the numbers as the file gives them.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here, on
// any scene with a sea:
//   ocean.set       one of the sea's numbers written into `world.ocean3d`, held to what its field may
//                   be and refused as the panel refuses it; one undo, answering the numbers;
//   ocean.profile   the height chart's samples, through the view's camera while the game view shows
//                   the scene, a frame drawn first, which mounts the view's client where the editor's
//                   clock has drawn none yet; else from the origin, as the panel draws it then;
//   ocean.spectrum  the energy chart's bins and each cascade's band, from the sea's numbers alone,
//                   whatever the game view shows, the page let go between cascades.
//
// The types, wherever an ocean3d field is shown: windSpeed from 0 to 30 by 0.5, fetchKm 10–1000,
// swellScale 0–2, amp 0–3, chop 0–2, foamRecovery 0–2, shoalDepth 0–200 and shoalFloor 0–1 on
// sliders (`ocean3d.range`); seed a whole number from 0 to 99999; patches as metres refused when
// they break the rule; windDeg and swellDeg bearings.
import { z } from 'zod'
import { reading, turn, written, type Editor, type FileEdit } from '#editor/editor.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Truth } from '#engine/engine.ts'
import { mod, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { Patches, Ranged, Sea as Panel, Seed } from './ocean3d.components.tsx'
import type { Land } from './ocean3d.plugin.ts'
import { bands, grid, keyed, RES, waveAt, type Ground, type Sea } from './ocean3d.sim.ts'

export const KIND = 'ocean3d'
// Each bounded number's range and step.
export const RANGES: Record<string, [number, number, number]> = {
  windSpeed: [0, 30, 0.5], fetchKm: [10, 1000, 1], swellScale: [0, 2, 0.01], amp: [0, 3, 0.01], chop: [0, 2, 0.01],
  foamRecovery: [0, 2, 0.01], shoalDepth: [0, 200, 0.5], shoalFloor: [0, 1, 0.01],
}
// The numbers the panel shows, in its order.
export const SHOWN = ['windSpeed', 'windDeg', 'fetchKm', 'swellScale', 'swellDeg', 'amp', 'chop', 'foamRecovery', 'seed', 'shoalDepth', 'shoalFloor', 'repeat', 'patches']
// What each number may be, as its field keeps it: a bounded one in its range, a bearing in degrees
// from 0 to under 360, the seed a whole number from 0 to 99999, `repeat` a number, and `patches` a
// list of numbers.
const SHAPES: Record<string, z.ZodType> = {
  ...Object.fromEntries(Object.entries(RANGES).map(([k, [min, max]]) => [k, z.number().min(min).max(max)])),
  windDeg: z.number().min(0).lt(360), swellDeg: z.number().min(0).lt(360),
  seed: z.number().int().min(0).max(99999), repeat: z.number(), patches: z.array(z.number()),
}
// The height chart: metres either side of the camera, a sample a metre.
const HALF = 100
// The energy chart's wavelength bins.
const BINS = 48

// Why the cascades cannot be made from `patches`, or undefined: a tile not metres above 0, or the
// sentence `bands` throws. `text` is how the patches were typed.
export function patchesRefusal(patches: number[], text = patches.join(', ')): string | undefined {
  if (!patches.every(p => Number.isFinite(p) && p > 0)) return `ocean3d patches ${text} are not metres above 0`
  try {
    bands(patches)
  } catch (e) {
    return (e as Error).message
  }
  return undefined
}

// Why the sea's number `key` may not be `value`, or undefined: a key the panel does not show, a value
// its field would not keep, a `repeat` not above 0, which wraps the clock by nothing, or patches the
// cascades cannot be made from.
export function seaRefusal(key: string, value: unknown): string | undefined {
  if (!SHOWN.includes(key)) return `the sea has no number ${key}: its numbers are ${SHOWN.join(', ')}`
  const got = SHAPES[key].safeParse(value)
  if (!got.success) return `ocean3d ${key} ${JSON.stringify(value)}: ${z.prettifyError(got.error)}`
  if (key === 'repeat' && !((value as number) > 0)) return `ocean3d repeat ${value} is not above 0`
  if (key === 'patches') return patchesRefusal(value as number[])
  return undefined
}

// The edit of `file`, which gives the sea's numbers, that writes its number `key` as `value`,
// refused as `seaRefusal` refuses it.
export function seaEdits(file: string, key: string, value: unknown): (FileEdit & { file: string })[] {
  const why = seaRefusal(key, value)
  if (why) throw new Error(why)
  return [{ file, at: ['world', KIND, key], value }]
}

// The drawn surface's height along 200 m, a sample a metre, from the server's `waveAt` over the
// truth's rows: through `client`'s camera, the way it looks, over the ground the scene's `land` mod
// hands the sea on that page, where the game view draws the scene with it; else from the origin,
// looking along −z, over open ocean, as the page draws a sea with no ground. Throws where `waveAt`
// does, and, given a page, where the scene names a land whose plugin it does not list.
export function profile(truth: Truth, client: Plugins | undefined) {
  const w = reading(truth, 'the sea panel')
  const camera = client?.render3d?.camera
  const at = camera ? [camera.position.x, camera.position.z] : [0, 0]
  let dir = [0, -1]
  if (camera) {
    const f = camera.position.clone().set(0, 0, -1).applyQuaternion(camera.quaternion)
    const l = Math.hypot(f.x, f.z)
    if (l > 1e-6) dir = [f.x / l, f.z / l]
  }
  if (client) provided(truth.scene, KIND, 'land')
  const drawn = client && mod<Land>(truth.world, KIND, 'land')?.(client)
  const ground: Ground = drawn ?? { depth: () => Infinity }
  const points = Array.from({ length: 2 * HALF + 1 }, (_, i): [number, number] => {
    const s = i - HALF
    return [s, waveAt(w, at[0] + s * dir[0], at[1] + s * dir[1], ground)]
  })
  return { through: camera ? 'the camera' : 'the origin', at, dir, ground: drawn ? 'drawn' : 'open ocean', points }
}

// The energy of the sea's spectrum against wavelength, in `BINS` bins of wavelength (m, the middle of
// each, and m²), and each cascade's band of wavelengths; `pause` is awaited before each cascade, and
// answering false stops the work, answered as undefined. Throws the sentence `bands` throws.
export async function energy(sea: Sea, pause: () => Promise<boolean>) {
  const b = bands(sea.patches)
  const patches = sea.patches
  const least = patches[patches.length - 1] / (RES / 2) / Math.SQRT2, most = patches[0]
  const bin = (l: number) => Math.min(BINS - 1, Math.max(0, Math.floor((Math.log(l / least) / Math.log(most / least)) * BINS)))
  const sum = new Float64Array(BINS)
  for (let c = 0; c < patches.length; c++) {
    if (!(await pause())) return undefined
    const g = grid(sea, c)
    const dK = (2 * Math.PI) / patches[c]
    for (let i = 0; i < RES * RES; i++) {
      const e = g.re[i] ** 2 + g.im[i] ** 2
      if (!(e > 0)) continue
      const x = i % RES, y = (i - x) / RES
      sum[bin((2 * Math.PI) / (Math.hypot(x - RES / 2, y - RES / 2) * dK))] += e
    }
  }
  const middle = (k: number) => least * (most / least) ** ((k + 0.5) / BINS)
  const clamp = (l: number) => Math.min(most, Math.max(least, l))
  return {
    points: Array.from(sum, (e, k): [number, number] => [middle(k), e]),
    bands: b.map((r, k) => ({ from: clamp((2 * Math.PI) / r.hi), to: clamp((2 * Math.PI) / r.lo), label: `cascade ${k}` })),
  }
}

export function ocean3d(ed: Editor) {
  ed.panel({ id: 'ocean3d', title: 'Sea', area: 'right', component: Panel })
  ed.field('ocean3d.range', Ranged)
  ed.field('ocean3d.seed', Seed)
  ed.field('ocean3d.patches', Patches)
  ed.bind('ocean3d', {
    ...Object.fromEntries(Object.keys(RANGES).map(k => [k, 'ocean3d.range'])),
    seed: 'ocean3d.seed', patches: 'ocean3d.patches', windDeg: 'bearing', swellDeg: 'bearing',
    deep: 'color', scatter: 'color', foamColour: 'color',
  })

  const scene = z.string().describe('a scene with a sea')
  // The sea of `scene`: its truth, and its numbers as the file that gives them holds them.
  const seaOf = (scene: string) => ({ truth: ed.sceneOf(scene, KIND), ...ed.worldOf(scene, KIND) })
  const numbers = (scene: string) => {
    const { value } = ed.worldOf(scene, KIND)
    return Object.fromEntries(SHOWN.map(k => [k, value[k]]))
  }

  ed.command({
    id: 'ocean.set',
    title: 'Sea: set',
    input: z.object({
      scene,
      key: z.enum(SHOWN as [string, ...string[]]).describe(`the number: ${Object.entries(RANGES).map(([k, [a, b]]) => `${k} ${a}–${b}`).join(', ')}; windDeg, swellDeg bearings 0–360; seed a whole number 0–99999; repeat above 0; patches each cascade's tile in metres, largest first`),
      value: z.union([z.number(), z.array(z.number())]).describe('its value: a number, or for patches a list of them'),
    }).describe('Writes one of the sea\'s numbers into world.ocean3d, as the Sea panel does: one undo, refused as the panel refuses it. Answers the numbers, and whether this one makes the spectrum again.'),
    run: async ({ scene, key, value }, e) => {
      const { file } = seaOf(scene)
      await written(e, seaEdits(file, key, value))
      return { scene, file, numbers: numbers(scene), remakes: (keyed as readonly string[]).includes(key) }
    },
  })
  ed.command({
    id: 'ocean.profile',
    title: 'Sea: profile',
    input: z.object({ scene }).describe('The Sea panel\'s height chart: the drawn surface\'s height, a sample a metre along 200 m, through the camera the way it looks while the game view shows the scene, else from the origin looking along −z over open ocean, as the panel draws it then. Answers where it is taken from, along which way, over what ground, and [metres along, height m] of each sample.'),
    run: async ({ scene }) => {
      const { truth } = seaOf(scene)
      const s = ed.need()
      if (s.attached) await s.frame()
      return { scene, ...profile(truth, s.viewing === scene ? s.client?.plugins : undefined) }
    },
  })
  ed.command({
    id: 'ocean.spectrum',
    title: 'Sea: spectrum',
    input: z.object({ scene }).describe('The Sea panel\'s energy chart, from the sea\'s numbers: the energy of the spectrum\'s cells in 48 bins of wavelength, [wavelength m, energy m²] each, and the band of wavelengths each cascade keeps.'),
    run: async ({ scene }) => {
      const sea = seaOf(scene).value as unknown as Sea
      const got = await energy(sea, async () => {
        await turn()
        return true
      })
      return { scene, ...got! }
    },
  })
}
