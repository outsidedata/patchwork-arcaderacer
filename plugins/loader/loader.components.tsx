// The components of the loader's extension (loader.extension.tsx): the Assets panel, the Sheets
// panel, the Sprites panel and the inspector's section on a row that plays a clip, and the fields of
// the loader's types.
//
// The Sheets panel reads a sheet as the game does: its file and every pack of it, as the editor last
// read or wrote them, through the loader's own `read`, with the catalogue entry's `nearest`, `facing`
// and `palette`, so the clips, runs and timings it shows are the ones every rule and actor reads. It
// plays a clip with the loader's `play`, one step of the game's `dt` at a time. The pictures are read
// off the pages' pixels (`editor/ui/pixels.ts`); nothing the panel draws is asked of the running game.
// What a panel reads, draws and writes, and why it refuses, is the extension's, done by the functions
// its commands call too.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useEditor, useTexts } from '#editor/context.ts'
import { turn, written, type Editor, type FieldProps, type FileEdit, type Selection } from '#editor/editor.ts'
import type { Session } from '#editor/session.ts'
import { put as putAt, type Path } from '#addons/recorder/recorder.addon.ts'
import { Check, ColorField, NumberField, Select, TextField, VecField } from '#editor/ui/fields.tsx'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Split, Strip, Toolbar } from '#editor/ui/layout.tsx'
import { onion, silhouette, tint } from '#editor/ui/onion.ts'
import { canvasOf, inkBottom, usePixels, type Pixels } from '#editor/ui/pixels.ts'
import { PixelImage, Surface, type SurfacePointer } from '#editor/ui/sheet.tsx'
import { Swatch } from '#editor/ui/swatch.tsx'
import { Table, type Column } from '#editor/ui/table.tsx'
import { Tree } from '#editor/ui/tree.tsx'
import {
  addPlan, addSheet, anchorEdit, apart, baseName, catalogueOf, colourAt, colourOf, drawClip, drawing, drawnOf, durationEdit, entriesOf, entryEdits, fileName, flagged, folderOf,
  gameTried, generation, hex8, howPlays, keptPixels, keyed, layerOf, look, loaderOf, loaderScenes, ms, nudged, onPage, packsNamed, pairsOf, paintsOf, paletteChoices,
  paletteOf, pathOf, pivotEdit, plays, readAgain, readAt, readBack, recentOf, revert, runBox, said, saveSprites, saveSpritesAs, setColour, setPixel, setTravel,
  settleEdit, sheetFrom, sheetWrite, show, shownOf as spritesShown, sliceKeyEdit, sliceNames, slicePlan, slicesOf, sliceSheet, slip, sourceOf, spritesVersion,
  stroke, stroked, strokesOf, swapPlan, swapSheet, tagEdit, travelIn, travelled, travels, tried, tryInGame, TYPES, undoStroke, unsaved, untried, verdict, wayName,
  waysOf,
  type Asset, type ClipLook, type Drawn, type Game, type Got, type Json, type Paints, type Pair, type Palettes, type Problem, type ReadBack, type Source, type Tried,
  type Write,
} from './loader.extension.tsx'
import type { Look } from './loader.route.ts'
import { DIRECTIONS, pick, play, type Entry, type Sheet } from './loader.sim.ts'

// ---------------------------------------------------------------- the types

// A sheet entry of the owner's scene's catalogue, else of the one the loader's panels work on.
export function SheetName(props: FieldProps<string>) {
  return <EntryName {...props} type="sheet" />
}
// A palette entry of the catalogue.
export function PaletteName(props: FieldProps<string>) {
  return <EntryName {...props} type="palette" />
}
function EntryName({ value, onChange, owner, label, type }: FieldProps<string> & { type: string }) {
  const ed = useEditor(['game', 'selection'])
  const names = entriesOf(ed, owner.scene ?? ed.focus('loader')?.scene, type)
  return <Select<string> label={label} value={value} options={[...new Set([value, ...names])].map(n => ({ value: n, label: names.includes(n) ? n : `${n} (not in the catalogue)` }))} onChange={onChange} />
}

// What an entry is: one of the types the loader knows, a value it does not marked so.
export function AssetType({ value, onChange, label }: FieldProps<string>) {
  return <Select<string> label={label} value={value} options={[...new Set([value, ...TYPES])].map(t => ({ value: t, label: TYPES.includes(t) ? t : `${t} (no type the loader knows)` }))} onChange={onChange} />
}

// ---------------------------------------------------------------- the panel

export function Assets() {
  const ed = useEditor(['game', 'selection'])
  const [picked, setPicked] = useState<string>()
  const s = ed.session
  if (!s) return <Empty>Open a game, and the asset catalogue of the scene selected is shown here.</Empty>
  const scenes = loaderScenes(ed)
  if (!scenes.length) return <Empty>No scene of {s.game.name} has a loader row.</Empty>
  const scene = picked !== undefined && scenes.includes(picked) ? picked : ed.focus('loader')!.scene
  return <Catalogue key={scene} scene={scene} scenes={scenes} onScene={setPicked} />
}

// An entry's file check, and what it was made of: the entry, the generation of its files, and the
// text of its file as it was read.
type Checked = { entry: string; generation: string; text: string | undefined; tried: Tried }
// A sheet's read-back, and what it was read from.
type Backed = { url: string; generation: string; text: string | undefined; back?: ReadBack; error?: string }

const textOf = (ed: Editor, a: Asset) => (a.type === 'json' || a.type === 'sheet' ? ed.texts.get(pathOf(a.url)) : undefined)
const checkedFresh = (ed: Editor, c: Checked | undefined, a: Asset) =>
  !!c && c.entry === JSON.stringify(a) && c.generation === generation(ed, a.url) && c.text === textOf(ed, a)
const backedFresh = (ed: Editor, b: Backed | undefined, a: Asset) =>
  !!b && b.url === a.url && b.generation === generation(ed, a.url) && b.text === ed.texts.get(pathOf(a.url))

// Runs `work` on the first of `names` that `fresh` says is not, one at a time, each once what came of
// the one before it has landed and the page has been let go for a turn (`turn`), to draw and take
// input between them, a hidden tab too; the work in hand is dropped when the panel or its scene goes.
function useOneATurn<T>(names: string[], fresh: (name: string, had: T | undefined) => boolean, work: (name: string) => Promise<T>) {
  const [done, setDone] = useState<Map<string, T>>(() => new Map())
  const next = names.find(n => !fresh(n, done.get(n)))
  // `work` is made anew each drawing, and the one of the last drawing is the one run.
  const working = useRef(work)
  useLayoutEffect(() => { working.current = work })
  useEffect(() => {
    if (next === undefined) return
    let gone = false
    void turn().then(async () => {
      if (gone) return
      const got = await working.current(next)
      if (!gone) setDone(d => new Map(d).set(next, got))
    })
    return () => { gone = true }
  }, [next, done])
  return { done, left: names.filter(n => !fresh(n, done.get(n))).length, clear: () => setDone(new Map()) }
}

const problemsOf = (n: number) => `${n} problem${n === 1 ? '' : 's'}`

function Catalogue({ scene, scenes, onScene }: { scene: string; scenes: string[]; onScene(scene: string): void }) {
  const ed = useEditor(['game', 'selection', 'x.loader'])
  const s = ed.session!
  const { file, assets } = catalogueOf(ed, scene)!
  const names = Object.keys(assets)
  // The text of each entry's file and how many times it has been written, which say whether its
  // check and its read-back are still fresh.
  useEditor(['texts'], names.map(n => pathOf(assets[n].url)))
  const sheets = names.filter(n => assets[n].type === 'sheet')
  const travel = travelIn(ed)
  const keep = (t: string[]) => setTravel(ed, t)

  const checks = useOneATurn<Checked>(names, (n, c) => checkedFresh(ed, c, assets[n]), async n => {
    const a = assets[n]
    const t = await tried(ed, n, a)
    return { entry: JSON.stringify(a), generation: generation(ed, a.url), text: textOf(ed, a), tried: t }
  })
  const backs = useOneATurn<Backed>(sheets, (n, b) => backedFresh(ed, b, assets[n]), async n => {
    const a = assets[n], at = { url: a.url, generation: generation(ed, a.url) }
    let text: string | undefined
    try {
      text = await ed.text(pathOf(a.url))
      return { ...at, text, back: await readBack(ed, a.url, text) }
    } catch (e) {
      return { ...at, text, error: (e as Error).message }
    }
  })

  // The game's loader, while the game view shows this scene, and what it was asked to load.
  const client = s.viewing === scene ? s.client : undefined
  const gameLoader = client && loaderOf(client)
  // Whatever the game's loader lands, preloaded or asked for, the panel is drawn again for, as the
  // loader's topic it follows tells (`landing`).
  const game =(n: string): Game | undefined => (client ? gameTried(ed, client, n) : undefined)
  const asking = client ? untried(ed, client, names) : []
  const tryAll = () => { if (client) void tryInGame(ed, client, asking) }

  // What is selected: the entry picked here, unless the editor's selection has moved on since, to
  // a file one of the entries names.
  const [pick, setPick] = useState<{ name: string; selection: unknown }>()
  const sel = ed.selection
  const named = sel && 'file' in sel ? names.find(n => pathOf(assets[n].url) === sel.file) : undefined
  const selected = pick && (pick.selection === sel || named === undefined) && pick.name in assets ? pick.name : named
  const choose = (n: string) => {
    const a = assets[n]
    let now = ed.selection
    if (a && (a.type === 'json' || a.type === 'sheet')) {
      now = { file: pathOf(a.url) }
      ed.select(now)
    }
    setPick({ name: n, selection: now })
  }

  const backOf = (n: string) => {
    const b = backs.done.get(n)
    return b && backedFresh(ed, b, assets[n]) ? b : undefined
  }
  const checkOf = (n: string) => {
    const c = checks.done.get(n)
    return c && checkedFresh(ed, c, assets[n]) ? c : undefined
  }
  const loads = (n: string): { tried?: Game } => ({ tried: game(n) ?? checkOf(n)?.tried })
  const loadText = (t: Game | undefined) => (t === undefined ? 'untried' : t === 'trying' ? 'trying…' : t.by === 'game' ? (t.ok ? 'loaded' : 'fails') : t.ok ? 'files read' : 'fails')
  const backRank = (n: string) => {
    if (assets[n].type !== 'sheet') return -2
    const b = backOf(n)
    return !b ? -1 : b.error !== undefined ? 1e6 : travelled(b.back!, travel).problems.length
  }

  const columns: Column<string>[] = [
    { key: 'name', title: 'Name', cell: n => n, sort: n => n },
    { key: 'type', title: 'Type', cell: n => assets[n].type, sort: n => assets[n].type },
    { key: 'url', title: 'URL', cell: n => assets[n].url, sort: n => assets[n].url },
    { key: 'preload', title: 'Preload', cell: n => (assets[n].preload ? '✓' : ''), sort: n => (assets[n].preload ? 1 : 0) },
    { key: 'nearest', title: 'Nearest', cell: n => (assets[n].nearest === undefined ? '' : assets[n].nearest ? '✓' : 'no'), sort: n => String(assets[n].nearest ?? '') },
    { key: 'facing', title: 'Facing', cell: n => facingText(assets[n]), sort: n => facingText(assets[n]) },
    { key: 'loads', title: 'Loads', cell: n => <LoadBadge tried={loads(n).tried} text={loadText(loads(n).tried)} />, sort: n => loadText(loads(n).tried) },
    {
      key: 'back', title: 'Read-back', sort: backRank,
      cell: n => {
        if (assets[n].type !== 'sheet') return ''
        const b = backOf(n)
        if (!b) return <Badge tone="dim">waiting</Badge>
        if (b.error !== undefined) return <Badge tone="danger">unread</Badge>
        const k = travelled(b.back!, travel).problems.length
        return k ? <Badge tone="danger">{problemsOf(k)}</Badge> : <Badge tone="accent">clean</Badge>
      },
    },
  ]

  const bar = (
    <Toolbar label="assets">
      <Select<string> label="scene" value={scene} options={scenes.map(n => ({ value: n }))} onChange={onScene} />
      <Badge>{names.length} entries</Badge>
      <Badge tone="dim">{file}</Badge>
      <span className="ui-spacer" />
      <Badge tone={backs.left ? 'dim' : undefined}>{backs.left ? `read back ${sheets.length - backs.left} of ${sheets.length} sheets` : `${sheets.length} sheets read back`}</Badge>
      <Button title="Try every entry" disabled={!gameLoader || !asking.length} onClick={tryAll}>Try every entry</Button>
      <Button title="Check again" onClick={() => { readAgain(ed); checks.clear(); backs.clear() }}>Check again</Button>
    </Toolbar>
  )
  const main = (
    <>
      {!gameLoader && <Note>The game view shows {s.viewing ?? 'no scene'}, not {scene}: its entries are tried through their files, as far as the editor can tell without the game.</Note>}
      <Table<string> label="catalogue" rows={names} columns={columns} keyOf={n => n} selected={selected} onSelect={choose} />
      <Section title="Add a sheet" open={false}>
        <AddSheet scene={scene} file={file} assets={assets} onAdded={name => setPick({ name, selection: ed.selection })} />
      </Section>
      <Section title="Travelling clips" extra={<Badge>{travel.length}</Badge>} open={false}>
        <TravelList travel={travel} onChange={keep} />
      </Section>
    </>
  )
  const side = selected === undefined
    ? <Empty>Select an entry to see its fields, how it was tried and, for a sheet, its read-back.</Empty>
    : (
      <Detail
        key={selected}
        name={selected}
        a={assets[selected]}
        scene={scene}
        file={file}
        game={game(selected)}
        viewing={!!gameLoader}
        checked={checkOf(selected)}
        backed={backOf(selected)}
        travel={travel}
        onTravel={keep}
      />
    )
  return <PanelBody bar={bar}><Split main={main} side={side} /></PanelBody>
}

const facingText = (a: Asset) => {
  const f = a.facing
  if (!f) return ''
  return [f.first ?? 0, f.step ?? 0].join(' ') + (f.mirror ? ' mirror' : '')
}

function LoadBadge({ tried, text }: { tried: Game | undefined; text: string }) {
  const tone = tried === undefined || tried === 'trying' ? 'dim' : tried.ok ? 'accent' : 'danger'
  return <Row><Badge tone={tone}>{text}</Badge>{tried !== undefined && tried !== 'trying' && <Badge tone="dim">{tried.by}</Badge>}</Row>
}

// ---------------------------------------------------------------- an entry

const KINDS: Record<Problem['kind'], string> = { line: 'off its line', apart: 'one drawing apart', unrelated: 'unrelated', slice: 'slice' }

function Detail({ name, a, scene, file, game, viewing, checked, backed, travel, onTravel }: {
  name: string
  a: Asset
  scene: string
  file: string
  game: Game | undefined
  viewing: boolean
  checked: Checked | undefined
  backed: Backed | undefined
  travel: string[]
  onTravel(travel: string[]): void
}) {
  const ed = useEditor(['game'])
  const s = ed.session!
  const given = (s.files.get(file)?.world?.loader ?? {}) as Record<string, unknown>
  // The entry made `entry`, or taken out, as `entryEdits` writes it; refused, saying why.
  const put = (entry: Record<string, unknown> | null) => {
    let edits: (FileEdit & { file: string })[]
    try {
      edits = entryEdits(ed, scene, name, entry)
    } catch (e) {
      ed.error(`loader: ${(e as Error).message}`)
      return
    }
    void written(ed, edits).catch(() => {})
  }
  // A field of the entry, at its path under the catalogue, set as the file holds the entry.
  const field = (at: Path, v: unknown) => {
    const was = structuredClone(((given.assets ?? {}) as Record<string, Asset>)[name] ?? a) as Record<string, unknown>
    putAt(was, at.slice(2), v)
    put(was)
  }
  const sheet = a.type === 'sheet'
  return (
    <>
      <Section title={<>{name}</>} extra={<Button title={`remove ${name}`} onClick={() => put(null)}>✕</Button>}>
        <PropertyGrid value={a} at={['assets', name]} owner={{ kind: 'loader', scene, data: given }} onChange={(at, v, done) => { if (done) field(at, v) }} />
      </Section>
      <Section title="Loads">
        <LabelledRow label="game">
          {game === undefined
            ? <Note>{viewing ? 'Not loaded yet: Try every entry asks the game\'s loader for it.' : `The game view does not show ${scene}, so the game has not tried it.`}</Note>
            : game === 'trying' ? <Badge tone="dim">trying…</Badge> : <Said tried={game} />}
        </LabelledRow>
        <LabelledRow label="files">{checked ? <Said tried={checked.tried} /> : <Badge tone="dim">checking…</Badge>}</LabelledRow>
      </Section>
      {sheet && <SheetDetail a={a} backed={backed} travel={travel} onTravel={onTravel} />}
      {sheet && (
        <Section title="Swap" open={false}>
          <SwapSheet name={name} a={a} file={file} />
        </Section>
      )}
      {a.type === 'pixels' && (
        <Section title="Slice" open={false}>
          <SliceSheet scene={scene} a={a} file={file} assets={(given.assets ?? {}) as Record<string, Asset>} />
        </Section>
      )}
    </>
  )
}

// What trying an entry came to, in its own words.
function Said({ tried }: { tried: Tried }) {
  return <Row><Badge tone={tried.ok ? 'accent' : 'danger'}>{tried.ok ? (tried.by === 'game' ? 'loaded' : 'files read') : 'fails'}</Badge><span>{tried.what}</span></Row>
}

const standsText = (b: ReadBack) =>
  b.stands === 'lines' ? 'on the lines its anchors draw' : b.stands === 'air' ? `in the air, over its ${b.shadows.join(', ')} clip${b.shadows.length > 1 ? 's' : ''}` : 'on nothing: drawn about its middles'

function SheetDetail({ a, backed, travel, onTravel }: { a: Asset; backed: Backed | undefined; travel: string[]; onTravel(travel: string[]): void }) {
  const ed = useEditor([])
  const got = useSheet(a)
  const sheet = got && 'sheet' in got ? got.sheet : undefined
  const toggle = (clip: string) => {
    const t = travels(ed, clip, !travel.includes(clip))
    if ('travel' in t) onTravel(t.travel)
  }
  let back: ReactNode
  if (!backed) back = <Note>Reading its pages back…</Note>
  else if (backed.error !== undefined) back = <Note>It could not be read back: {backed.error}</Note>
  else {
    const all = backed.back!
    const shown = travelled(all, travel)
    // Every clip with a problem, a travelling clip's too, so it can be said to travel no more.
    const clips = [...new Set(all.problems.map(p => p.clip))]
    back = (
      <>
        <LabelledRow label="stands">{standsText(all)}</LabelledRow>
        {!clips.length && <Row><Badge tone="accent">clean</Badge><span>Every run on its line, no one drawing apart, no neighbours unrelated, every slice on every run.</span></Row>}
        {clips.map(clip => {
          const here = shown.problems.filter(p => p.clip === clip)
          const runs = [...new Set(here.map(p => p.run))]
          return (
            <Section
              key={clip}
              title={<>{clip}</>}
              extra={
                <>
                  <Badge tone={here.length ? 'danger' : 'accent'}>{here.length ? problemsOf(here.length) : 'clean'}</Badge>
                  <Button title={`${clip} travels`} pressed={travel.includes(clip)} onClick={() => toggle(clip)}>travels</Button>
                </>
              }
            >
              {travel.includes(clip) && <Note>{clip} travels: its neighbouring frames are not compared.</Note>}
              {runs.map(run => (
                <LabelledRow key={String(run)} label={run === undefined ? 'its runs' : `run ${run}`}>
                  {here.filter(p => p.run === run).map((p, i) => <Row key={i}><Badge tone="danger">{KINDS[p.kind]}</Badge><span>{p.what}</span></Row>)}
                </LabelledRow>
              ))}
            </Section>
          )
        })}
      </>
    )
  }
  return (
    <>
      <Section title="Read-back">{back}</Section>
      <Section title="Slices" extra={sheet && <Badge>{Object.keys(sheet.slices).length}</Badge>}>
        {!got ? <Note>Reading it…</Note>
          : !sheet ? <Note>Its file does not read as a sheet.</Note>
          : !Object.keys(sheet.slices).length ? <Note>It has no slices.</Note>
          : slicesOf(sheet).map(k => (
            <LabelledRow key={k.slice} label={k.slice}>
              {k.clips.map(c => (
                <Row key={c.clip}>
                  <Badge tone={c.on === 0 ? 'dim' : c.on === c.runs && c.frames.length === 1 ? 'accent' : 'danger'}>{`${c.clip} ${c.on}/${c.runs}`}</Badge>
                  <span>{c.on === 0 ? 'no key' : `on frame${c.frames.length > 1 ? 's' : ''} ${c.frames.join(', ')}`}</span>
                </Row>
              ))}
            </LabelledRow>
          ))}
      </Section>
    </>
  )
}

function TravelList({ travel, onChange }: { travel: string[]; onChange(travel: string[]): void }) {
  const ed = useEditor(['game', 'x.loader'])
  const [draft, setDraft] = useState('')
  // A clip said to travel, or no more, as `travels` says it may be.
  const set = (clip: string, on: boolean) => {
    const t = travels(ed, clip, on)
    if ('travel' in t) onChange(t.travel)
  }
  const adding = travels(ed, draft, true)
  return (
    <>
      <Note>Clips whose frames move across the ground on purpose, as a body falling does: their neighbouring frames are not compared. Kept in this browser.</Note>
      {travel.map(c => (
        <LabelledRow key={c} label={c} extra={<Button title={`${c} travels no more`} onClick={() => set(c, false)}>✕</Button>}>
          <Badge tone="dim">travels</Badge>
        </LabelledRow>
      ))}
      <LabelledRow label="clip" extra={
        <Button title="add a travelling clip" disabled={'why' in adding} onClick={() => { set(draft, true); setDraft('') }}>Add</Button>
      }>
        <TextField label="travelling clip" value={draft} onChange={setDraft} />
      </LabelledRow>
      {draft.trim() && 'why' in adding && <Note>Not added: {adding.why}.</Note>}
    </>
  )
}

// ---------------------------------------------------------------- bringing a sheet in

// A sheet on this machine, looked at by the loader's route whenever its path is given.
function useLook() {
  const ed = useEditor([])
  const [from, setFrom] = useState('')
  const [seen, setSeen] = useState<{ from: string; look?: Look; error?: string }>()
  const run = (at: string) => {
    setFrom(at)
    setSeen(undefined)
    if (!at.trim()) return
    look(at.trim()).then(
      l => setSeen(s => (s && s.from !== at ? s : { from: at, look: l })),
      (e: Error) => {
        ed.error(`loader: ${e.message}`)
        setSeen(s => (s && s.from !== at ? s : { from: at, error: e.message }))
      },
    )
  }
  const now = seen?.from === from ? seen : undefined
  return { from: from.trim(), set: run, look: now?.look, error: now?.error, ready: !!now?.look && now.look.pages.every(p => p.there) }
}

function Looked({ look, error }: { look: Look | undefined; error: string | undefined }) {
  if (error !== undefined) return <Row><Badge tone="danger">refused</Badge><span>{error}</span></Row>
  if (!look) return null
  return (
    <>
      <LabelledRow label="frames">{look.frames}</LabelledRow>
      <LabelledRow label="clips">{look.clips.map(c => <Row key={c.name}><Badge>{c.name}</Badge><span>{`${c.runs} run${c.runs === 1 ? '' : 's'} of ${c.length}${c.loop ? ', loops' : ''}`}</span></Row>)}</LabelledRow>
      <LabelledRow label="slices">{look.slices.length ? look.slices.map(sl => <Row key={sl.name}><Badge>{sl.name}</Badge><span>{`${sl.keys} key${sl.keys === 1 ? '' : 's'}`}</span></Row>) : 'none'}</LabelledRow>
      {look.packs.length > 0 && <LabelledRow label="packs">{look.packs.map(p => <Row key={p.name}><Badge>pack</Badge><span>{p.name}</span></Row>)}</LabelledRow>}
      <LabelledRow label="pages">{look.pages.map(p => <Row key={p.name}><Badge tone={p.there ? 'accent' : 'danger'}>{p.there ? 'there' : 'missing'}</Badge><span>{p.name}</span></Row>)}</LabelledRow>
    </>
  )
}

function AddSheet({ scene, file, assets, onAdded }: { scene: string; file: string; assets: Record<string, Asset>; onAdded(name: string): void }) {
  const ed = useEditor([])
  const src = useLook()
  const sheets = Object.keys(assets).filter(n => assets[n].type === 'sheet')
  const [to, setTo] = useState<string>()
  const [name, setName] = useState<string>()
  const [like, setLike] = useState<string>()
  const [preload, setPreload] = useState<boolean>()
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string>()
  // Drawn, unless another is picked, as the first sheet in the folder it goes into is.
  const plan = addPlan(scene, assets, src.from, { folder: to, name, like: like !== undefined && sheets.includes(like) ? like : undefined, preload })
  const { folder, entry, sibling, loads } = plan
  const add = async () => {
    setBusy(true)
    setSaid(undefined)
    try {
      const done = await addSheet(ed, file, entry, plan.from, folder, plan.like, loads, replace)
      setSaid(`Copied ${done.files.join(', ')} and added ${entry}.`)
      setName(undefined)
      onAdded(entry)
      ed.select({ file: pathOf(done.url) })
    } catch (e) {
      ed.error(`loader: ${(e as Error).message}`)
      setSaid(`Refused: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <LabelledRow label="from" title="the absolute path of a sheet's .json on this machine">
        <TextField label="sheet to add" value={src.from} onChange={src.set} />
      </LabelledRow>
      <Looked look={src.look} error={src.error} />
      <LabelledRow label="into"><TextField label="folder to copy into" value={folder} onChange={setTo} /></LabelledRow>
      <LabelledRow label="name">
        <TextField label="entry name" value={entry} onChange={setName} />
      </LabelledRow>
      <LabelledRow label="drawn like">
        {sheets.length
          ? <Select<string> label="drawn like" value={sibling} options={sheets.map(n => ({ value: n }))} onChange={setLike} />
          : <Note>No other sheet: it is drawn as its file says.</Note>}
      </LabelledRow>
      {sibling && <LabelledRow label="drawing">{JSON.stringify(drawing(assets[sibling]))}</LabelledRow>}
      <LabelledRow label="preload"><Check label="preload" value={loads} onChange={setPreload} /></LabelledRow>
      <LabelledRow label="replace"><Check label="replace the files" value={replace} onChange={setReplace} /></LabelledRow>
      <Row>
        <Button primary title="Copy and add" disabled={busy || !src.ready || !!plan.why} onClick={() => void add()}>Copy and add</Button>
      </Row>
      {src.from && plan.why && <Note>Not added: {plan.why}.</Note>}
      {said && <Note>{said}</Note>}
      <Note>Copying and adding the entry is one change the editor can undo: the undo takes the copied files away, and puts back any it wrote over.</Note>
    </>
  )
}

// A picture cut into a sheet, and an entry added for it, as `sliceSheet` does.
function SliceSheet({ scene, a, file, assets }: { scene: string; a: Asset; file: string; assets: Record<string, Asset> }) {
  const ed = useEditor([])
  const sheets = Object.keys(assets).filter(n => assets[n].type === 'sheet')
  const picture = pathOf(a.url)
  const [tile, setTile] = useState(0)
  const [marks, setMarks] = useState<number[]>([])
  const [loose, setLoose] = useState(0)
  const [to, setTo] = useState<string>()
  const [name, setName] = useState<string>()
  const [like, setLike] = useState<string>()
  const [preload, setPreload] = useState<boolean>()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string>()
  // Drawn, unless another is picked, as the first sheet in the folder it goes into is.
  const plan = slicePlan(scene, assets, a, { tile, into: to, name, like: like !== undefined && sheets.includes(like) ? like : undefined, preload })
  const { into, entry, sibling, loads } = plan
  const cut = async () => {
    setBusy(true)
    setSaid(undefined)
    try {
      const done = await sliceSheet(ed, file, entry, picture, into, { tile, marks, loose }, plan.like, loads)
      setSaid(`Cut ${picture} into ${done.files.join(', ')} and added ${entry}.`)
      setName(undefined)
      ed.select({ file: pathOf(done.url) })
    } catch (e) {
      ed.error(`loader: ${(e as Error).message}`)
      setSaid(`Refused: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <LabelledRow label="tile" title="the width of one tile of the picture, in pixels, an even number">
        <NumberField label="tile width" integer value={tile} onChange={v => setTile(v)} />
      </LabelledRow>
      <LabelledRow label="marks" title="the colours the ripper put a frame's bottom mark in, alone">
        <>
          {marks.map((m, i) => (
            <Row key={i}>
              <ColorField label={`mark ${i + 1}`} value={m} onChange={v => setMarks(marks.map((x, k) => (k === i ? Number(v) : x)))} />
              <Button title={`remove mark ${i + 1}`} onClick={() => setMarks(marks.filter((_, k) => k !== i))}>✕</Button>
            </Row>
          ))}
          <Button title="add a mark's colour" onClick={() => setMarks([...marks, 0])}>Add a colour</Button>
        </>
      </LabelledRow>
      <LabelledRow label="loose" title="the fewest pixels a sprite on no tile has to be a frame of its own; 0 for none">
        <NumberField label="loose pixels" integer value={loose} onChange={v => setLoose(Math.max(0, v))} />
      </LabelledRow>
      <LabelledRow label="into" title="the sheet to write, a .json of the repo; its page is written beside it">
        <TextField label="sheet to write" value={into} onChange={setTo} />
      </LabelledRow>
      <LabelledRow label="name"><TextField label="entry name" value={entry} onChange={setName} /></LabelledRow>
      <LabelledRow label="drawn like">
        {sheets.length
          ? <Select<string> label="drawn like" value={sibling} options={sheets.map(n => ({ value: n }))} onChange={setLike} />
          : <Note>No other sheet: it is drawn as its file says.</Note>}
      </LabelledRow>
      <LabelledRow label="preload"><Check label="preload" value={loads} onChange={setPreload} /></LabelledRow>
      <Row>
        <Button primary title="Cut and add" disabled={busy || !!plan.why} onClick={() => void cut()}>Cut and add</Button>
      </Row>
      {plan.why && <Note>Not cut: {plan.why}.</Note>}
      {said && <Note>{said}</Note>}
      <Note>Cutting and adding the entry is one change the editor can undo: the undo takes the sheet and its page away, or puts back any it wrote over.</Note>
    </>
  )
}

function SwapSheet({ name, a, file }: { name: string; a: Asset; file: string }) {
  const ed = useEditor([])
  const src = useLook()
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string>()
  const path = pathOf(a.url)
  const plan = swapPlan(name, a, src.from, replace)
  const own = plan.own
  const swap = async () => {
    setBusy(true)
    setSaid(undefined)
    try {
      const done = await swapSheet(ed, file, name, a, plan.from, replace)
      setSaid(own ? `Wrote over ${done.files.join(', ')}; the game reads them now.` : `Copied ${done.files.join(', ')}; ${name} now names ${done.url}.`)
    } catch (e) {
      ed.error(`loader: ${(e as Error).message}`)
      setSaid(`Refused: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <LabelledRow label="from" title="the absolute path of a sheet's .json on this machine">
        <TextField label={`sheet to swap into ${name}`} value={src.from} onChange={src.set} />
      </LabelledRow>
      <Looked look={src.look} error={src.error} />
      <LabelledRow label="into">{folderOf(a.url)}</LabelledRow>
      <LabelledRow label="replace"><Check label="replace the files" value={replace} onChange={setReplace} /></LabelledRow>
      {src.from && (own
        ? <Note>It has {name}'s own file name, {fileName(path)}: its files are written over{replace ? '' : ', only with replace the files ticked'}, and one undo puts them back.</Note>
        : <Note>It is copied beside {fileName(path)}, and {name}'s url set to it: one change the editor can undo, which takes the copied files away.</Note>)}
      <Row>
        <Button primary title="Copy in" disabled={busy || !src.ready || !!plan.why} onClick={() => void swap()}>Copy in</Button>
      </Row>
      {said && <Note>{said}</Note>}
    </>
  )
}

// ---------------------------------------------------------------- the Sheets panel

const ZOOMS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16]

// ---------------------------------------------------------------- reading

const parse = (text: string | undefined): Json => {
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- the panel

type Player = { clip: string; run: number; mirror: boolean; place: number; ft: number; steps: number; playing: boolean }
// What a row selected in the game view says of the clip it plays: its sheet, clip, frame and
// palette, and the way sprite2d draws it facing, when the game view draws its scene with render2d.
// `row` is the row and what it plays, which a panel follows once; the way is known only once the
// view's client has drawn, and when it comes, or changes as the row turns, it turns the clip shown
// that way and chooses nothing else.
type Follow = { row: string; sheet: string; clip: string; frame: number; palette: string; way?: number }

function followOf(ed: Editor, assets: Record<string, Entry>): Follow | undefined {
  const sel = ed.selection
  if (!sel || !('id' in sel)) return undefined
  const row = ed.session?.row(sel.scene, sel.id)
  const d = row?.data
  if (!row || !d) return undefined
  // A kind sprite2d or sprite3d draws looks as that plugin draws it (`plays`).
  const { sheet, clip, facing, sprite2d: spec } = plays(ed, sel.scene, row)
  if (typeof sheet !== 'string' || typeof clip !== 'string' || assets[sheet]?.type !== 'sheet') return undefined
  const plugins = ed.session?.viewing === sel.scene ? ed.session.client?.plugins : undefined
  let way: number | undefined
  // render2d knows which way a heading is drawn once it has drawn its world.
  try {
    way = plugins?.render2d && spec && typeof facing === 'number' ? plugins.render2d.turns(facing / spec.turn) : undefined
  } catch {
    way = undefined
  }
  return {
    row: `${sel.scene}:${sel.id}:${sheet}:${clip}`,
    sheet,
    clip,
    frame: typeof d.frame === 'number' ? d.frame : 0,
    palette: typeof d.palette === 'string' ? d.palette : '',
    way,
  }
}

// The scene whose catalogue has a sheet entry for file `path`, the first one that has, and the entry.
function sheetOfFile(ed: Editor, path: string): { scene: string; sheet: string } | undefined {
  for (const [scene, t] of ed.session?.scenes() ?? []) {
    const assets = (t.world.loader?.assets ?? {}) as Record<string, Entry>
    const sheet = Object.keys(assets).find(n => assets[n].type === 'sheet' && pathOf(assets[n].url) === path)
    if (sheet) return { scene, sheet }
  }
  return undefined
}

export function Sheets() {
  const ed = useEditor(['game', 'selection'])
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const [followed, setFollowed] = useState<string | undefined>(undefined)
  // A sheet's file selected, as the Assets panel and a game's roster select one, shows that sheet
  // from the catalogue that has it, until a row is followed.
  const [home, setHome] = useState<string | undefined>(undefined)
  const sel = ed.selection
  const file = sel && 'file' in sel ? sheetOfFile(ed, sel.file) : undefined
  if (file && `file:${sel && 'file' in sel ? sel.file : ''}` !== followed) {
    setFollowed(`file:${sel && 'file' in sel ? sel.file : ''}`)
    setHome(file.scene)
    setChosen(file.sheet)
  }
  const focused = ed.focus('loader')
  const s = ed.session
  const row = !!sel && 'id' in sel
  const lo = !row && home !== undefined && s?.scenes().has(home) ? home : focused?.scene
  const assets = ((lo !== undefined && catalogueOf(ed, lo)?.assets) || {}) as Record<string, Entry>
  const follow = followOf(ed, assets)
  // A row selected that plays a clip shows its sheet, until another is chosen.
  if (follow && follow.row !== followed) {
    setFollowed(follow.row)
    setHome(undefined)
    setChosen(follow.sheet)
  }
  if (!s) return <Empty>Open a game, and the sheets of the scene selected are played here.</Empty>
  if (!lo) return <Empty>No scene of {s.game.name} has a loader.</Empty>
  const sheets = Object.entries(assets).filter(([, a]) => a.type === 'sheet').map(([n]) => n)
  if (!sheets.length) return <Empty>The catalogue of {lo} has no sheet.</Empty>
  const name = chosen !== undefined && sheets.includes(chosen) ? chosen : sheets[0]
  return (
    <SheetView
      key={`${name}:${assets[name].url}`}
      name={name}
      entry={assets[name]}
      assets={assets}
      sheets={sheets}
      follow={follow?.sheet === name ? follow : undefined}
      session={s}
      onSheet={setChosen}
    />
  )
}

// A sheet entry's sheet as the game reads it (`sheetFrom`), from its file and every pack of it as the
// editor last read or wrote them; undefined until each has been read, and the loader's words when it
// cannot be.
function useSheet(entry: Entry): Got | { error: string } | undefined {
  const [main] = useTexts([pathOf(entry.url)])
  const packUrls = packsNamed(entry, parse(main))
  const packTexts = useTexts(packUrls.map(pathOf))
  const texts = [main, ...packTexts]
  const version = texts.join('\u0000')
  return useMemo(() => {
    if (texts.some(t => t === undefined)) return undefined
    try {
      return sheetFrom(entry, [entry.url, ...packUrls], version.split('\u0000'))
    } catch (e) {
      return { error: (e as Error).message }
    }
    // `version` is every text the sheet is read from, and changes whenever one does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, entry])
}

function SheetView({ name, entry, assets, sheets, follow, session, onSheet }: {
  name: string
  entry: Entry
  assets: Record<string, Entry>
  sheets: string[]
  follow: Follow | undefined
  session: Session
  onSheet(name: string): void
}) {
  const paletteNames = Object.entries(assets).filter(([, a]) => a.type === 'palette').map(([n]) => n)
  const paletteTexts = useTexts(paletteNames.map(n => pathOf(assets[n].url)))

  // The sheet as the game reads it, each frame where its file writes it and each clip's first run's tag.
  const got = useSheet(entry)
  // Its pages are read at their generation: how many times the panel was told to check again, and
  // each page's writes.
  const pageUrls = got && 'sheet' in got ? got.sheet.pages : []
  const ed = useEditor(['x.loader', 'texts'], pageUrls.map(pathOf))
  const paletteKey = paletteTexts.join('\u0000')
  const palettes = useMemo<Palettes>(() => new Map(paletteNames.flatMap((n, i): [string, number[] | string][] => {
    const text = paletteTexts[i]
    return text === undefined ? [] : [[n, paletteOf(text, assets[n].url)]]
    // `paletteKey` is every palette's text, and changes whenever one does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [paletteKey, assets])
  const { pixels: pages, error: pageError } = usePixels(pageUrls.map(p => readAt(ed, p)))

  const bar = (extra?: ReactNode) => (
    <Toolbar label="sheet">
      <Select<string> label="sheet" value={name} options={sheets.map(n => ({ value: n }))} onChange={onSheet} />
      {extra}
    </Toolbar>
  )
  const url = <Badge tone="dim">{entry.url}</Badge>
  if (!got) return <PanelBody bar={bar(url)}><Empty>Reading {entry.url}…</Empty></PanelBody>
  if ('error' in got) return <PanelBody bar={bar(url)}><Empty>{name} cannot be read: {got.error}</Empty></PanelBody>
  if (!Object.keys(got.sheet.clips).length) return <PanelBody bar={bar(url)}><Empty>{name} has no clip.</Empty></PanelBody>
  return (
    <Player
      bar={bar}
      name={name}
      entry={entry}
      got={got}
      pages={pages}
      pageError={pageError}
      palettes={palettes}
      follow={follow}
      session={session}
      put={make => {
        let edits: Write[]
        try {
          edits = make()
        } catch (e) {
          ed.error(`loader: ${(e as Error).message}`)
          return
        }
        void sheetWrite(ed, edits).catch(() => {})
      }}
    />
  )
}

function Player({ bar, name, entry, got, pages, pageError, palettes, follow, session, put }: {
  bar(extra?: ReactNode): ReactNode
  name: string
  entry: Entry
  got: Got
  pages: Pixels[] | undefined
  pageError: string | undefined
  palettes: Palettes
  follow: Follow | undefined
  // The open game, whose steps a clip plays in and whose clock it plays on.
  session: Session
  // Writes the edits `make` makes, or says why it refuses.
  put(make: () => Write[]): void
}) {
  // The picture is drawn in the theme's colours.
  const ed = useEditor(['theme'])
  const dt = session.rec.dt
  const { sheet, packs, tags } = got
  const clips = Object.keys(sheet.clips)
  const start = (clip: string): Player => ({ clip, run: 0, mirror: false, place: 0, ft: 0, steps: 0, playing: false })
  const [p, setP] = useState<Player>(() => start(clips[0]))
  const [look, setLook] = useState<ClipLook & { palette: string }>({ zoom: 0, checker: true, colour: '#6b8cff', onion: false, palette: '' })
  const [filter, setFilter] = useState('')
  const [followed, setFollowed] = useState<{ row: string; way?: number }>()
  // A row selected that plays a clip of this sheet: the clip, the way, the frame and the palette it
  // is drawn in; the way, when it comes later or changes as the row turns, turns the clip shown that
  // way.
  if (follow && sheet.clips[follow.clip] && (follow.row !== followed?.row || follow.way !== followed.way)) {
    setFollowed({ row: follow.row, way: follow.way })
    if (follow.row !== followed?.row) {
      const facing = follow.way !== undefined ? pick(sheet, follow.clip, follow.way) : { run: 0, mirror: false }
      const n = sheet.clips[follow.clip].runs[0].length
      setP({ ...start(follow.clip), ...facing, place: Math.max(0, Math.min(n - 1, follow.frame)) })
      setLook(l => ({ ...l, palette: follow.palette }))
    } else if (follow.way !== undefined) setP(q => ({ ...q, ...pick(sheet, sheet.clips[q.clip] ? q.clip : follow.clip, follow.way!) }))
  }
  const clip = sheet.clips[p.clip] ? p.clip : clips[0]
  const c = sheet.clips[clip]
  const run = Math.min(p.run, c.runs.length - 1)
  const ids = c.runs[run]
  const place = Math.min(p.place, ids.length - 1)
  const timed = !!c.durations
  const src = sourceOf(packs, clip)

  // Playing: the loader's `play`, a step of `dt` at a time, after each frame of the editor's clock
  // (`Session.onFrame`) as many steps as the machine's clock owes since the one before.
  useEffect(() => {
    if (!p.playing || !timed) return
    let last = performance.now(), owed = 0
    return session.onFrame(() => {
      const now = performance.now()
      owed += Math.min((now - last) / 1000, 0.25)
      last = now
      let n = 0
      while (owed >= dt) {
        owed -= dt
        n++
      }
      if (n) setP(q => {
        let [at, ft] = [q.place, q.ft]
        for (let i = 0; i < n; i++) [at, ft] = play(sheet, clip, at, ft, dt)
        return { ...q, place: at, ft, steps: q.steps + n }
      })
    })
  }, [p.playing, timed, dt, sheet, clip, session])

  const choose = (next: string) => setP(q => ({ ...start(next), run: Math.min(q.run, sheet.clips[next].runs.length - 1), mirror: q.mirror }))
  // A frame on, or back: round to the first after the last of a clip that loops, else held there.
  const stepFrame = (by: 1 | -1) => setP(q => {
    const n = ids.length
    let at = Math.min(q.place, n - 1) + by
    if (at >= n) at = c.loop ? 0 : n - 1
    if (at < 0) at = c.loop ? n - 1 : 0
    return { ...q, place: at, ft: 0, playing: false }
  })

  // The colours the sheet is drawn in: its own, or a palette of the catalogue swapped for its entry's.
  const swaps = useMemo(() => paletteChoices(sheet, palettes), [sheet, palettes])
  const palette = swaps.ok.includes(look.palette) && look.palette !== sheet.palette ? look.palette : ''
  const colours = useMemo<[number[], number[]] | undefined>(
    () => (palette ? [palettes.get(sheet.palette!) as number[], palettes.get(palette) as number[]] : undefined),
    [palette, palettes, sheet],
  )

  // Every frame of the clip, as it is drawn and as it is drawn mirrored.
  const drawn = useMemo(() => {
    const out = new Map<string, Drawn>()
    if (pages) for (const id of new Set(c.runs.flat())) for (const m of [false, true]) out.set(`${m}:${id}`, drawnOf(pages[sheet.frames[id].page], sheet.frames[id], m, colours))
    return out
  }, [pages, sheet, c, colours])
  const shown = (id: string, mirror = p.mirror) => drawn.get(`${mirror}:${id}`)
  const distinct = useMemo(() => [...new Set(ids)], [ids])
  const { skin, measures, tints } = useMemo(() => {
    const layers = drawn.size ? distinct.map(id => layerOf(drawn.get(`${p.mirror}:${id}`)!)) : []
    // Each frame against the run's first by the loader's measure; mirrored, the shift across is too.
    const first = sheet.frames[distinct[0]]
    return {
      skin: layers.length ? onion(layers) : undefined,
      measures: pages ? distinct.map(id => sheet.frames[id]).map(f => {
        const s = slip(pages[first.page], first, pages[f.page], f)
        return { ...s, dx: p.mirror && s.dx ? -s.dx : s.dx }
      }) : [],
      tints: layers.map((l, k) => silhouette(l.pixels, tint(k, layers.length))),
    }
  }, [drawn, distinct, p.mirror, pages, sheet])
  const now = shown(ids[place])

  // Every frame of the run as it stands on its anchor: what the view is fitted to.
  const box = runBox(sheet, distinct, p.mirror)

  // Drawn as `drawClip` draws it, the frame picture by picture on the canvas.
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const css = getComputedStyle(ctx.canvas)
    const image = (pic: Pixels, x: number, y: number, pw: number, ph: number) => {
      ctx.imageSmoothingEnabled = false
      const canvas = canvasOf(pic)
      if (canvas) ctx.drawImage(canvas, x, y, pw, ph)
    }
    placed.current = drawClip(ctx, image, (v, or) => css.getPropertyValue(v).trim() || or, w, h, { look, box, now, skin, sheet, json: packs[0].json, id: ids[place], mirror: p.mirror })
  }

  const key = (e: KeyboardEvent) => {
    if (e.key === ' ') setP(q => ({ ...q, playing: !q.playing && timed }))
    else if (e.key === 'ArrowRight') stepFrame(1)
    else if (e.key === 'ArrowLeft') stepFrame(-1)
    else return
    e.preventDefault()
  }

  const duration = c.durations ? ms(c.durations[place]) : undefined
  const shownClips = clips.filter(n => !filter || n.toLowerCase().includes(filter.toLowerCase()))
  // The frame shown, as its tag lists it: what a duration is written to.
  const tagFrame = src.shape === 'atlas' ? (src.runs[run]?.ids ?? []).indexOf(ids[place]) : place
  const ways = waysOf(sheet, clip)
  const facing = ways.findIndex(w => {
    const k = pick(sheet, clip, w)
    return k.run === run && k.mirror === p.mirror
  })
  const frame = sheet.frames[ids[place]]

  // The flagged pairs of every run of every clip, by the loader's measure, and of the run shown.
  const flags = useMemo(() => pages && new Map(Object.keys(sheet.clips).map(n => [n, sheet.clips[n].runs.flatMap((_, k) => pairsOf(sheet, pages, n, k).filter(flagged))])), [sheet, pages])
  const runFlags = pages ? pairsOf(sheet, pages, clip, run).filter(flagged) : undefined
  // Frame `id` stood on `at`, through the one pivot writer; nudged from its whole pixel on a sheet of
  // pixel art, which stands on whole pixels; settled onto the frame before it by the pair's shift.
  const standOn = (id: string, at: number[]) => put(() => anchorEdit(got, name, id, at))
  const nudge = (dx: number, dy: number) => standOn(ids[place], nudged(sheet, ids[place], [dx, dy]))
  const settle = (f: Pair) => { if (pages) put(() => settleEdit(got, pages, name, clip, run, f.to)) }

  // The slice a click keys, none until one is picked, and the names made here not written yet.
  const [slice, setSlice] = useState('')
  const [made, setMade] = useState<string[]>([])
  const slices = [...new Set([...sliceNames(sheet), ...made])]
  const placed = useRef<{ left: number; top: number; z: number } | undefined>(undefined)
  const down = (e: SurfacePointer) => {
    const at = placed.current
    if (!slice || !at || e.button !== 0 || src.shape !== 'atlas') return
    const u = Math.floor((e.x - at.left) / at.z), v = Math.floor((e.y - at.top) / at.z)
    const x = p.mirror ? frame.size[0] - 1 - u : u
    if (x < 0 || v < 0 || x >= frame.size[0] || v >= frame.size[1]) return
    put(() => sliceKeyEdit(got, name, clip, run, place, slice, [x, v]))
  }

  const controls = (
    <>
      <Button title={p.playing ? 'pause' : 'play'} pressed={p.playing} disabled={!timed} onClick={() => setP(q => ({ ...q, playing: !q.playing }))}>{p.playing ? '❚❚' : '▶'}</Button>
      <Button title="a frame back" onClick={() => stepFrame(-1)}>◀|</Button>
      <Button title="a frame on" onClick={() => stepFrame(1)}>|▶</Button>
      {c.runs.length > 1 && <Select<number> label="run" value={run} options={c.runs.map((_, k) => ({ value: k, label: `run ${k}` }))} onChange={k => setP(q => ({ ...q, run: k, mirror: false }))} />}
      <Select<number> label="zoom" value={look.zoom} options={ZOOMS.map(z => ({ value: z, label: z ? `${z}×` : 'fit' }))} onChange={zoom => setLook(l => ({ ...l, zoom }))} />
      <Check label="checker" value={look.checker} onChange={checker => setLook(l => ({ ...l, checker }))} />
      <span>checker</span>
      {!look.checker && <ColorField label="background" value={look.colour} onChange={(colour, done) => { if (done) setLook(l => ({ ...l, colour: String(colour) })) }} />}
      <Check label="onionskin" value={look.onion} onChange={onion => setLook(l => ({ ...l, onion }))} />
      <span>onionskin</span>
      {sheet.palette !== undefined && (
        <Select<string>
          label="palette"
          value={palette}
          options={[{ value: '', label: `${sheet.palette}, its own` }, ...swaps.ok.filter(n => n !== sheet.palette).map(n => ({ value: n }))]}
          onChange={v => setLook(l => ({ ...l, palette: v }))}
        />
      )}
      <span className="ui-spacer" />
      <Badge>{`${place + 1} / ${ids.length}`}</Badge>
      <Badge>{duration === undefined ? 'not timed' : `${duration} ms`}</Badge>
      <Badge tone="dim">{`step ${p.steps}`}</Badge>
    </>
  )

  const details = (
    <>
      {pageError && <Note>The pages could not be read: {pageError}</Note>}
      <Section title={<>Clip <Badge>{clip}</Badge></>}>
        <ClipForm name={name} got={got} src={src} clip={clip} run={run} put={put} />
      </Section>
      <Section title={<>Frame <Badge>{ids[place]}</Badge></>}>
        <LabelledRow label="place"><span className="ui-mono" aria-label="place">{`${place} of ${ids.length}, ${ms(p.ft)} ms in`}</span></LabelledRow>
        <LabelledRow label="duration">
          {!c.durations || tagFrame < 0
            ? <span className="ui-mono">{duration === undefined ? 'not timed' : `${duration} ms`}</span>
            : <NumberField label="frame duration" integer value={duration!} onChange={(v, done) => { if (done) put(() => durationEdit(got, name, clip, tagFrame, Math.max(1, Math.round(v)))) }} />}
        </LabelledRow>
        {src.shape === 'tiles'
          ? <LabelledRow label="anchor"><span className="ui-mono">{frame.anchor.join(', ')}</span></LabelledRow>
          : (
            <LabelledRow label="anchor" title="the point of the whole frame, in pixels, this frame stands on">
              <VecField label="anchor" value={frame.anchor} onChange={(v, done) => { if (done) standOn(ids[place], v) }} />
              <Button title="anchor left" onClick={() => nudge(-1, 0)}>←</Button>
              <Button title="anchor right" onClick={() => nudge(1, 0)}>→</Button>
              <Button title="anchor up" onClick={() => nudge(0, -1)}>↑</Button>
              <Button title="anchor down" onClick={() => nudge(0, 1)}>↓</Button>
            </LabelledRow>
          )}
        <LabelledRow label="kept"><span className="ui-mono">{`${frame.trim.join(', ')} of ${frame.size.join(' × ')}${frame.rotated ? ', turned on its page' : ''}`}</span></LabelledRow>
        <LabelledRow label="lowest ink" title="the lowest row at least half opaque">
          <span className="ui-mono">{now ? String(inkBottom(shown(ids[place], false)!.pixels) ?? 'none') : '…'}</span>
        </LabelledRow>
        <Strip
          label="frames"
          wrap
          selected={place}
          onSelect={i => setP(q => ({ ...q, place: Number(i), ft: 0, playing: false }))}
          items={ids.map((id, i) => ({ id: i, title: `place ${i}: ${id}`, node: <><PixelImage pixels={shown(id)?.pixels} label={id} /><span>{i}</span></> }))}
        />
      </Section>
      <Section title={<>Onionskin <Badge>{`${distinct.length} frames`}</Badge></>}>
        {!pages && <Note>Reading the pages…</Note>}
        <Strip
          label="onionskin frames"
          wrap
          selected={distinct.indexOf(ids[place])}
          onSelect={i => setP(q => ({ ...q, place: ids.indexOf(distinct[Number(i)]), ft: 0, playing: false }))}
          items={measures.map((m, i) => ({ id: i, title: `${distinct[i]} in its colour`, node: <><PixelImage pixels={tints[i]} label={distinct[i]} /><span>{m.miss.toFixed(2)}</span></> }))}
        />
        {measures.map((m, i) => (
          <LabelledRow key={distinct[i]} title={distinct[i]} label={distinct[i]}>
            <span className="ui-mono" aria-label={`onionskin ${distinct[i]}`}>{`${m.miss.toFixed(3)} at ${m.dx}, ${m.dy}: ${verdict(m.miss)}`}</span>
          </LabelledRow>
        ))}
        <Note>Each frame against the run's first, laid on it by the whole-pixel shift that fits it best, and what is left over: 0.15 or less is one drawing, and a shift there is the packer's.</Note>
      </Section>
      <Section title={<>Flags <Badge tone={runFlags?.length ? 'danger' : 'dim'}>{runFlags ? `${runFlags.length} in run ${run}` : 'measuring'}</Badge></>}>
        {runFlags && !runFlags.length && <Note>No neighbouring frames of this run are one drawing left apart, nor unrelated.</Note>}
        {runFlags?.map(f => (
          <Row key={`${f.from}-${f.to}`}>
            <Badge tone="danger">{apart(f.slip) ? 'apart' : 'unrelated'}</Badge>
            <span>{said(f)}</span>
            {apart(f.slip) && src.shape !== 'tiles' && <Button title={`settle frame ${f.to} onto frame ${f.from}`} onClick={() => settle(f)}>Settle</Button>}
          </Row>
        ))}
      </Section>
      {src.shape === 'atlas' && (
        <Section title={<>Slices <Badge>{`${slices.length}`}</Badge></>}>
          <LabelledRow label="slice" title="a pixel of the frame clicked keys this run's key of the slice there">
            <Select<string> label="slice" value={slice} options={[{ value: '', label: 'none' }, ...slices.map(n => ({ value: n }))]} onChange={setSlice} />
          </LabelledRow>
          <LabelledRow label="new slice">
            <TextField label="new slice" value="" onChange={(v, done) => { const n = v.trim(); if (done && n) { setMade(m => [...m, n]); setSlice(n) } }} />
          </LabelledRow>
          {slices.map(n => {
            const k = sheet.slices[n] ? keyed(sheet, n, clip)[run] : undefined
            return <Row key={n}><span>{k === undefined ? `${n}: no key on this run` : `${n} on frame ${k}`}</span></Row>
          })}
        </Section>
      )}
      <Section title={<>Facing <Badge>{`${ways.length} ways`}</Badge></>}>
        <Strip
          label="ways"
          wrap
          selected={facing}
          onSelect={i => setP(q => ({ ...q, ...pick(sheet, clip, ways[Number(i)]) }))}
          items={ways.map((w, i) => {
            const k = pick(sheet, clip, w)
            const id = c.runs[k.run][Math.min(place, c.runs[k.run].length - 1)]
            return { id: i, title: `${wayName(w)}: run ${k.run}${k.mirror ? ', mirrored' : ''}`, node: <><PixelImage pixels={shown(id, k.mirror)?.pixels} label={id} /><span>{wayName(w)}</span></> }
          })}
        />
        <Note>{`Run k faces ${sheet.facing.first} + k × ${sheet.facing.step} of a turn${sheet.facing.mirror ? ', and each way no run faces is drawn as the run facing its mirror image, flipped' : ''}${entry.facing ? ', as the catalogue says' : ''}.`}</Note>
      </Section>
      {sheet.palette !== undefined && (
        <Section title={<>Palette <Badge>{sheet.palette}</Badge></>} open={false}>
          {swaps.refused.map(([n, why]) => <Note key={n}>{`${n}: ${why}`}</Note>)}
          {!swaps.refused.length && <Note>{`Every palette of the catalogue may be swapped for ${sheet.palette}.`}</Note>}
        </Section>
      )}
    </>
  )

  return (
    <PanelBody bar={bar(controls)}>
      <Split
        main={
          <Split
            main={<Surface label="clip" version={[look, place, run, p.mirror, clip, drawn, skin, sheet, ed.theme]} draw={draw} onKey={key} onDown={down} />}
            side={details}
          />
        }
        side={
          <>
            <Toolbar label="clips">
              <TextField label="filter clips" value={filter} onChange={setFilter} />
              <Badge>{`${shownClips.length} / ${clips.length}`}</Badge>
            </Toolbar>
            <Tree
              label="clips"
              selected={clip}
              onSelect={choose}
              items={shownClips.map(n => ({ id: n, label: n, badge: <><ClipBadges sheet={sheet} clip={n} tag={tags.get(n)} shape={src.shape} />{!!flags?.get(n)?.length && <Badge tone="danger" title={`${flags.get(n)!.length} flagged pairs`}>{`⚑${flags.get(n)!.length}`}</Badge>}</> }))}
            />
          </>
        }
      />
    </PanelBody>
  )
}

// What the clip list says of a clip: its frames, how it plays, and its runs.
function ClipBadges({ sheet, clip, tag, shape }: { sheet: Sheet; clip: string; tag: Json; shape: Source['shape'] }) {
  const c = sheet.clips[clip]
  const frames = new Set(c.runs[0]).size
  return (
    <>
      <Badge>{`${frames}f`}</Badge>
      <Badge tone="dim">{howPlays(tag, shape)}</Badge>
      {c.runs.length > 1 && <Badge tone="accent">{`@${c.runs.length}`}</Badge>}
    </>
  )
}

// How a clip plays, and where it stands, each written into the sheet's files a value at a time, one
// undo each.
function ClipForm({ name, got, src, clip, run, put }: {
  name: string
  got: Got
  src: Source
  clip: string
  run: number
  put(make: () => Write[]): void
}) {
  const { sheet, tags } = got
  const c = sheet.clips[clip]
  const ids = c.runs[run]
  const pivots = new Set(c.runs.flat().map(id => sheet.frames[id].anchor.join(',')))
  const anchor = sheet.frames[ids[0]].anchor
  const tag = tags.get(clip)
  return (
    <>
      <LabelledRow label="runs" title="how many runs the clip has, and how many places each plays and frames it draws"><span className="ui-mono">{`${c.runs.length}, each ${ids.length} places of ${new Set(ids).size} frames`}</span></LabelledRow>
      {src.shape === 'atlas' && src.runs[0]?.tag && (
        <>
          <LabelledRow label="direction">
            <Select<string> label="direction" value={tag?.direction ?? 'forward'} options={DIRECTIONS.map(d => ({ value: d }))} onChange={d => put(() => tagEdit(got, name, clip, 'direction', d))} />
          </LabelledRow>
          <LabelledRow label="repeat" title="0 plays it round forever">
            <NumberField label="repeat" integer value={Number(tag?.repeat ?? 0)} onChange={(v, done) => { if (done) put(() => tagEdit(got, name, clip, 'repeat', Math.max(0, Math.round(v)))) }} />
          </LabelledRow>
        </>
      )}
      {src.shape === 'atlas' && !src.runs[0]?.tag && <Note>A TexturePacker animation: forward, round forever.</Note>}
      {src.shape === 'tiles' && <Note>A Tiled tile animation: forward, round forever; its tile stands on the tileset's objectalignment and tileoffset.</Note>}
      {src.shape === 'atlas' && !c.durations && (
        <LabelledRow label="timing" title="the frames are not timed: a rule picks each; this times every one">
          <NumberField label="time every frame" integer value={0} onChange={(v, done) => { if (done && v > 0) put(() => durationEdit(got, name, clip, undefined, Math.max(1, Math.round(v)))) }} />
        </LabelledRow>
      )}
      {src.shape !== 'tiles' && (
        <LabelledRow label="pivot" title="the point of the whole frame, in pixels, every frame of the clip stands on">
          <VecField label="pivot" value={anchor} onChange={(v, done) => { if (done) put(() => pivotEdit(got, name, clip, v)) }} />
        </LabelledRow>
      )}
      {pivots.size > 1 && <Note>{`Its frames stand on ${pivots.size} different points; a pivot set here stands them all on one.`}</Note>}
    </>
  )
}

// The inspector's section on a row that plays a clip of a sheet: what it plays, and the Sheets panel
// shown on it.
export function PlaysClip({ selection }: { selection: Selection }) {
  const ed = useEditor(['game'])
  if (!selection || !('id' in selection)) return null
  const row = ed.session?.row(selection.scene, selection.id)
  if (!row) return null
  const { sheet, clip } = plays(ed, selection.scene, row)
  return (
    <Row>
      <span className="ui-mono">{`${sheet} · ${clip} · frame ${row.data.frame}`}</span>
      <span className="ui-spacer" />
      <Button title="show the clip in Sheets" onClick={() => ed.reveal('loader.sheets')}>Sheets</Button>
    </Row>
  )
}

// ---------------------------------------------------------------- the Sprites panel
//
// What the panel shows, its strokes and its colour are the session's (`shownOf`, `strokesOf`,
// `colourOf` in `loader.extension.tsx`), so the panel and a call to the Sprites commands show and
// set the same pixels; only a stroke in hand, the tool, the zoom, the grid and where the frame is
// dragged are the panel's own.

type Tool = 'pencil' | 'pick'
const ZOOM_OPTIONS = ZOOMS.map(z => ({ value: z, label: z ? `${z}×` : 'fit' }))
// A colour 0xRRGGBBAA as CSS takes it.
const cssOf = (c: number) => `rgba(${c >>> 24}, ${(c >>> 16) & 255}, ${(c >>> 8) & 255}, ${(c & 255) / 255})`
// The grid is drawn between pixels drawn this many screen pixels or more across.
const GRID = 6

// Every whole point on the line from [x0, y0] to [x1, y1], both ends too.
function line([x0, y0]: [number, number], [x1, y1]: [number, number]): [number, number][] {
  const out: [number, number][] = []
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    out.push([x0, y0])
    if (x0 === x1 && y0 === y1) return out
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
}

export function Sprites() {
  const ed = useEditor(['game', 'selection', 'x.loader'])
  const [said, setSaid] = useState<string>()
  // A sheet's file selected, as the Assets panel selects one, shows that sheet from the catalogue
  // that has it, until another is picked.
  const sel = ed.selection
  const selected = sel && 'file' in sel ? sel.file : undefined
  const followed = useRef<string | undefined>(undefined)
  useEffect(() => {
    const file = selected !== undefined ? sheetOfFile(ed, selected) : undefined
    if (!file || selected === followed.current) return
    followed.current = selected
    show(ed, { scene: file.scene, sheet: file.sheet })
  })
  const s = ed.session
  if (!s) return <Empty>Open a game, and the sheets of the scene selected are touched up here.</Empty>
  const scenes = loaderScenes(ed)
  if (!scenes.length) return <Empty>No scene of {s.game.name} has a loader row.</Empty>
  // The scene picked, or the one a file selected is in the catalogue of, else the one the loader's
  // panels work on.
  const shown = spritesShown(ed)
  const scene = shown.scene !== undefined && scenes.includes(shown.scene) ? shown.scene : ed.focus('loader')!.scene
  const cat = catalogueOf(ed, scene)!
  const sheets = Object.keys(cat.assets).filter(n => cat.assets[n].type === 'sheet')
  const pickScene = <Select<string> label="scene" value={scene} options={scenes.map(n => ({ value: n }))} onChange={n => { show(ed, { scene: n, sheet: undefined }); setSaid(undefined) }} />
  if (!sheets.length) return <PanelBody bar={<Toolbar label="sprite tools">{pickScene}</Toolbar>}><Empty>The catalogue of {scene} has no sheet.</Empty></PanelBody>
  const name = shown.sheet !== undefined && sheets.includes(shown.sheet) ? shown.sheet : sheets[0]
  return (
    <SpriteSheet
      key={`${scene}:${name}:${cat.assets[name].url}`}
      name={name}
      scene={scene}
      assets={cat.assets}
      sheets={sheets}
      pickScene={pickScene}
      said={said}
      onSaid={setSaid}
      onSheet={n => { show(ed, { sheet: n }); setSaid(undefined) }}
    />
  )
}

function SpriteSheet({ name, scene, assets, sheets, pickScene, said, onSaid, onSheet }: {
  name: string
  scene: string
  assets: Record<string, Asset>
  sheets: string[]
  pickScene: ReactNode
  said: string | undefined
  onSaid(said: string | undefined): void
  onSheet(name: string): void
}) {
  const entry = assets[name]
  const got = useSheet(entry)
  const sheet = got && 'sheet' in got ? got.sheet : undefined
  // The panel's own state, the session's (`x.loader`); the pages, read at their generation, each
  // page's writes among it; and the picture, drawn in the theme's colours.
  const ed = useEditor(['x.loader', 'theme', 'texts'], (sheet?.pages ?? []).map(pathOf))
  const { pixels: pages, error: pageError } = usePixels(sheet ? sheet.pages.map(p => readAt(ed, p)) : [])
  const [tool, setTool] = useState<Tool>('pencil')
  const [zoom, setZoom] = useState(0)
  const [grid, setGrid] = useState(true)
  const [filter, setFilter] = useState('')
  const [hover, setHover] = useState<[number, number]>()
  const [busy, setBusy] = useState(false)
  // Drawn again with each pixel set of a stroke in hand.
  const [live, setLive] = useState(0)
  const painting = useRef<{ paints: Paints; last: [number, number] } | undefined>(undefined)
  const placed = useRef<{ left: number; top: number; z: number } | undefined>(undefined)
  // How far a right or middle drag has moved the frame from the middle, and where that drag was.
  const [pan, setPan] = useState<[number, number]>([0, 0])
  const panning = useRef<{ x: number; y: number; from: [number, number] } | undefined>(undefined)
  const [to, setTo] = useState<string>()
  const [entryName, setEntryName] = useState<string>()
  const [add, setAdd] = useState(true)
  const [replace, setReplace] = useState(false)

  const version = spritesVersion(ed)
  const strokes = strokesOf(ed, entry.url)
  const paints = paintsOf(ed, entry.url)
  const count = unsaved(paints)
  const colour = colourOf(ed)
  const path = pathOf(entry.url)
  const ending = path.slice(path.lastIndexOf('.'))
  const into = to ?? `${path.slice(0, -ending.length)}-copy${ending}`
  const newName = entryName ?? baseName(into).replace(/\.tsj$/i, '')
  const taken = add && newName in assets
  const intoOk = into.toLowerCase().endsWith(ending.toLowerCase()) && pathOf(into) !== path

  // Every frame's picture, with the pixels set, drawn again whenever they change, and not while a
  // stroke is in hand.
  const pictures = useMemo(() => {
    const out = new Map<string, Pixels>()
    if (sheet && pages) for (const id of sheet.order) {
      const f = sheet.frames[id]
      out.set(id, keptPixels(pages[f.page], paintsOf(ed, entry.url).get(sheet.pages[f.page])?.set, f))
    }
    return out
    // `version` counts every change to the pixels set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, pages, version, ed, entry.url])

  const bar = (extra?: ReactNode) => (
    <Toolbar label="sprite tools">
      {pickScene}
      <Select<string> label="sheet" value={name} options={sheets.map(n => ({ value: n }))} onChange={onSheet} />
      {extra}
    </Toolbar>
  )
  if (!got) return <PanelBody bar={bar(<Badge tone="dim">{entry.url}</Badge>)}><Empty>Reading {entry.url}…</Empty></PanelBody>
  if ('error' in got) return <PanelBody bar={bar(<Badge tone="dim">{entry.url}</Badge>)}><Empty>{name} cannot be read: {got.error}</Empty></PanelBody>
  const ids = got.sheet.order
  if (!ids.length) return <PanelBody bar={bar()}><Empty>{name} has no frame.</Empty></PanelBody>
  const picked = spritesShown(ed).frames.get(entry.url)
  const id = picked !== undefined && ids.includes(picked) ? picked : ids[0]
  const f = got.sheet.frames[id]
  const page = pages?.[f.page]
  const pageUrl = got.sheet.pages[f.page]
  // The pixels set on the frame's page: a new map for each stroke kept, taken back or reverted, and the
  // same one while a stroke in hand sets more of it (`live`).
  const set = paints.get(pageUrl)?.set
  const now = page && keptPixels(page, set, f)

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const css = getComputedStyle(ctx.canvas)
    const theme = (v: string, or: string) => css.getPropertyValue(v).trim() || or
    const a = theme('--field', '#18191c'), b = theme('--hover', '#34373d')
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      ctx.fillStyle = ((x + y) / 8) % 2 ? a : b
      ctx.fillRect(x, y, 8, 8)
    }
    if (!now) return
    const z = zoom || Math.max(1, Math.floor(Math.min((w * 0.9) / now.width, (h * 0.9) / now.height)))
    const left = Math.round((w - now.width * z) / 2 + pan[0]), top = Math.round((h - now.height * z) / 2 + pan[1])
    placed.current = { left, top, z }
    ctx.imageSmoothingEnabled = false
    const canvas = canvasOf(now)
    if (canvas) ctx.drawImage(canvas, left, top, now.width * z, now.height * z)
    ctx.lineWidth = 1
    if (grid && z >= GRID) {
      ctx.strokeStyle = theme('--border', 'rgba(255, 255, 255, 0.12)')
      ctx.beginPath()
      for (let u = 1; u < now.width; u++) { ctx.moveTo(left + u * z + 0.5, top); ctx.lineTo(left + u * z + 0.5, top + now.height * z) }
      for (let v = 1; v < now.height; v++) { ctx.moveTo(left, top + v * z + 0.5); ctx.lineTo(left + now.width * z, top + v * z + 0.5) }
      ctx.stroke()
    }
    ctx.strokeStyle = theme('--dim', '#8a8f98')
    ctx.setLineDash([3, 3])
    ctx.strokeRect(left - 0.5, top - 0.5, now.width * z + 1, now.height * z + 1)
    ctx.setLineDash([])
    if (hover) {
      ctx.strokeStyle = theme('--accent', '#4c8dff')
      ctx.strokeRect(left + hover[0] * z + 0.5, top + hover[1] * z + 0.5, z - 1, z - 1)
    }
  }

  // The pixel of the frame under the pointer, [u, v] as the frame is drawn upright, and whether the
  // frame has it.
  const pointed = (e: SurfacePointer): { at: [number, number]; on: boolean } | undefined => {
    const at = placed.current
    if (!at || !now) return undefined
    const u = Math.floor((e.x - at.left) / at.z), v = Math.floor((e.y - at.top) / at.z)
    return { at: [u, v], on: u >= 0 && v >= 0 && u < now.width && v < now.height }
  }
  const sample = ([u, v]: [number, number]) => {
    if (!page) return
    const [x, y] = onPage(f, u, v)
    setColour(ed, colourAt(page, paints.get(pageUrl)?.set, x, y))
  }
  const down = (e: SurfacePointer) => {
    if (e.button === 1 || e.button === 2) {
      panning.current = { x: e.x, y: e.y, from: pan }
      return
    }
    const hit = pointed(e)
    if (e.button !== 0 || !hit?.on || !page) return
    if (tool === 'pick' || e.alt) return sample(hit.at)
    const into = stroke(ed, entry.url)
    setPixel(into, page, pageUrl, f, hit.at, colour)
    painting.current = { paints: into, last: hit.at }
    setLive(n => n + 1)
  }
  const move = (e: SurfacePointer) => {
    const drag = panning.current
    if (drag && e.buttons & 6) {
      setPan([drag.from[0] + e.x - drag.x, drag.from[1] + e.y - drag.y])
      return
    }
    const hit = pointed(e)
    setHover(hit?.on ? hit.at : undefined)
    const p = painting.current
    if (!p || !hit || !page || !(e.buttons & 1)) return
    for (const pt of line(p.last, hit.at)) setPixel(p.paints, page, pageUrl, f, pt, colour)
    p.last = hit.at
    setLive(n => n + 1)
  }
  const up = () => {
    panning.current = undefined
    if (!painting.current) return
    painting.current = undefined
    stroked(ed, entry.url)
    setColour(ed, colour)
  }
  const key = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && k === 'z') {
      if (!strokes.length) return
      undoStroke(ed, entry.url)
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && k === 'b') setTool('pencil')
    else if (!e.metaKey && !e.ctrlKey && !e.altKey && k === 'i') setTool('pick')
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  const save = async () => {
    setBusy(true)
    onSaid(undefined)
    try {
      const done = await saveSprites(ed, ed, entry.url)
      onSaid(`Wrote ${done.files.join(', ')}.`)
    } catch (e) {
      ed.error(`loader: ${(e as Error).message}`)
      onSaid(`Refused: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const saveAs = async () => {
    setBusy(true)
    onSaid(undefined)
    try {
      const done = await saveSpritesAs(ed, ed, { scene, sheet: name, to: into, name: newName, add, replace })
      onSaid(`Wrote ${done.files.join(', ')}${add ? `, and added ${newName} to ${scene}'s catalogue` : ''}.`)
    } catch (e) {
      ed.error(`loader: ${(e as Error).message}`)
      onSaid(`Refused: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const under = hover && page && (() => {
    const [x, y] = onPage(f, hover[0], hover[1])
    return `${x}, ${y} ${hex8(colourAt(page, paints.get(pageUrl)?.set, x, y))}`
  })()
  const listed = ids.filter(n => !filter || n.toLowerCase().includes(filter.toLowerCase()))
  const recent = recentOf(ed)
  const setRgb = (v: string | number, fin: boolean) => setColour(ed, ((parseInt(String(v).slice(1), 16) << 8) | (colour & 255)) >>> 0, fin)
  const setAlpha = (v: number, fin: boolean) => setColour(ed, ((colour & 0xffffff00) | Math.max(0, Math.min(255, Math.round(v)))) >>> 0, fin)

  const controls = (
    <>
      <Button title="pencil (B)" pressed={tool === 'pencil'} onClick={() => setTool('pencil')}>✎</Button>
      <Button title="pick a colour (I)" pressed={tool === 'pick'} onClick={() => setTool('pick')}>⌖</Button>
      <Swatch color={cssOf(colour)} label={`colour ${hex8(colour)}`} />
      <ColorField label="colour" value={`#${(colour >>> 8).toString(16).padStart(6, '0')}`} onChange={setRgb} />
      <span>alpha</span>
      <NumberField label="alpha" integer value={colour & 255} onChange={setAlpha} />
      <Select<number> label="zoom" value={zoom} options={ZOOM_OPTIONS} onChange={z => { setZoom(z); setPan([0, 0]) }} />
      <Check label="grid" value={grid} onChange={setGrid} />
      <span>grid</span>
      <span className="ui-spacer" />
      {under && <Badge tone="dim">{under}</Badge>}
      <Badge tone={count ? 'accent' : 'dim'}>{`${count} unsaved`}</Badge>
      <Button title="undo stroke" disabled={!strokes.length || busy} onClick={() => undoStroke(ed, entry.url)}>↶</Button>
      <Button title="revert" disabled={!count || busy} onClick={() => revert(ed, entry.url)}>Revert</Button>
      <Button primary title="save" disabled={!count || busy} onClick={() => void save()}>Save</Button>
    </>
  )

  const side = (
    <>
      {pageError && <Note>The pages could not be read: {pageError}</Note>}
      {said && <Note>{said}</Note>}
      <Section title={<>Frame <Badge>{id}</Badge></>}>
        <LabelledRow label="kept"><span className="ui-mono">{`${f.trim[2]} × ${f.trim[3]} at ${f.box[0]}, ${f.box[1]} of page ${f.page}${f.rotated ? ', turned on its page' : ''}`}</span></LabelledRow>
        <Toolbar label="frames">
          <TextField label="filter frames" value={filter} onChange={setFilter} />
          <Badge>{`${listed.length} / ${ids.length}`}</Badge>
        </Toolbar>
        <Strip
          label="frames"
          wrap
          selected={id}
          onSelect={n => { show(ed, { frame: { url: entry.url, id: String(n) } }); setHover(undefined); setPan([0, 0]) }}
          items={listed.map(n => ({ id: n, title: n, node: <><PixelImage pixels={pictures.get(n)} label={n} /><span>{n}</span></> }))}
        />
      </Section>
      <Section title="Colours">
        {recent.length
          ? <Strip label="recent colours" wrap selected={colour} onSelect={c => setColour(ed, Number(c))} items={recent.map(c => ({ id: c, title: hex8(c), node: <Swatch color={cssOf(c)} label={hex8(c)} /> }))} />
          : <Note>Each colour painted or picked is kept here.</Note>}
      </Section>
      <Section title="Save as">
        <LabelledRow label="to" title={`a path of the repo ending ${ending}; every pack and page of the sheet is written beside it, named after it`}>
          <TextField label="sheet to write" value={into} onChange={setTo} />
        </LabelledRow>
        {!intoOk && <Note>A copy is a path of the repo ending {ending}, and not {name}'s own.</Note>}
        <LabelledRow label="add"><Check label={`add to ${scene}'s catalogue`} value={add} onChange={setAdd} /><span>{`to ${scene}'s catalogue`}</span></LabelledRow>
        {add && <LabelledRow label="name"><TextField label="entry name" value={newName} onChange={setEntryName} /></LabelledRow>}
        {taken && <Note>{scene}'s catalogue has an entry {newName} already.</Note>}
        <LabelledRow label="replace"><Check label="replace the files" value={replace} onChange={setReplace} /></LabelledRow>
        <Row>
          <Button primary title="save as" disabled={busy || !intoOk || taken || (add && !newName)} onClick={() => void saveAs()}>Save as</Button>
        </Row>
        <Note>{`The copy is ${name} with the pixels set, drawn and loaded as ${name} is. Saving it, and adding its entry, is one change the editor can undo.`}</Note>
      </Section>
    </>
  )

  return (
    <PanelBody bar={bar(controls)}>
      <Split
        main={<Surface label="sprite" version={[page, f, set, live, zoom, grid, hover?.[0], hover?.[1], pan[0], pan[1], ed.theme]} draw={draw} onDown={down} onMove={move} onUp={up} onLeave={() => setHover(undefined)} onKey={key} />}
        side={side}
      />
    </PanelBody>
  )
}
