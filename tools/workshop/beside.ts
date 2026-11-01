// A glb's points file, read and written in node: `<stem>.points.json` beside the glb, where a game keeps
// what is marked on a model that is written again from elsewhere (canyonracer's podracers, written by
// Blender's export), so writing the glb again leaves the marks as they are. The file is
// `{ points: { <name>: { at, turn } }, sizes: { <name>: n } }`: each point's place in the model's frame
// in metres and its turn as a quaternion [x, y, z, w], as a glb's empty holds them, and each size a
// number. It is written with each point and each size on a line of its own, in the order the file had
// them and then the order they were added, and written beside and renamed over, so a reader never sees
// half a file.

import fs from 'node:fs'
import type { Point } from './glb.ts'

export type Beside = { points: Record<string, Point>; sizes: Record<string, number> }

// The points file of the glb at `glb`.
export const besideOf = (glb: string) => glb.replace(/\.glb$/, '.points.json')

// The points file as it is, or empty where there is none yet.
export function readBeside(file: string): Beside {
  if (!fs.existsSync(file)) return { points: {}, sizes: {} }
  const f = JSON.parse(fs.readFileSync(file, 'utf8'))
  return { points: f.points ?? {}, sizes: f.sizes ?? {} }
}

// The file's text: a point or a size a line.
export function besideText(b: Beside): string {
  const block = (o: Record<string, unknown>) => {
    const lines = Object.entries(o).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    return lines.length ? `{\n${lines.join(',\n')}\n  }` : '{}'
  }
  return `{\n  "points": ${block(b.points)},\n  "sizes": ${block(b.sizes)}\n}\n`
}

// Each point named in `drop` taken out of the file, then each point and each size named set in it, the
// rest kept.
export function setBeside(file: string, set: { points?: Record<string, Point>; sizes?: Record<string, number>; drop?: string[] }) {
  const b = readBeside(file)
  for (const n of set.drop ?? []) delete b.points[n]
  for (const [n, p] of Object.entries(set.points ?? {})) b.points[n] = { at: p.at, turn: p.turn }
  for (const [n, v] of Object.entries(set.sizes ?? {})) b.sizes[n] = v
  const text = besideText(b)
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return
  fs.writeFileSync(file + '.tmp', text)
  fs.renameSync(file + '.tmp', file)
}
