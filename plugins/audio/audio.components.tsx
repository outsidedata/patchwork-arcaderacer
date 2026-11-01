// The components of audio's extension (audio.extension.tsx): the Sound panel and the fields of
// the sound types.
import { useState } from 'react'
import { useEditor } from '#editor/context.ts'
import { changes, type Editor, type FieldProps } from '#editor/editor.ts'
import type { At } from '#editor/files.ts'
import { Check, NumberField, Select, Slider, TextField, VecField } from '#editor/ui/fields.tsx'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import type { Cue, Loop, Space, Table } from './audio.plugin.ts'

const KIND = 'audio'
const MODELS: DistanceModelType[] = ['linear', 'inverse', 'exponential']
type Asset = { type: string; url: string }
// What a loop plays by: the listener's height, a field, or the sound a field names.
const HOWS = [
  { value: 'listener', label: 'follows the listener\'s height' },
  { value: 'field', label: 'follows a field' },
  { value: 'named', label: 'plays the sound a field names' },
]
// The fade a loop turned to play the sound a field names starts with, in seconds.
const FADE = 1

// `table` with one value set, taken out when undefined, or inserted into a list at `at`'s last
// index, -1 for its end.
function edited(table: Table, at: At, value: unknown, insert: boolean): Table {
  type Node = Record<string | number, unknown>
  const out = structuredClone(table)
  const parent = at.slice(0, -1).reduce<Node>((o, k) => o[k] as Node, out as unknown as Node)
  const k = at[at.length - 1]
  const list = Array.isArray(parent) ? (parent as unknown[]) : undefined
  if (insert) list!.splice(k === -1 ? list!.length : (k as number), 0, value)
  else if (value !== undefined) parent[k] = value
  else if (list) list.splice(k as number, 1)
  else delete parent[k]
  return out
}

// Why the browser half would throw at the table, or undefined: a PannerNode throws at a max distance
// not above 0, `space`'s or a cue's `range`, and at a negative `ref` or `rolloff`, and render2d's
// listener's gain, the same formula over `screen`'s, is NaN for them, which an AudioParam throws at;
// and a loop whose `over` is one value hands its gain NaN the moment what it follows stands at that
// value.
function refusal(p: Table): string | undefined {
  for (const block of ['space', 'screen'] as const) {
    const s = p[block]
    if (!s) continue
    if (!(s.max > 0)) return `audio ${block} max ${s.max} is not above 0`
    if (!(s.ref >= 0)) return `audio ${block} ref ${s.ref} is below 0`
    if (!(s.rolloff >= 0)) return `audio ${block} rolloff ${s.rolloff} is below 0`
  }
  for (const [n, c] of Object.entries(p.cues)) if (c.range !== undefined && !(c.range > 0)) return `audio cue ${n} range ${c.range} is not above 0`
  for (const [n, l] of Object.entries(p.loops ?? {})) if ('over' in l && l.over[0] === l.over[1]) return `audio loop ${n} is over ${l.over[0]} to ${l.over[1]}, one value`
  return undefined
}

// `loop` turned to play by `how`, keeping its sound, its ranges and its loop region; a field it
// follows or reads a sound's name from starts empty, reading nothing.
function turned(loop: Loop, how: string, sound: string): Loop {
  const empty = { kind: '', path: '' }
  if (how === 'named') return { named: empty, fade: FADE }
  const kept = 'named' in loop
    ? { sound, over: [0, 100] as [number, number], gain: [0, 1] as [number, number] }
    : { sound: loop.sound, over: loop.over, gain: loop.gain, ...(loop.loop && { loop: loop.loop }) }
  return how === 'field' ? { ...kept, field: empty } : { ...kept, listener: 'height' }
}

// Each event a kind plays a cue on, in the definitions of every scene whose cue table is the one in
// `file`: every `sounds` table of a kind's entry in the file its scene's `world.defs` names, at any
// depth, so each of a gun's weapons' is one too, its event named by the keys down to it. Scenes that
// name one definitions file, as a game's levels and screens do, are one file read once.
async function playedIn(ed: Editor, file: string): Promise<{ cue: string; kind: string; event: string }[]> {
  const s = ed.session!
  const out: { cue: string; kind: string; event: string }[] = []
  const read = new Set<string>()
  for (const [scene, t] of s.scenes()) {
    if (!t.rows.some(r => r.kind === KIND) || ed.worldFile(scene, KIND) !== file) continue
    const assets = (t.world.loader?.assets ?? {}) as Record<string, Asset>
    const url = typeof t.world.defs === 'string' ? assets[t.world.defs]?.url : undefined
    if (!url || read.has(url)) continue
    read.add(url)
    const walk = (kind: string, v: unknown, at: string[]) => {
      if (!v || typeof v !== 'object') return
      for (const [k, x] of Object.entries(v)) {
        if (k !== 'sounds' || !x || typeof x !== 'object' || Array.isArray(x)) walk(kind, x, [...at, k])
        else for (const [event, cue] of Object.entries(x)) if (typeof cue === 'string') out.push({ cue, kind, event: [...at, event].join('.') })
      }
    }
    for (const [kind, def] of Object.entries(JSON.parse(await ed.text(url.replace(/^\//, ''))) as Record<string, unknown>)) walk(kind, def, [])
  }
  return out
}

// The `sound` entries of a scene's catalogue.
function soundsIn(ed: Editor, scene: string | undefined): string[] {
  const assets = scene ? ed.session?.scenes().get(scene)?.world.loader?.assets : undefined
  return Object.entries((assets ?? {}) as Record<string, Asset>).filter(([, a]) => a.type === 'sound').map(([n]) => n)
}

// ---------------------------------------------------------------- the types

// A sound of the catalogue of the owner's scene, else of the one the loader's panels work on, as a
// definition, which is no scene's, is shown.
export function SoundName({ value, onChange, owner, label }: FieldProps<string>) {
  const ed = useEditor(['game', 'selection'])
  const names = soundsIn(ed, owner.scene ?? ed.focus('loader')?.scene)
  return <Select<string> label={label} value={value} options={[...new Set([value, ...names])].map(n => ({ value: n, label: names.includes(n) ? n : `${n} (not in the catalogue)` }))} onChange={onChange} />
}
export function Gain({ value, onChange, label }: FieldProps<number>) {
  return <Slider label={label} min={0} max={2} step={0.01} value={value} onChange={onChange} />
}
export function Model({ value, onChange, label }: FieldProps<string>) {
  return <Select<string> label={label} value={value} options={MODELS.map(m => ({ value: m }))} onChange={onChange} />
}

// ---------------------------------------------------------------- the panel

export function Sound() {
  const ed = useEditor(['game', 'selection'])
  const so = ed.focus(KIND)
  const [refused, setRefused] = useState<string | undefined>(undefined)
  const [cueName, setCueName] = useState('')
  const [loopName, setLoopName] = useState('')
  if (!ed.session) return <Empty>Open a game, and the sound of the scene selected is set here.</Empty>
  if (!so) return <Empty>No scene of {ed.session.game.name} has an audio row.</Empty>
  const { scene, worldFile: path, plugins: client } = so
  const table = so.world as unknown as Table
  const sounds = soundsIn(ed, scene)
  const owner = { kind: KIND, scene, data: table as unknown as Record<string, unknown> }
  const player = client?.audio
  const play = (what: string | Cue) => void player?.audition(client, what).catch((e: Error) => ed.error(`audio: ${e.message}`))

  const refuse = (why: string) => {
    setRefused(why)
    ed.error(`audio: refused: ${why}`)
  }
  // One value of the table, refused, written nowhere, where the browser half would throw at it.
  const write = (at: At, value: unknown, insert = false) => {
    const why = refusal(edited(table, at, value, insert))
    if (why) return refuse(why)
    setRefused(undefined)
    void ed.editFile(path, ['world', KIND, ...at], value, insert).catch(() => {})
  }
  // A cue taken out, refused while a kind of a scene reading this cue table plays it.
  const remove = async (cue: string) => {
    const by = (await playedIn(ed, path)).filter(p => p.cue === cue)
    if (by.length) return refuse(`audio cue ${cue} is played by ${by.map(p => `${p.kind} on ${p.event}`).join(', ')}`)
    write(['cues', cue], undefined)
  }
  const loops = table.loops ?? {}
  // A loop turned to play by another way, each value that changes written by itself, as one undo.
  const turn = (name: string, how: string) => {
    if (how !== 'named' && 'named' in loops[name] && !sounds.length) return refuse(`${scene}'s catalogue has no sound for loop ${name} to play`)
    const next = turned(loops[name], how, sounds[0])
    const why = refusal({ ...table, loops: { ...loops, [name]: next } })
    if (why) return refuse(why)
    setRefused(undefined)
    void ed.editFiles(changes(loops[name], next, ['world', KIND, 'loops', name]).map(c => ({ file: path, ...c }))).catch(() => {})
  }

  // What a cue's range stands in for: the max of the listener's numbers the table gives.
  const reach = table.space ? `${table.space.max} m` : table.screen ? `${table.screen.max} px` : undefined
  const max = table.space?.max ?? table.screen?.max

  return (
    <PanelBody bar={<Toolbar label="sound"><Badge tone="dim">{scene}</Badge><span className="ui-spacer" /><Badge>{sounds.length} sounds</Badge></Toolbar>}>
      {refused && <Note>Refused: {refused}</Note>}
      {!player && <Note>The game view shows another scene: sounds play once it shows {scene}.</Note>}
      <Section title="Sounds" extra={<Badge>{sounds.length}</Badge>} open={false}>
        {sounds.map(n => (
          <Row key={n}><Button title={`play ${n}`} disabled={!player} onClick={() => play(n)}>▶</Button><span>{n}</span></Row>
        ))}
      </Section>
      <Section title="Cues" extra={<Badge>{Object.keys(table.cues).length}</Badge>}>
        {Object.entries(table.cues).flatMap(([c, cue]) => ('gun' in cue ? [] : [[c, cue] as const])).map(([c, cue]) => (
          <CueForm key={c} name={c} cue={cue} owner={owner} sounds={sounds} max={max} reach={reach} write={write} refuse={refuse} remove={() => void remove(c).catch((e: Error) => ed.error(`audio: ${e.message}`))} play={player ? () => play(cue) : undefined} />
        ))}
        <LabelledRow label="new" extra={
          <Button
            title="add a cue"
            disabled={!cueName || cueName in table.cues}
            onClick={() => {
              if (!sounds.length) return refuse(`${scene}'s catalogue has no sound for a cue to play`)
              write(['cues', cueName], { sounds: [sounds[0]], gain: 1 })
              setCueName('')
            }}
          >Add</Button>
        }>
          <TextField label="new cue name" value={cueName} onChange={setCueName} />
        </LabelledRow>
      </Section>
      <Section title="Loops" extra={<Badge>{Object.keys(loops).length}</Badge>}>
        {Object.entries(loops).map(([n, l]) => <LoopForm key={n} name={n} loop={l} owner={owner} sounds={sounds} write={write} turn={how => turn(n, how)} />)}
        <LabelledRow label="new" extra={
          <Button
            title="add a loop"
            disabled={!loopName || loopName in loops}
            onClick={() => {
              if (!sounds.length) return refuse(`${scene}'s catalogue has no sound for a loop to play`)
              write(['loops', loopName], { sound: sounds[0], listener: 'height', over: [0, 100], gain: [0, 1] })
              setLoopName('')
            }}
          >Add</Button>
        }>
          <TextField label="new loop name" value={loopName} onChange={setLoopName} />
        </LabelledRow>
        <Note>A loop added follows the listener's height; turn it to follow a field or to play the sound a field names.</Note>
      </Section>
      {table.space && <Numbers title="Space" block="space" value={table.space} owner={owner} write={write} />}
      {table.screen && <Numbers title="Screen" block="screen" value={table.screen} owner={owner} write={write} />}
      {!table.space && !table.screen && <Note>No space and no screen: every sound plays unplaced until the scene gives the numbers of the listener its renderer is.</Note>}
    </PanelBody>
  )
}

type Owner = { kind: string; scene: string; data: Record<string, unknown> }
type Write = (at: At, value: unknown, insert?: boolean) => void

// The numbers a listener fades placed sounds by: `space` render3d's, in metres, `screen` render2d's,
// in canvas pixels from the view.
function Numbers({ title, block, value, owner, write }: { title: string; block: 'space' | 'screen'; value: Space; owner: Owner; write: Write }) {
  return (
    <Section title={title} open={false} extra={<Badge tone="dim">{block === 'space' ? 'render3d, metres' : 'render2d, pixels'}</Badge>}>
      <PropertyGrid value={value} at={[block]} owner={owner} onChange={(at, v, done) => { if (done) write(at, v) }} />
    </Section>
  )
}

function CueForm({ name, cue, owner, sounds, max, reach, write, refuse, remove, play }: {
  name: string; cue: Cue; owner: Owner; sounds: string[]; max: number | undefined; reach: string | undefined; write: Write; refuse(why: string): void; remove(): void; play: (() => void) | undefined
}) {
  const at = (...k: (string | number)[]) => ['cues', name, ...k]
  return (
    <Section title={name} open={false} extra={
      <>
        <Button title={`audition ${name}`} disabled={!play} onClick={() => play?.()}>▶</Button>
        <Button title={`remove cue ${name}`} onClick={remove}>✕</Button>
      </>
    }>
      {cue.sounds.map((s, i) => (
        <LabelledRow key={i} label={`sound ${i}`} extra={
          <Button title={`drop ${name} sound ${i}`} onClick={() => (cue.sounds.length === 1 ? refuse(`cue ${name} plays one sound or more`) : write(at('sounds', i), undefined))}>✕</Button>
        }>
          <SoundName label={`${name} sound ${i}`} value={s} at={at('sounds', i)} owner={owner} onChange={v => write(at('sounds', i), v)} />
        </LabelledRow>
      ))}
      <LabelledRow label="add">
        <Select<string> label={`add a sound to ${name}`} value="" options={[{ value: '', label: 'a sound…' }, ...sounds.map(n => ({ value: n }))]} onChange={v => v && write(at('sounds', -1), v, true)} />
      </LabelledRow>
      <LabelledRow label="gain"><Gain label={`${name} gain`} value={cue.gain} at={at('gain')} owner={owner} onChange={(v, done) => done && write(at('gain'), v)} /></LabelledRow>
      <LabelledRow label="rate" extra={<Check label={`${name} has a rate`} value={cue.rate !== undefined} onChange={on => write(at('rate'), on ? [1, 1] : undefined)} />}>
        {cue.rate ? <VecField label={`${name} rate`} names={['lo', 'hi']} value={cue.rate} onChange={(v, done) => done && write(at('rate'), v)} /> : <Note>1</Note>}
      </LabelledRow>
      <LabelledRow label="range" extra={max !== undefined || cue.range !== undefined ? <Check label={`${name} has a range`} value={cue.range !== undefined} onChange={on => write(at('range'), on ? max : undefined)} /> : undefined}>
        {cue.range !== undefined ? <NumberField label={`${name} range`} value={cue.range} onChange={(v, done) => done && write(at('range'), v)} /> : <Note>{reach ? `the listener's ${reach}` : "no listener's numbers"}</Note>}
      </LabelledRow>
      <LabelledRow label="cut"><Check label={`${name} cuts`} value={cue.cut === true} onChange={on => write(at('cut'), on ? true : undefined)} /></LabelledRow>
    </Section>
  )
}

function LoopForm({ name, loop, owner, sounds, write, turn }: { name: string; loop: Loop; owner: Owner; sounds: string[]; write: Write; turn(how: string): void }) {
  const at = (...k: (string | number)[]) => ['loops', name, ...k]
  const range = (k: 'over' | 'gain', v: [number, number]) => (
    <LabelledRow label={k}><VecField label={`${name} ${k}`} names={['lo', 'hi']} value={v} onChange={(x, done) => done && write(at(k), x)} /></LabelledRow>
  )
  const field = (k: 'field' | 'named', f: { kind: string; path: string }) => (
    <>
      <LabelledRow label="kind"><TextField label={`${name} ${k} kind`} value={f.kind} onChange={(v, done) => done && write(at(k, 'kind'), v)} /></LabelledRow>
      <LabelledRow label="path"><TextField label={`${name} ${k} path`} value={f.path} onChange={(v, done) => done && write(at(k, 'path'), v)} /></LabelledRow>
    </>
  )
  const region = (label: string, v: [number, number], to: At) => (
    <VecField label={label} names={['start', 'end']} value={v} onChange={(x, done) => done && write(to, x.map(n => Math.max(0, n)))} />
  )
  const how = 'named' in loop ? 'named' : 'field' in loop ? 'field' : 'listener'
  return (
    <Section title={name} open={false} extra={<><Badge tone="dim">{HOWS.find(h => h.value === how)!.label}</Badge><Button title={`remove loop ${name}`} onClick={() => write(['loops', name], undefined)}>✕</Button></>}>
      <LabelledRow label="plays"><Select<string> label={`${name} plays`} value={how} options={HOWS} onChange={turn} /></LabelledRow>
      {'named' in loop
        ? (
          <>
            {field('named', loop.named)}
            <LabelledRow label="fade"><NumberField label={`${name} fade`} value={loop.fade} onChange={(v, done) => done && write(at('fade'), Math.max(0, v))} /></LabelledRow>
            {Object.entries(loop.loop ?? {}).map(([song, r]) => (
              <LabelledRow key={song} label={song} extra={<Button title={`drop the ${song} region of ${name}`} onClick={() => write(at('loop', song), undefined)}>✕</Button>}>
                {region(`${name} ${song} loop`, r, at('loop', song))}
              </LabelledRow>
            ))}
            <LabelledRow label="loop">
              <Select<string>
                label={`add a loop region to ${name}`}
                value=""
                options={[{ value: '', label: 'a sound…' }, ...sounds.filter(n => !(n in (loop.loop ?? {}))).map(n => ({ value: n }))]}
                onChange={v => v && write(loop.loop ? at('loop', v) : at('loop'), loop.loop ? [0, 0] : { [v]: [0, 0] })}
              />
            </LabelledRow>
          </>
        )
        : (
          <>
            <LabelledRow label="sound"><SoundName label={`${name} sound`} value={loop.sound} at={at('sound')} owner={owner} onChange={v => write(at('sound'), v)} /></LabelledRow>
            {'field' in loop ? field('field', loop.field) : <Note>The listener's height, in metres.</Note>}
            {range('over', loop.over)}
            {range('gain', loop.gain)}
            <LabelledRow label="loop" extra={<Check label={`${name} has a loop region`} value={loop.loop !== undefined} onChange={on => write(at('loop'), on ? [0, 0] : undefined)} />}>
              {loop.loop ? region(`${name} loop`, loop.loop, at('loop')) : <Note>the whole sound</Note>}
            </LabelledRow>
          </>
        )}
    </Section>
  )
}
