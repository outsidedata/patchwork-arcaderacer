// sprite2d's extension: the types of a sprite's fields. A sprite's sheet and clip are played, measured
// and edited in the loader's Sheets panel, the one clip viewer, which shows a row sprite2d draws at
// its clip when the row is selected (`plugins/loader/loader.extension.tsx`).
//
// The types, wherever a field of a kind some scene's `world.sprite2d` lists is shown: `sheet` is a
// sheet of the catalogue (`loader.sheet`), `clip` a clip of the sheet the owner's `sheet` names
// (`sprite2d.clip`), and `frame` a whole number. Something with no `sheet` of its own, a kind's
// definition say, whose fields name the clips its rows play, is of its kind's sheet: the one its
// kind's entry of `world.sprite2d` gives, else its kind's prefab, in the owner's scene, else in the
// first scene of the game whose prefab of that kind names one (`sheetFor`). A game binds a field of
// its own that names a clip to `sprite2d.clip` so.
import type { Editor, Owner } from '#editor/editor.ts'
import type { Session } from '#editor/session.ts'
import type { Entry } from '#plugins/loader/loader.sim.ts'
import { ClipName } from './sprite2d.components.tsx'

// A sheet entry of a scene's catalogue: its entry, the scene whose catalogue it is in, and its file's
// path from the repo.
export type Shown = { scene: string; name: string; asset: Entry; path: string }

// A scene's catalogue: its `world.loader.assets`.
function catalogue(s: Session, scene: string): Record<string, Entry> {
  return (s.scenes().get(scene)?.world.loader?.assets ?? {}) as Record<string, Entry>
}

// The kinds a scene's `world.sprite2d` lists, in its own file or else the game's.
export function spriteKinds(s: Session, scene: string): string[] {
  const own = s.files.get(s.path(scene))?.world?.sprite2d ?? s.game.file.world?.sprite2d
  return Object.keys((own as { kinds?: Record<string, unknown> } | undefined)?.kinds ?? {})
}

// The sheet a sheet entry of a scene's catalogue names, when it names one.
export function entryOf(s: Session, scene: string, name: unknown): Shown | undefined {
  const asset = typeof name === 'string' ? catalogue(s, scene)[name] : undefined
  return asset?.type === 'sheet' ? { scene, name: name as string, asset, path: asset.url.replace(/^\//, '') } : undefined
}

// The sheet a clip field of `owner` is a clip of: the owner's own `sheet`, else its kind's, in the
// owner's scene, else in the first scene of the game that gives its kind one.
export function sheetFor(s: Session, scene: string | undefined, owner: Owner): Shown | undefined {
  const own = owner.data?.sheet
  if (typeof own === 'string') return scene === undefined ? undefined : entryOf(s, scene, own)
  const kind = owner.kind
  if (kind === undefined) return undefined
  const kindSheet = (at: string) => {
    const world = s.files.get(s.path(at))?.world?.sprite2d ?? s.game.file.world?.sprite2d
    const spec = (world as { kinds?: Record<string, { sheet?: unknown }> } | undefined)?.kinds?.[kind]
    const prefab = s.files.get(s.path(at))?.prefabs?.[kind] ?? s.game.file.prefabs?.[kind]
    return spec?.sheet ?? (prefab as { sheet?: unknown } | undefined)?.sheet
  }
  for (const at of [...(scene === undefined ? [] : [scene]), ...s.scenes().keys()]) {
    const found = entryOf(s, at, kindSheet(at))
    if (found) return found
  }
  return undefined
}

export function sprite2d(ed: Editor) {
  ed.field('sprite2d.clip', ClipName)
  const drawn = (kind: string) => {
    const s = ed.session
    return !!s && [...s.scenes().keys()].some(scene => spriteKinds(s, scene).includes(kind))
  }
  ed.bind(drawn, { sheet: 'loader.sheet', clip: 'sprite2d.clip', frame: 'integer' })
}
