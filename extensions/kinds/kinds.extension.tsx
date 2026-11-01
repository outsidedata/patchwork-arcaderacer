// The kinds extension: a game's kinds listed, and a new kind made. A kind of a game is several things
// in several files, and making one by hand is writing each: its rule, `<kind>.sim.ts`, which the
// module defining each scene's sim imports and lists; its look, `<kind>.client.ts`, when it draws on
// its own; its prefab, its row's fields as it starts, in a scene file's `prefabs`; its definition,
// every number of it that never changes, in the data file its scenes' `world.defs` names; and its
// place in every table of the game's data that is keyed by its kinds (a renderer's looks by kind, a
// light per kind) and every list of kinds it belongs in (the kinds a sword hits). Here it is one
// change, written by the route (`kinds.route.ts`, `make`) whole or not at all, and one undo.
//
// A kind is made blank or like another kind of the game, one with a rule of its own in the game's
// folder. Made like one, it is a copy of it in every file: its rule and look copied under its own name,
// its prefab and its definition copied, and it put beside the kind it is like in every table and list
// of the game's data that names that kind, as each place picked says: the tables and lists of every
// scene file's `world` and of the definitions, found by their keys and items, each of which is a kind
// of the game, so nothing here names a field. Made blank, its rule does nothing yet, its prefab is
// empty, and it is in no table or list. Either way it is added to the sims picked, by default those
// that list the kind it is like, else every scene's but the manager's. The page names to the route
// what only the session knows: the scene file its prefab goes into (the one holding the prefab of the
// kind it is like, else the manager's), the definitions files its scenes name, and the places picked;
// the route reads every value it copies from the files itself. Its rule is then opened in the Code
// panel; and since the sims it is added to are modules the page has imported, which it holds as they
// were, the page reloads with it once, and with its undo (`Edits.route`); its new rule and look are
// imported as they are when a sim first names them.
//
// The Kinds panel (`kinds.components.tsx`) lists the kinds of the open game, each with the rows of it
// in each scene now, whether its rule and look are its own, and the sims that list it; New kind, or
// New kind like this, opens the form.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`):
//   kinds.list    the kinds of the open game: for each, the rows of it now, its rule and look when the
//                 game's folder has them, the sim modules that list it, its prefab's file and its
//                 definition's;
//   kinds.places  the tables and lists of the game's data that name a kind, each by its id, file and
//                 path, which a kind made like it is put into;
//   kinds.make    a kind made, blank or like another, into the sims named or picked by default, and
//                 into every place found but those skipped: one undo.
import { z } from 'zod'
import type { Path } from '#addons/recorder/recorder.addon.ts'
import { fetched, type Editor } from '#editor/editor.ts'
import { KindsPanel } from './kinds.components.tsx'

// What the route reads of the game's code (`kinds.route.ts`, `game`).
export type Code = {
  scenes: Record<string, string>
  modules: Record<string, { kinds: string[] } | { why: string }>
  rules: string[]
  looks: string[]
}
export type Kind = {
  name: string
  // The rows of it in each scene now.
  rows: Record<string, number>
  rule: boolean
  look: boolean
  modules: string[]
  prefab: string | undefined
  definition: string | undefined
}
// A table keyed by kinds, or a list of kinds, of a data file of the game, that names a kind.
export type Place = { id: string; file: string; at: Path; table: boolean }
export type Draft = { name: string; like: string | null; sims: string[]; places: Place[]; skip: string[] }

export type Studio = {
  code: Code | undefined
  selected: string | undefined
  draft: Draft | undefined
  read(): Promise<Code>
  kinds(): Kind[]
  places(like: string): Promise<Place[]>
  select(name: string | undefined): void
  start(like: string | null): Promise<void>
  change(patch: Partial<Draft>): void
  make(): Promise<void>
  cancel(): void
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

export function kinds(ed: Editor) {
  const game = () => ed.need().game.name
  // Every kind of the game: what each scene's sim hands out, and every prefab a scene file gives.
  const names = () => {
    const s = ed.need()
    const out = new Set<string>()
    for (const t of s.scenes().values()) for (const k of Object.keys(t.sim)) out.add(k)
    for (const f of s.files.values()) for (const k of Object.keys(f.prefabs ?? {})) out.add(k)
    return out
  }
  // The scene files, the manager's first, and the definitions file each scene's world names.
  const sceneFiles = () => {
    const s = ed.need()
    return [...s.files.keys()].sort((a, b) => (a === s.game.path ? -1 : b === s.game.path ? 1 : a.localeCompare(b)))
  }
  const defsFiles = () => {
    const out = new Set<string>()
    for (const t of ed.need().scenes().values()) {
      const defs = (t.world as { defs?: unknown }).defs
      const url = typeof defs === 'string' ? (t.world.loader?.assets as Record<string, { url?: string }> | undefined)?.[defs]?.url : undefined
      if (url) out.add(url.replace(/^\//, ''))
    }
    return [...out]
  }
  const prefabFile = (kind: string) => sceneFiles().find(f => kind in (ed.need().files.get(f)?.prefabs ?? {}))
  const definitionFile = async (kind: string) => {
    for (const f of defsFiles()) if (isObject(JSON.parse(await ed.text(f))[kind])) return f
    return undefined
  }

  const studio: Studio = {
    code: undefined,
    selected: undefined,
    draft: undefined,
    async read() {
      studio.code = await fetched<Code>(`/api/x/kinds/game?game=${encodeURIComponent(game())}`)
      ed.changed('x.kinds')
      return studio.code
    },
    kinds() {
      const s = ed.session
      if (!s) return []
      const code = studio.code
      const scenes = [...s.scenes()]
      return [...names()].sort().map(name => ({
        name,
        rows: Object.fromEntries(scenes.map(([n, t]) => [n, t.rows.filter(r => r.kind === name).length]).filter(([, c]) => c)),
        rule: !!code?.rules.includes(name),
        look: !!code?.looks.includes(name),
        modules: Object.entries(code?.modules ?? {}).filter(([, m]) => 'kinds' in m && m.kinds.includes(name)).map(([p]) => p),
        prefab: prefabFile(name),
        definition: undefined,
      }))
    },
    // Every table keyed by kinds that has `like`, and every list of kinds that holds it, in each scene
    // file's `world` and in the definitions, but the definition of `like` itself, which is copied whole.
    async places(like) {
      const all = names()
      const found: Place[] = []
      const walk = (file: string, value: unknown, at: Path, top: boolean) => {
        if (Array.isArray(value)) {
          if (value.length && value.every(v => typeof v === 'string' && all.has(v)) && value.includes(like)) found.push({ id: `${file}#${at.join('.')}`, file, at, table: false })
          value.forEach((v, i) => walk(file, v, [...at, i], false))
          return
        }
        if (!isObject(value)) return
        const keys = Object.keys(value)
        if (!top && keys.includes(like) && keys.every(k => all.has(k))) found.push({ id: `${file}#${at.join('.')}`, file, at, table: true })
        for (const k of keys) if (!(k === like && (top || keys.every(k => all.has(k))))) walk(file, value[k], [...at, k], false)
      }
      for (const f of sceneFiles()) walk(f, ed.need().files.get(f)?.world, ['world'], false)
      for (const f of defsFiles()) walk(f, JSON.parse(await ed.text(f)), [], true)
      return found
    },
    select(name) {
      studio.selected = name
      ed.changed('x.kinds')
    },
    async start(like) {
      const code = studio.code ?? await studio.read()
      const manager = ed.need().game.path.replace(/\.scene\.json$/, '.sim.ts')
      const editable = Object.entries(code.modules).filter(([, m]) => 'kinds' in m).map(([p]) => p)
      const sims = like ? editable.filter(p => (code.modules[p] as { kinds: string[] }).kinds.includes(like)) : editable.filter(p => p !== manager)
      studio.draft = { name: '', like, sims, places: like ? await studio.places(like) : [], skip: [] }
      ed.reveal('kinds')
      ed.changed('x.kinds')
    },
    change(patch) {
      if (!studio.draft) return
      Object.assign(studio.draft, patch)
      ed.changed('x.kinds')
    },
    async make() {
      const d = studio.draft
      if (!d) return
      await make(d.name, d.like, d.sims, d.places.filter(p => !d.skip.includes(p.id)))
      studio.draft = undefined
      studio.selected = d.name
      ed.changed('x.kinds')
    },
    cancel() {
      studio.draft = undefined
      ed.changed('x.kinds')
    },
  }

  // Kind `name` made, like `like` or blank, into the sims of `sims` and the places of `places`: one
  // change, one undo. Its rule is shown in the Code panel.
  async function make(name: string, like: string | null, sims: string[], places: Place[]) {
    if (names().has(name)) throw new Error(`${game()} has a kind ${name} already`)
    if (like !== null && !names().has(like)) throw new Error(`${game()} has no kind ${like}: its kinds are ${[...names()].sort().join(', ')}`)
    if (!sims.length) throw new Error(`pick a sim to add ${name} to: a kind no sim lists is in no scene`)
    const made = await ed.route<{ files: string[] }>('kinds', 'make', {
      game: game(), name, like, sims,
      prefab: (like === null ? undefined : prefabFile(like)) ?? ed.need().game.path,
      definitions: defsFiles(),
      places: places.map(({ file, at, table }) => ({ file, at, table })),
    })
    if (ed.commands.has('code.open')) await ed.call('code.open', { path: made.files[0] })
  }

  function Kinds() {
    return <KindsPanel studio={studio} />
  }
  ed.panel({ id: 'kinds', title: 'Kinds', area: 'left', component: Kinds })

  // ---------------------------------------------------------------- the commands

  const kind = z.string().describe('a kind of the open game, by its name')
  ed.command({
    id: 'kinds.list',
    title: 'Kinds: list',
    input: z.object({}).describe('The kinds of the open game: for each, the rows of it now by scene, whether the game\'s folder holds its rule and its look, the sim modules that list it, its prefab\'s file and its definition\'s.'),
    enabled: () => !!ed.session,
    run: async () => {
      await studio.read()
      return { kinds: await Promise.all(studio.kinds().map(async k => ({ ...k, definition: await definitionFile(k.name) }))) }
    },
  })
  ed.command({
    id: 'kinds.places',
    title: 'Kinds: places',
    input: z.object({ like: kind }).describe('The tables keyed by kinds and the lists of kinds, in the scene files\' world and the definitions, that name a kind: what a kind made like it is put into. Each place has an id, its file and its path.'),
    run: async ({ like }) => {
      if (!names().has(like)) throw new Error(`${game()} has no kind ${like}: its kinds are ${[...names()].sort().join(', ')}`)
      return { places: await studio.places(like) }
    },
  })
  ed.command({
    id: 'kinds.make',
    title: 'Kinds: make',
    input: z.object({
      name: z.string().describe('the new kind\'s name: a lower-case letter, then letters and digits'),
      like: kind.nullable().optional().describe('a kind with a rule of its own to copy, or null for a blank kind'),
      sims: z.array(z.string()).optional().describe('the sim modules to add it to, by path; by default those listing like, else every scene\'s but the manager\'s'),
      skip: z.array(z.string()).optional().describe('ids of places (kinds.places) not to put it into'),
    }).describe('Makes a kind: its rule (a copy of like\'s, or blank), its look when like has one, its prefab and definition copied, it added to the sims and put beside like in every place found but those skipped. One undo; the page reloads.'),
    run: async ({ name, like = null, sims, skip = [] }) => {
      await studio.start(like)
      const d = studio.draft!
      studio.draft = undefined
      const places = d.places.filter(p => !skip.includes(p.id))
      await make(name, like, sims ?? d.sims, places)
      return { name, sims: sims ?? d.sims, places: places.map(p => p.id) }
    },
  })
}
