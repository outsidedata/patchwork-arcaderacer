// particle3d's extension: the Effects 3D panel, the Fire Effect 3D tool (Z), and the types of an
// effects file's fields (`particle3d.plugin.ts` says what the file holds and what every emitter field
// means). They are particle2d's (`plugins/particle2d/particle2d.extension.tsx`, which says what each
// does), made by its `effects` in particle3d's space: the scenes that name particle3d, drawn by
// render3d, in metres, a direction a vector of the world. The file's own fields are `cap`,
// `alphaTest`, an opacity, 0 when left out, and `ppm`; the preview aims the effect along a vector of
// the world, straight up at first, and ends a beam 3 metres along x from its point.
//
// Its commands are particle2d's, made by the same `effects`, in particle3d's space: `particle3d.effects`
// reads the effects of the scenes that name particle3d, `particle3d.effect` sets, adds or takes out an
// effect, its points, directions and jitters three numbers and its boxes six, `particle3d.rename`
// renames one, `particle3d.file` sets `cap`, `alphaTest` or `ppm`, and `particle3d.fire` fires one at
// a world point [x, y, z], aimed along a vector of the world, in the game view.
import { z } from 'zod'
import type { Editor } from '#editor/editor.ts'
import { effects, type Space } from '#plugins/particle2d/particle2d.extension.tsx'

export const SPACE: Space = {
  plugin: 'particle3d',
  renderer: 'render3d',
  title: 'Effects 3D',
  tool: { title: 'Fire Effect 3D', key: 'Z' },
  unit: 'm',
  where: 'a vector of the world',
  axes: 3,
  file: [
    { key: 'cap', title: 'the most particles a page draws at once', type: 'integer', value: z.number().int().min(0), must: 'a whole number, 0 or more' },
    { key: 'alphaTest', title: 'the opacity under which a pixel of a particle is not drawn', type: 'particle3d.opacity', absent: { note: '0: every pixel is drawn', set: 0.5 }, value: z.number().min(0).max(1), must: 'an opacity from 0 to 1' },
    { key: 'ppm', title: 'pixels of a sheet per metre', absent: { note: 'none: a layer drawn from a sheet needs one', set: 32 }, value: z.number().positive(), must: 'a number above 0' },
  ],
  // A burst of flat squares thrown every way that fade out, so it shows when previewed.
  emitter: { n: [8, 12], life: [0.4, 0.8], size: [0.08, 0.12], speed: [1, 3], a1: 0 },
  spawn: { angle: 0, aim: [0, 1, 0], to: [3, 0, 0], scale: 1, life: 1 },
  dir: sp => sp.aim,
  to: (at, sp) => [0, 1, 2].map(i => (at[i] ?? 0) + (sp.to[i] ?? 0)),
}

export function particle3d(ed: Editor) {
  effects(ed, SPACE)
}
