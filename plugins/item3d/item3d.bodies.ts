// item3d's bodies sheet: for each body a game draws, what it holds and where, what it wears, and its capsules.
// It is a `json` entry of the scene's loader catalogue, named by `world.item3d.bodies`, and item3d
// hands each plugin that draws a body its part of it through that plugin's mods (`item3d.plugin.ts`, The sheet).
// Nothing here draws: the workshop's server checks a sheet with the same `check` before it writes one.
//
// The sheet is `{ bodies: { <body>: body } }`. `<body>` is the name the plugin that draws the body knows it by:
// the kind anim or motion3d draws a row as (its `as`, else its kind), or a body of `world.crowd3d.bodies`. A body:
//   holds     a list, each a thing held rigid on the body, `{ item | model, bone | place, at, turn, scale? }`:
//               item   an item of `world.item3d.items`; or `model`, a `model` entry of the loader's catalogue
//               bone   the bone it is hung on, by the end of its name, for a body anim or motion3d draws; or
//                      `place`, one of crowd3d's places (`head`, `leftHand`, ...), for a body crowd3d draws
//               at     [x, y, z] metres from the bone, in the bone's frame with its scale taken off
//               turn   [x, y, z] degrees, an XYZ Euler, in that frame
//               scale  a number or [x, y, z], on a place alone: crowd3d's
//             Every hold of one body is on a bone, or every one on a place: one plugin draws a body.
//   wears     a list of names, each a fabric of fabric3d's fabrics file, kept on every body of this name
//             fabric3d's sources hand it. The fabric's own numbers and its pins are the fabrics file's. For a
//             body anim or motion3d draws: fabric3d holds no fabric to a body of crowd3d's, and a body with a
//             hold on a place that gives `wears` or `capsules` throws.
//   capsules  a list, the body as cloth, hair and particles meet it: `{ from, to, radius }`, a capsule `radius`
//             metres round from the bone whose name ends with `from` to the one that ends with `to`; or `{ bone,
//             at, radius }`, a ball `radius` metres round at `at` [x, y, z] metres in the frame of the bone `bone`,
//             its scale taken off. For a body anim or motion3d draws.
// A body may leave out any of the three. `check(sheet, items)` throws a sentence naming the body and the field for
// a sheet that is none of this, `items` the names of `world.item3d.items`.

// A thing held rigid on a body.
export type Hold = ({ item: string } | { model: string }) & ({ bone: string } | { place: string }) & { at: number[]; turn: number[]; scale?: number | number[] }
// A capsule between two bones, or a ball on one.
export type Capsule = { from: string; to: string; radius: number } | { bone: string; at: number[]; radius: number }
export type Body = { holds?: Hold[]; wears?: string[]; capsules?: Capsule[] }
export type Bodies = { bodies: Record<string, Body> }

export const BODY = ['holds', 'wears', 'capsules'] as const satisfies readonly (keyof Body)[]
const HOLD = ['item', 'model', 'bone', 'place', 'at', 'turn', 'scale']

const said = (v: unknown) => JSON.stringify(v)
const numbers = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(e => typeof e === 'number' && Number.isFinite(e))
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// What a hold holds: its item's name, or its model's.
export const heldName = (h: Hold) => ('item' in h ? h.item : h.model)

export function check(sheet: unknown, items: string[]): asserts sheet is Bodies {
  if (!plain(sheet) || !plain(sheet.bodies)) throw new Error("item3d's bodies sheet has no bodies, and it is { bodies: { <body>: { holds, wears, capsules } } }")
  for (const k of Object.keys(sheet)) if (k !== 'bodies') throw new Error(`item3d's bodies sheet has ${k}, which item3d does not know`)
  for (const [name, body] of Object.entries(sheet.bodies)) {
    const what = `item3d's body ${name}`
    if (!plain(body)) throw new Error(`${what} is ${said(body)}, and a body is { ${BODY.join(', ')} }`)
    for (const k of Object.keys(body)) if (!(BODY as readonly string[]).includes(k)) throw new Error(`${what} has ${k}, and a body is { ${BODY.join(', ')} }`)

    if (body.holds !== undefined) {
      if (!Array.isArray(body.holds)) throw new Error(`${what} has holds of ${said(body.holds)}, and they are a list, each { item | model, bone | place, at, turn }`)
      let on: 'bone' | 'place' | undefined
      body.holds.forEach((h: unknown, i) => {
        const at = `${what}'s hold ${i}`
        if (!plain(h)) throw new Error(`${at} is ${said(h)}, and a hold is { item | model, bone | place, at, turn }`)
        for (const k of Object.keys(h)) if (!HOLD.includes(k)) throw new Error(`${at} has ${k}, and a hold is { item | model, bone | place, at, turn, scale }`)
        if (('item' in h) === ('model' in h)) throw new Error(`${at} names ${'item' in h ? 'both an item and a model' : 'neither an item nor a model'}, and a hold holds one of them`)
        if ('item' in h) {
          if (typeof h.item !== 'string' || !items.includes(h.item)) throw new Error(`${at} holds the item ${said(h.item)}, which is none of world.item3d.items: ${items.join(', ')}`)
        } else if (typeof h.model !== 'string') throw new Error(`${at} holds the model ${said(h.model)}, and model is the name of a model entry of the loader's catalogue`)
        if (('bone' in h) === ('place' in h)) throw new Error(`${at} names ${'bone' in h ? 'both a bone and a place' : 'neither a bone nor a place'}, and a hold is on one of them`)
        const mine = 'bone' in h ? 'bone' : 'place'
        if (typeof h[mine] !== 'string') throw new Error(`${at} has a ${mine} of ${said(h[mine])}, and it is a name`)
        if (on !== undefined && on !== mine) throw new Error(`${at} is on a ${mine}, and another hold of ${name} is on a ${on}: one plugin draws a body, and every hold of it is on a bone or every one on a place`)
        on = mine
        if (!numbers(h.at, 3)) throw new Error(`${at} has an at of ${said(h.at)}, and it is [x, y, z] metres`)
        if (!numbers(h.turn, 3)) throw new Error(`${at} has a turn of ${said(h.turn)}, and it is [x, y, z] degrees`)
        if (h.scale !== undefined) {
          if (mine === 'bone') throw new Error(`${at} has a scale and is on a bone, and a scale is a place's: crowd3d's`)
          if (!(typeof h.scale === 'number' && Number.isFinite(h.scale)) && !numbers(h.scale, 3)) throw new Error(`${at} has a scale of ${said(h.scale)}, and it is a number or [x, y, z]`)
        }
      })
    }

    // fabric3d holds a fabric to a body anim or motion3d draws, and gpgpu3d is handed their capsules: never crowd3d's
    const placed = Array.isArray(body.holds) && body.holds.some(h => plain(h) && 'place' in h)
    for (const k of ['wears', 'capsules'] as const)
      if (placed && body[k] !== undefined) throw new Error(`${what} has ${k} and holds on places, which are crowd3d's: a body crowd3d draws wears no fabric and has no capsules, which are for a body anim or motion3d draws`)

    const wears = body.wears
    if (wears !== undefined) {
      if (!Array.isArray(wears) || !wears.every(f => typeof f === 'string')) throw new Error(`${what} has wears of ${said(wears)}, and they are a list of the names of fabrics`)
      const twice = wears.find((f, i) => wears.indexOf(f) !== i)
      if (twice !== undefined) throw new Error(`${what} wears ${twice} twice`)
    }

    if (body.capsules !== undefined) {
      if (!Array.isArray(body.capsules)) throw new Error(`${what} has capsules of ${said(body.capsules)}, and they are a list, each { from, to, radius } or { bone, at, radius }`)
      body.capsules.forEach((c: unknown, i) => {
        const at = `${what}'s capsule ${i}`
        if (!plain(c)) throw new Error(`${at} is ${said(c)}, and it is { from, to, radius } or { bone, at, radius }`)
        const ball = 'bone' in c
        const fields = ball ? ['bone', 'at', 'radius'] : ['from', 'to', 'radius']
        for (const k of Object.keys(c)) if (!fields.includes(k)) throw new Error(`${at} has ${k}, and it is { from, to, radius } or { bone, at, radius }`)
        if (ball) {
          if (typeof c.bone !== 'string') throw new Error(`${at} has a bone of ${said(c.bone)}, and it is the end of a bone's name`)
          if (!numbers(c.at, 3)) throw new Error(`${at} has an at of ${said(c.at)}, and it is [x, y, z] metres`)
        } else if (typeof c.from !== 'string' || typeof c.to !== 'string') throw new Error(`${at} runs from ${said(c.from)} to ${said(c.to)}, and each is the end of a bone's name`)
        if (!(typeof c.radius === 'number' && c.radius > 0)) throw new Error(`${at} has a radius of ${said(c.radius)}, and it is metres above 0`)
      })
    }
  }
}
