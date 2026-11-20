// What instances3d's page and its mods both read: the numbers of a look, and their check. It has no row and
// no rule; `instances3d.plugin.ts` draws (its header says what each number does).
//
// A look:
//   asset      a loader `model` whose meshes are named `<row>-<lod>[-<part>]`; or
//   shape      `{ detail, lumpy, squash }`, a boulder for each row; or
//   <word>     a word a mod delivers geometry for (`world.instances3d.mods.behaviors`), its value that
//              behavior's numbers: one of the three
//   colour roughness metalness surface  the paint of a shape or a word's geometry; `colour` it must give
//   map scale  a texture entry of the loader's catalogue laid on every face of a shape's or a word's
//              geometry, `colour` tinting it, `scale` metres to a span of it, across the two axes the face
//              lies most nearly along, upright and unmirrored seen from outside (on a floor, v toward −z)
//   flat       true: flat-shaded, every facet showing
//   lods       the LOD drawn in each shell, nearest first; a shape or a word draws its one geometry in each
//   shadow     metres: a shell casts shadows when the shell before it ends inside this
//   leaf       0 to 1, how far a card's normal is bent toward up
//
// A Geometry behavior, for a look that gives its word, its numbers `data`:
//   parts(data, row, tools, world)  the meshes of that row, `{ geometry, at?, turn?, size? }[]`, each placed
//                            in the instance by `at`, the turn `turn` and the scale `size`; `tools` is
//                            `{ THREE, convex(points) }`, three's namespace and the convex hull of [x, y, z]
//                            points; `world` the scene's
//
// `check(look, shells, what, world)` throws a sentence naming `what` and the number that is wrong.
import type * as THREE from 'three'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'

export type RockSurface = {
  broad: number; fine: number; lift: number; range: number; mix: [number, number]
  moss: { from: number; to: number; amount: number; up: [number, number]; colour: string }; bump: number; rough: number
}
export type Shape = { detail: number; lumpy: [number, number]; squash: number }
export type Look = {
  asset?: string; shape?: Shape; colour?: string; roughness?: number; metalness?: number; surface?: RockSurface
  map?: string; scale?: number; flat?: boolean
  lods: number[]; shadow: number; leaf: number
  [word: string]: unknown
}
export type Tools = { THREE: typeof THREE; convex(points: number[][]): THREE.BufferGeometry }
export type Part = { geometry: THREE.BufferGeometry; at?: number[]; turn?: number[]; size?: number[] }
export type Geometry = { parts(data: any, row: string, tools: Tools, world: Record<string, any>): Part[] }

// A look's own fields; every other is a word a Geometry is delivered for.
const LOOK = new Set(['asset', 'shape', 'colour', 'roughness', 'metalness', 'surface', 'map', 'scale', 'flat', 'lods', 'shadow', 'leaf'])

export const geometriesOf = (world: Record<string, any>): Record<string, Geometry> =>
  Object.assign({}, ...modsOf<() => Record<string, Geometry>>(world, 'instances3d', 'behaviors').map(f => f()))

// The word a look's geometry is delivered for, or undefined for an asset or a shape.
export const wordOf = (look: Look): string | undefined => Object.keys(look).find(k => !LOOK.has(k))

export function check(look: Look, shells: number, what: string, world: Record<string, any>) {
  if (typeof look !== 'object' || look === null) throw new Error(`${what} ${JSON.stringify(look)} is not a look's numbers`)
  const words = Object.keys(look).filter(k => !LOOK.has(k))
  const given = [look.asset !== undefined && 'an asset', look.shape !== undefined && 'a shape', ...words.map(w => `the word ${w}`)].filter(Boolean)
  if (given.length !== 1) throw new Error(`${what} gives ${given.length ? given.join(' and ') : 'neither an asset, a shape nor a word'}: a look draws one`)
  for (const w of words) if (!geometriesOf(world)[w]) throw new Error(`${what} gives ${w}, which is no field of a look and which no plugin world.instances3d.mods.behaviors names delivers`)
  if (look.asset === undefined && look.colour === undefined) throw new Error(`${what} has no asset and no colour`)
  if (look.map !== undefined && look.asset !== undefined) throw new Error(`${what} lays the picture ${look.map} on an asset, whose model carries its own`)
  if (look.map !== undefined && !(Number.isFinite(look.scale) && look.scale! > 0)) throw new Error(`${what} lays the picture ${look.map}, and gives no scale above 0`)
  if (!(Array.isArray(look.lods) && look.lods.length > 0 && look.lods.length <= shells && look.lods.every(k => Number.isInteger(k) && k >= 0))) throw new Error(`${what} lods ${JSON.stringify(look.lods)} are not a LOD for each of up to ${shells} shells`)
  if (!(look.shadow >= 0)) throw new Error(`${what} shadow ${look.shadow} is not metres from 0`)
  if (!(look.leaf >= 0 && look.leaf <= 1)) throw new Error(`${what} leaf ${look.leaf} is not a share from 0 to 1`)
}
