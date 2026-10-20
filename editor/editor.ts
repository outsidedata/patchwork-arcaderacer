// The editor: what every extension is handed, and what everything the page shows is read from.
//
// An extension is `<name>.extension.tsx`, exporting a function named `<name>` that is called once
// with the editor when the extension turns on. It adds panels, commands, field types, bindings,
// inspector sections and themes, and whatever it added goes when it turns off; what it opens itself
// that outlives a call, a listener, a feed, a timer, it hands `onDrop`, which closes it then. The
// editor's own extensions are always on. A plugin's or an addon's is on while a scene file of the open
// game names that plugin or addon (`names`): in its `plugins`, as a key of its `world`, or as a
// top-level block of its own; one that exports `always` as true, for every game and none, is on
// whatever is open. So a game is shown the panels, tools and commands of what it uses and nothing
// else, and an edit that names a plugin more, or one less, turns its extension on or off (`fit`). A
// game's own are on while that game is open, and turned on after the plugins' and addons', so what
// they bind wins.
//
// An editor is on one game, its project (`game`), which the page's url names: it opens that game and
// no other, and another game is opened by going to its page (`openGame`). It holds the open game
// (`session`), what is selected, the undo history of every change made through it, and the console's
// lines. What is selected is in a scene the game has: a change
// that takes a scene out of the manager's table, as the undo of one added does, lets go of a
// selection in it.
//
// It writes a file only through `files`, as a change the server applies whole and keeps to be taken
// back (`editor/server/changes.ts`): JSON values, each written by itself so the file stays as it was
// written around it, or an extension's route, which writes what no JSON value can, a picture's bytes
// say (`Edits.route`). It changes a running game only through the session's recorder, so every
// change is undoable and every step it shows can be rebuilt. A change of the files is in the history
// from the moment it is sent, by the id the page names it with (`Change`), so Undo pressed as soon as
// a change is made takes back that change: the server applies the undo after it, and puts each file
// back byte for byte where it still holds what the change wrote, else value by value, and refuses the
// undo where a whole file the change wrote has changed since; redo writes it as the change first did
// (`editor/server/changes.ts`). Every answer of the server's, and every change another page made,
// which the server tells this one (`another`), is taken in in the order it arrives, which for this page's own is the order it sent them (`answered`): the files it
// wrote are handed to the listeners and the game is rebuilt from them, and the page reloads for a file
// it holds as it was, or one the game boots from taken away (`held`, `lost`), once the change is in the
// history, and again as it is taken back or made again. The recording's end set by hand is spliced
// back (`Recording`). One action is one undo however many edits it makes: an extension runs the action
// in `together` and makes its edits through the editor `together` hands it, so two actions waiting at
// once are two undos. An action is in the history from its first change, and an undo of one still in
// hand waits for it to end, then takes it all back (`undo`). The history is this tab's, since an
// action's undo takes back its row edits too, which are this tab's recorder's: two tabs on one game
// each undo their own changes. It is kept across a reload in the tab's `sessionStorage` (`save`,
// `restore`, `keep` in `page.ts`), each change of the files by its id and its files alone, which the
// server keeps it by.
//
// A file changed on the disk by no change, a person's text editor, an LLM writing files, a request of
// a page's that is no change, is taken in as a file a change wrote is, or reloads the page by the same
// rule, once every action and change in hand is done (`disk`): nothing changes under the page unseen.
// Going to another game's page is for good: nothing reloads the page after (`openGame`).
//
// A panel on the rows of one kind works on the scene `focus` says: the scene selected, else the one
// the game view shows, else the first with a row of that kind.
//
// What changed is told by topic (`Topic`): every change says what it changed (`changed`), and a
// listener hears the topics it names (`subscribe`), a component the topics it reads (`useEditor`,
// `context.ts`), so a file landing draws the components that read that file and no other, and a line
// in the console draws the console. An extension's own state is its own topic, `x.<name>`. What each
// docked panel's drawings cost, and how many changes of each topic there were, is counted (`drawn`,
// `perf`, the `view.perf` command); a drawing longer than a frame is said in the console.
//
// Commands are what the user runs from a menu or a key and what an LLM calls: every command is a
// tool of the MCP server the editor's server serves (`editor/mcp.ts`, `editor/server/mcp.ts`),
// named by its id with each `.` a `_`, so no two ids may name one tool. A plain command takes
// nothing, as a menu click or a key press hands it nothing. An asked command takes arguments, which
// its zod `input` says, and has no menu and no key, since only a call hands it any. `call` runs
// either from outside the page: it refuses a command that is not enabled and arguments its `input`
// does not parse, which are checked here because they come from outside the program, and runs it
// in `together`, handing an asked command the edits `together` hands, so every change it makes
// through them is one undo. What it answers is what `run` answered: nothing, a JSON value, or a
// `Blob` of an image. A menu item and a key run a plain command through `call` too, and write what it
// throws to the console, since no caller is there to be handed it (`shell/keys.ts`), so a command
// fails by throwing, whoever runs it. The shell's own commands, undo and redo, what is selected, the
// panels and the theme, are in `shell/commands.ts`.
//
// So that an LLM can do whatever a person does, a command is written so:
//   - A panel's button, a tool's pointer and the command that do one thing call one function, in
//     the extension's file or a module beside it, and none of them keeps a copy of its own.
//   - It takes world points, never canvas pixels: a tool turns its pointer into world points
//     (`Stage.ground`, `Stage.pick`) and calls the same function with them. A point that places a
//     row is as long as the point the row stands on, in its placer's `axes`; one that only marks may
//     be two numbers, a point on the ground as the stage's `mark` reads it: `[x, z]` in 3D, `[x, y]`
//     in 2D.
//   - Its `input` is a `z.object` at the top, with a union or a nullable inside a field and never a
//     `.transform`. A top that is not an object voids the whole list of tools the MCP SDK's client
//     reads, one bad command hiding every other, so `command` refuses one when it is registered, as
//     it refuses an input zod cannot write as a JSON schema.
//   - It works from the files and the rows, whatever the game view shows and whether it draws at
//     all. Only a preview, or a readout of what a client holds in the browser, needs the client:
//     that command first awaits `Session.frame()`, which mounts a client where no frame of the
//     clock's has run yet, and refuses while the view shows another scene, naming that one;
//     `Session.clientOn(scene)` does both and answers the client.
//   - A panel's list edited as a whole and the command that sets that list write it as `listEdits`
//     says, one change through `written`; an object too big to list field by field is listed as
//     `looseInput` and held to its `strictFields`; a value a PropertyGrid shows, and the command that
//     sets its fields, set them as `gridEdits` says, each field one the grid draws and of its shape
//     (`worldGridEdits` for a plugin's `world`); an object a command is handed whole and writes as the
//     values that change is held to its shape only where it changes (`changedIssue`), so a value the
//     file has already is not the call's to answer for.
//   - A tool and its command that save one thing wait on one chain of saves, and read what is left
//     to save from one place, so a stroke of the pointer and a stroke of a call never interleave: a
//     panel that edits its files in place (`live.ts`) and a command that writes them as it does
//     write on the editor's one chain (`liveWrite`).
//   - A long piece of work a command awaits lets the page go between its slices with `turn`, a
//     message the page sends itself, never a timer, which a hidden tab holds back.
//   - It calls its extension's route with `routeOf`, or `Edits.route` when what the route writes is
//     a change Undo takes back, and the editor's own server with `posted` or `fetched`; none fetches
//     by hand.
//   - A value it answers read from a file goes through `outlined`, so a long one is answered in
//     outline (`OUTLINE` says how, for its description); a row it is handed is `ROW`; a change the
//     file would not take throws a `Refusal` before anything is written.
// An id is one extension's: another registering it is refused, since the first would lose its
// command when the other turns off. `sceneOf` and `rowOf` find the scene and the row a command is
// handed, and `dataFile` the data file, and throw naming the choices, as every refusal of a command
// does; `need` is the open game, and refuses with none.
//
// The game view. It is in Play, where the game has the pointer and the keys, or in one of the tools
// extensions register (`tool`): `tooling` is the active tool's id, undefined in Play, and `activate`
// puts the view in a tool, or in Play with undefined. Each tool is a `tool.<id>` command in the Tools
// menu, with its key, and goes with the extension that made it. The active tool is handed the
// pointer in canvas pixels: a left press is its `down`, a move with it held `move`, the release
// `up`, and a move with nothing held `hover`, which is handed undefined when the pointer leaves the
// view. A right drag, a middle drag and the wheel are the stage's orbit's, whatever the tool.
//
// Leaving a tool, for another, for Play, or because its extension turns off, ends it in order:
//   1. a press it is in ends: it is handed `up` where the pointer last was (the game view, through
//      `ends`), so every `down` it had has its `up`, and the tool the view goes to is handed no `up`
//      and no `move` until a press of its own;
//   2. it is handed `hover(undefined)`, as when the pointer leaves the view;
//   3. its `off`, where it takes away whatever it drew, a ring in the stage's overlay say.
// Each is run whatever an earlier one threw, the view goes to the next tool all the same, and what
// was thrown is written to the console. A tool that leaves itself from inside its own `down` (by
// activating another) is handed its `up` then, before its `down` returns, since the press began as
// the `down` was handed. Activating the tool the view is already in does nothing.
//
// The stage. What the view asks of the surface the game draws on is a stage, which a renderer's
// extension makes (`stage`): a provider is handed each client's plugins and answers a stage, or
// undefined for a client it does not draw; the last provider that answers wins. `staged` is the
// stage of the client the game view draws with, made when the session mounts that client and
// closed when it lets it go (`Session.onClient`). A stage is `Stage` below. Its orbit holds the
// camera while a tool is active and nobody holds the orbit off (`holdOrbit`, for an extension that
// lets the game place its own camera while its tool stays on); a hold outlives a new client and goes
// with the extension that made it. The orbit's pose goes over to the stage of the next client, so a
// rebuild leaves the view where it was. How a row is moved is no stage's: a renderer's extension
// declares it for every scene that names the renderer (`placeBy`), so how a row of any scene moves
// is known whether the view draws it or not (`placerIn`).
import type { ComponentType } from 'react'
import { z } from 'zod'
import type { Channel } from './channel.ts'
import type { At, Changed, FilesApi, Op } from './files.ts'
import type { Game } from './games.ts'
import type { Applied, Notice } from './server/disk.ts'
import type { Entry, Path, Tail } from '#addons/recorder/recorder.addon.ts'
import type { Client, Plugins } from '#engine/browser.ts'
import type { Row, Truth, W } from '#engine/engine.ts'
import { Session, type Saved } from './session.ts'

export type Selection = { scene: string; id: number } | { scene: string } | { file: string } | undefined

// Whose value a field shows: a kind names the bindings that apply to it, `data` is the whole thing
// the value is a field of (a row's data, a prefab, an actor entry, a definition), and a row is the
// live row. A value of a data file that is no kind's has the file, by its path from the repo, and
// the file's bindings apply to it (`bindFile`), its path from the file's top.
export type Owner = { kind?: string; file?: string; scene?: string; row?: number; data?: Record<string, unknown> }
export type FieldProps<T = unknown> = {
  value: T
  onChange(value: T, done: boolean): void
  at: Path
  owner: Owner
  label?: string
}
export type Field = ComponentType<FieldProps>

// A panel, docked in its `area` beside the others there. `lead` is the tab its area shows when the
// dock places them: a panel that joins an area takes the focus from none but a lead's, and a panel
// shown by `reveal` takes it from any.
export type Panel = { id: string; title: string; component: ComponentType; area?: 'left' | 'right' | 'bottom' | 'center'; lead?: boolean }
// A command run from a menu, a key or a call, with nothing handed to it.
export type Plain = { id: string; title: string; menu?: string; key?: string; run(): unknown; enabled?(): boolean }
// A command only a call runs, handed the arguments its `input` parses and the edits of the call.
export type Asked<S extends z.ZodType = z.ZodType> = {
  id: string
  title: string
  input: S
  run(args: z.infer<S>, edits: Edits): unknown
  enabled?(): boolean
  menu?: never
  key?: never
}
export type Command = Plain | Asked
// The name of the tool a command is to an LLM.
export const toolName = (id: string) => id.replace(/\./g, '_')
export type Section = { id: string; title: string; when(selection: Selection): boolean; component: ComponentType<{ selection: Selection }> }
export type Log = { level: 'info' | 'error'; message: string; stack?: string; at: number }
// How dragging a row in the game view moves it, and `rows.place` stands it on a point: `at` is the
// world point the row stands on, or undefined for a row this placer cannot place, `axes` what each
// number of that point is, and `to` the fields that stand it on another point of those axes. A
// kind's placer (`place`) wins over the placer of the renderer its scene names (`placeBy`), and the
// editor finds the one of a row through `placerIn`, whether the game view draws its scene or not.
export type Placer = {
  at(data: Row['data']): number[] | undefined
  axes: string[]
  to(data: Row['data'], point: number[]): Record<string, unknown>
}

// A line of world points, `origin + t·dir`.
export type Ray = { origin: number[]; dir: number[] }
// Where an orbit looks from: `pivot` the world point it turns about, `yaw` and `pitch` in radians and
// `dist` in world units, the eye at
// `pivot + dist·(−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch)`.
export type Pose = { pivot: number[]; yaw: number; pitch: number; dist: number }
// A camera the editor drives over the game's. Canvas pixels are the canvas's own.
export type Orbit = {
  // Its view, undefined until it has one; `put` sets it.
  pose(): Pose | undefined
  put(pose: Pose): void
  // A right drag turns it and a middle drag pans it, by canvas pixels; the wheel zooms, by the
  // wheel's delta.
  turn(dx: number, dy: number): void
  pan(dx: number, dy: number): void
  zoom(dy: number): void
  // Looks at everything a row draws.
  frame(id: number): void
  // Whether it holds the game's camera. The editor says; the orbit takes the camera as soon as the
  // renderer has one and nobody else holds it, and gives it back where it took it.
  drive(on: boolean): void
}
// The surface the game view draws on, as the editor asks of it. Canvas points are in the canvas's
// own pixels.
export type Stage = {
  // The world points drawn at a canvas point.
  ray(x: number, y: number): Ray | undefined
  // The world point under a canvas point on the ground, and on the level through `through`.
  ground(x: number, y: number): number[] | undefined
  plane(x: number, y: number, through: number[]): number[] | undefined
  // The row drawn topmost at a canvas point and the world point it was hit at.
  pick(x: number, y: number): { id: number; point: number[] } | undefined
  // A row's box on the canvas, [x, y, width, height], or undefined when it draws nothing.
  bounds(id: number): [number, number, number, number] | undefined
  // Where an extension draws over the game: the renderer's own kind of scene, drawn after the game
  // and never picked.
  overlay: unknown
  // A line through world points in `color` (0xrrggbb), with a dot on each, drawn in the overlay
  // until the call it hands back takes it away, so an extension that names no renderer can show a
  // way through the world. A point of two numbers is on the ground: [x, z] in 3D, [x, y] in 2D.
  mark(points: number[][], color: number): () => void
  orbit?: Orbit
  close(): void
}
// Where the pointer is, as a tool is handed it: in canvas pixels, on the scene the view shows.
export type Pointer = { x: number; y: number; scene: string; stage: Stage; shift: boolean; alt: boolean; mod: boolean }
export type Tool = {
  id: string
  title: string
  key?: string
  cursor?: string
  down?(p: Pointer): void
  move?(p: Pointer): void
  up?(p: Pointer): void
  hover?(p: Pointer | undefined): void
  off?(): void
}
export type Provider = (plugins: Plugins) => Stage | undefined
// The scene a panel on a kind works on (`focus`): its truth and the kind's live row there, none for
// a plugin with no row, whose fixed numbers are its scene's `world.<kind>` alone, the file
// that holds the kind's prefab, the scene's own file or else the game's, that prefab, the file that
// holds `world.<kind>`, a plugin's fixed numbers, found the same way, and those numbers, and the
// plugins of the client the game view draws the scene with, while it draws that scene.
export type Focus = {
  scene: string; truth: Truth; row: Row | undefined; file: string; prefab: Record<string, unknown>
  worldFile: string; world: Record<string, unknown>; plugins: Plugins | undefined
}

// One value to write: set at `at`, removed when `value` is undefined, or with `insert` put into a
// list there; a key its object lacks goes in at place `index` among its keys.
export type FileEdit = { at: At; value: unknown; insert?: boolean; index?: number }
// A change of the files, as the history holds it: the server keeps it by the id the page named it
// with (`change`), and takes it back and makes it again by that id. `files` are the files it wrote, by
// their paths from the repo, as its ops name them and then as the server answered, and `ops` what it
// was sent as, which the page that sent it holds while it is open (`edit.history` tells them).
export type FilesChange = { change: string; files: string[]; ops?: Op[] }
// Everything one action changed, rows and files alike (`together`): one undo takes it all back.
export type Steps = { steps: Change[] }
// The recording's end set by hand at step `at`: `tail` is the recording after it that the change took
// out, which undo splices back in, taking out the one it put there, and so on.
export type Recording = { at: number; tail: Tail }
// One change made through the editor, which undo takes back and redo makes again.
export type Change = FilesChange | { row: Entry } | Steps | { recording: Recording }
type SavedChange = { change: string; files: string[] } | { row: number } | { steps: SavedChange[] } | { recording: Recording }

type Owned<T> = T & { owner: string }

// What changed, as the editor tells whoever listens (`changed`, `subscribe`) and as a component says
// what it reads (`useEditor`):
//   extensions  what extensions add: panels, commands, fields, bindings, sections, themes, tools,
//               placers, stages;
//   tools       the active tool, the orbit's holds, and the stage of the game view;
//   theme       the theme put on the page;
//   log         the console's lines;
//   selection   what is selected;
//   history     the undos and redos;
//   game        the open game: opening it, closing it, and everything the session tells (a step, play
//               and pause, the speed, an edit, a client mounted);
//   texts       a file, by its path: the text the editor holds of it (`texts`, `text`), and how many
//               times a change or the disk has written it (`writes`, `writesIn`), a picture's too;
//   x.<name>    the state of the extension `name`'s own, which its own panels read.
export type Topic = 'extensions' | 'tools' | 'theme' | 'log' | 'selection' | 'history' | 'game' | 'texts' | `x.${string}`
type Listener = { f(): void; topics: Set<Topic> | undefined; paths: Set<string> | undefined }
// What drawing has cost (`Editor.perf`).
export type Perf = { panels: { panel: string; draws: number; ms: number; most: number }[]; topics: Record<string, number> }
// A panel drawn in more than a frame's milliseconds is said in the console, at most once in this many
// milliseconds.
export const BUDGET = 16
const WARNED = 10_000

// The changes an extension makes through the editor, rows and files alike. The editor's own are
// each an undo of their own; those of the editor `together` hands an action are that action's.
export type Edits = {
  // A field of a live row, from this step on.
  editRow(scene: string, id: number, at: Path, value: unknown): void
  spawn(scene: string, kind: string, data?: Record<string, unknown>): void
  end(scene: string, id: number): void
  // One JSON value in a file: set, removed when `value` is undefined, or inserted into a list at
  // `at`'s last index, -1 for its end.
  editFile(file: string, at: At, value: unknown, insert?: boolean): Promise<void>
  // A whole JSON file made to hold `value`, as a tool that edits a copy of it saves: each value that
  // differs is written by itself, so the diff is those values, and one undo takes the save back.
  saveFile(file: string, value: unknown): Promise<void>
  // Many values written at once, in order, each as its own value (`FileEdit`): one change, which one
  // undo takes back, and the game is rebuilt once, from each file they were written into.
  editFiles(edits: (FileEdit & { file: string })[]): Promise<void>
  // A route an extension ships, `/api/x/<owner>/<route>`, posted `body` and run on the server as one
  // change of the files: every file it writes or takes away is part of it, and one undo takes it all
  // back. Answers what the route answered.
  route<T = unknown>(owner: string, route: string, body: unknown): Promise<T>
  // The recording ends at the step the game is at: every step after it is dropped, and one undo puts
  // them back.
  endHere(): Promise<void>
  together<T>(action: (ed: Edits) => T): T
}

// `url` on the editor's server fetched as `init` says, answered with its JSON; a status that is no
// success throws the error it answered, else its status text.
export async function fetched<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const got = await res.json().catch(() => ({ error: res.statusText }))
  if (!res.ok) throw new Error(got.error)
  return got as T
}
// `body` posted as JSON to `url` on the editor's server (`fetched`).
export const posted = <T>(url: string, body: unknown) =>
  fetched<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
// A call to route `route` an extension `owner` ships (`<owner>.route.ts`, mounted under /api/x/<owner>/)
// that is no change the history keeps: one that reads, or writes what no undo takes back. One whose
// writes Undo takes back is a change (`Edits.route`).
export const routeOf = <T>(owner: string, route: string, body: unknown) => posted<T>(`/api/x/${owner}/${route}`, body)

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const plain = (v: unknown) => v === null || typeof v !== 'object'
// Whether a file's text is a JSON object or list, as a data file is, whatever it is named.
const holdsJson = (text: string | null) => {
  if (text === null) return false
  try {
    return !plain(JSON.parse(text))
  } catch {
    return false
  }
}
// More items of a list of numbers or strings than this changed, and the list is written whole: each
// value is an op the server writes by itself, and the list is one value.
const MANY = 32
// A list of items longer than this on both sides of what changed, multiplied, is written whole,
// rather than lined up item by item.
const ALIGNED = 250_000

// The writes that turn `from` into `to`, in the order they are made, each at its path as the writes
// before it left the file:
//
// - an object is compared key by key: a key `to` lacks is removed, one it adds goes in where `to`
//   has it among its keys, and a key both have is compared inside;
// - a list of numbers or strings of the same length is compared item by item, unless more than
//   `MANY` changed; any other such list that differs is set whole;
// - a list with a list or an object in it is compared item by item when it is as long as the
//   other, and else lined up with it, items equal on both sides kept: an item taken out is removed,
//   one put in is inserted, and one in the place of another is compared inside;
// - anything else that differs is set whole.
// `from` with each edit made to a copy, as the server makes it to the file (`changes` the other way):
// a value set at `at`, taken out when undefined (out of a list at its index), or with `insert` put
// into a list at its index, one before 0 or past the end at its end.
export function edited<T>(from: T, edits: FileEdit[]): T {
  const out = structuredClone(from) as Record<string | number, unknown>
  for (const { at, value, insert } of edits) {
    const parent = at.slice(0, -1).reduce<Record<string | number, unknown>>((o, k) => (o[k] ??= {}) as Record<string | number, unknown>, out)
    const k = at[at.length - 1]
    if (insert && Array.isArray(parent) && typeof k === 'number') parent.splice(k < 0 || k > parent.length ? parent.length : k, 0, value)
    else if (value !== undefined) parent[k] = value
    else if (Array.isArray(parent) && typeof k === 'number') parent.splice(k, 1)
    else delete parent[k]
  }
  return out as T
}

// A change a file would not take, refused before anything is written: `why` is why, said of the file
// at `path`, which a panel shows by the field and a call is answered whole.
export class Refusal extends Error {
  constructor(path: string, readonly why: string) {
    super(`${path}: refused: ${why}`)
  }
}

export function changes(from: unknown, to: unknown, at: At = []): FileEdit[] {
  if (Array.isArray(from) && Array.isArray(to)) return listChanges(from, to, at)
  if (record(from) && record(to)) {
    const out: FileEdit[] = []
    const keys = Object.keys(from)
    for (const k of Object.keys(from)) if (!(k in to)) {
      out.push({ at: [...at, k], value: undefined, index: keys.indexOf(k) })
      keys.splice(keys.indexOf(k), 1)
    }
    Object.keys(to).forEach((k, i) => {
      if (k in from) out.push(...changes(from[k], to[k], [...at, k]))
      else {
        out.push({ at: [...at, k], value: to[k], index: Math.min(i, keys.length) })
        keys.splice(Math.min(i, keys.length), 0, k)
      }
    })
    return out
  }
  return JSON.stringify(from) === JSON.stringify(to) ? [] : [{ at, value: to }]
}

function listChanges(from: unknown[], to: unknown[], at: At): FileEdit[] {
  if (from.every(plain) && to.every(plain)) {
    if (from.length !== to.length) return [{ at, value: to }]
    const moved = to.flatMap((v, i) => (v === from[i] ? [] : [i]))
    return moved.length > MANY ? [{ at, value: to }] : moved.map(i => ({ at: [...at, i], value: to[i] }))
  }
  if (from.length === to.length) return to.flatMap((v, i) => changes(from[i], v, [...at, i]))
  const a = from.map(v => JSON.stringify(v)), b = to.map(v => JSON.stringify(v))
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let q = 0
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++
  const [n, m] = [a.length - p - q, b.length - p - q]
  if (n * m > ALIGNED) return [{ at, value: to }]
  // The longest run of items the two middles share, in order, found from the end back.
  const len = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    len[i][j] = a[p + i] === b[p + j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1])
  const out: FileEdit[] = []
  let here = p, i = 0, j = 0
  // What lies between two items kept: those of `from` that go, those of `to` that come, each of the
  // first in the place of one of the second while there are both.
  const run = (gone: number[], come: number[]) => {
    for (let k = 0; k < Math.max(gone.length, come.length); k++) {
      if (k < gone.length && k < come.length) out.push(...changes(from[gone[k]], to[come[k]], [...at, here++]))
      else if (k < gone.length) out.push({ at: [...at, here], value: undefined })
      else out.push({ at: [...at, here++], value: to[come[k]], insert: true })
    }
  }
  while (i < n || j < m) {
    const gone: number[] = [], come: number[] = []
    while ((i < n || j < m) && !(i < n && j < m && a[p + i] === b[p + j] && len[i][j] === len[i + 1][j + 1] + 1)) {
      if (j >= m || (i < n && len[i + 1][j] >= len[i][j + 1])) gone.push(p + i++)
      else come.push(p + j++)
    }
    run(gone, come)
    if (i < n && j < m) { here++; i++; j++ }
  }
  return out
}

// The edits that turn the list at `at` from `before` into `after`, as a list a panel edits as a whole
// writes it (`NodeList`): an item taken out, removed; one added at the end, inserted there; the same
// items in another order, each whose place changed set whole in its new place, so an item moved
// keeps its keys in its own order; and anything else, an item's value set, added or taken out say,
// each value that changed, went or came, the two lists lined up (`changes`).
export function listEdits<T>(at: At, before: T[], after: T[]): FileEdit[] {
  const json = (v: T) => JSON.stringify(v)
  const same = (a: T[], b: T[]) => a.length === b.length && a.every((v, i) => json(v) === json(b[i]))
  if (after.length === before.length - 1) {
    const i = before.findIndex((_, j) => same(after, before.filter((_, k) => k !== j)))
    if (i >= 0) return [{ at: [...at, i], value: undefined }]
  }
  if (after.length === before.length + 1 && same(after.slice(0, -1), before)) return [{ at: [...at, -1], value: after[after.length - 1], insert: true }]
  const sorted = (l: T[]) => l.map(json).sort().join('\n')
  if (after.length === before.length && sorted(before) === sorted(after)) return after.flatMap((v, i) => (json(v) === json(before[i]) ? [] : [{ at: [...at, i], value: v }]))
  return changes(before, after, at)
}

// Edits written through `e` as one change: a lone value by itself, as `editFile` writes it; more, or
// a key put in at its place among its object's keys, as `editFiles` writes them; none, nothing.
export function written(e: Pick<Edits, 'editFile' | 'editFiles'>, edits: (FileEdit & { file: string })[]): Promise<void> {
  const [one] = edits
  return edits.length === 1 && one.index === undefined ? e.editFile(one.file, one.at, one.value, !!one.insert) : e.editFiles(edits)
}

// An object a call hands an asked command whose every field, described, would not fit a tool (an
// emitter of particles, say): listed as an object of numbers, booleans, strings and lists of them,
// and parsed as the strict object `shape` picks for it (`strictFields`), each issue at its path.
export function looseInput(shape: (value: Record<string, unknown>) => z.ZodType) {
  return z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.array(z.number()), z.array(z.array(z.number()))])).superRefine((v, ctx) => {
    const got = shape(v).safeParse(v)
    if (!got.success) for (const i of got.error.issues) ctx.addIssue({ code: 'custom', message: i.message, path: i.path })
  })
}
// A cell of a grid of cells, [x, y], and a rectangle of cells, [x0, y0, x1, y1], between two corner
// cells, both in it, as every command on cells takes them (grid's, tilemap's).
export const CELL = z.array(z.number().int()).length(2)
export const RECT = z.array(z.number().int()).length(4)
// A row of a scene, as every command on one row takes it.
export const ROW = {
  scene: z.string().describe('a scene of the open game, as rows.scenes lists them'),
  id: z.number().int().describe('a row of it, by its id, as rows.list lists them'),
}

// A strict object of `shape`'s fields, `what` of `reader`'s, each optional but those `needed` names:
// a field of none of them is refused, naming them.
export function strictFields(reader: string, what: string, shape: Record<string, z.ZodType>, needed: string[] = []) {
  const keys = Object.keys(shape)
  return z.strictObject(Object.fromEntries(keys.map(k => [k, needed.includes(k) ? shape[k] : shape[k].optional()])), {
    error: i => (i.code === 'unrecognized_keys' ? `${what} has no ${i.keys.join(', ')}, which ${reader} does not read: its fields are ${keys.join(', ')}` : undefined),
  })
}

// The first issue `schema` finds in `after` where it differs from `before`, by its path joined by dots
// and its message: a value `before` had already is not the change's to answer for, and with no
// `before` every issue is. For a command that writes a whole object as the values that change
// (`changes`), which refuses only what it writes.
export function changedIssue(schema: z.ZodType, before: unknown, after: unknown): { at: string; message: string } | undefined {
  let got = schema.safeParse(after)
  if (got.success) return undefined
  const touched = before === undefined ? [''] : changes(before, after).map(c => c.at.join('.'))
  const hits = (p: string) => touched.some(t => t === '' || t === p || t.startsWith(`${p}.`) || p.startsWith(`${t}.`))
  // A key the shape has not got that the change did not touch is left out, and the value parsed
  // again, so a refusal names only the keys the change put in.
  const stale = got.error.issues.flatMap(i => (i.code === 'unrecognized_keys' ? i.keys.map(k => [...i.path, k]).filter(p => !hits(p.join('.'))) : []))
  if (stale.length) {
    const kept = structuredClone(after) as Record<PropertyKey, unknown>
    for (const p of stale) delete (p.slice(0, -1).reduce<Record<PropertyKey, unknown>>((o, k) => o[k] as Record<PropertyKey, unknown>, kept))[p[p.length - 1]]
    got = schema.safeParse(kept)
    if (got.success) return undefined
  }
  for (const i of got.error.issues) {
    const at = i.path.join('.')
    const keys = i.code === 'unrecognized_keys' ? i.keys.map(k => (at ? `${at}.${k}` : k)) : [at]
    if (keys.some(hits)) return { at, message: i.message }
  }
  return undefined
}

// A value longer than `long` characters of JSON is answered in outline, and a field of it longer
// than `short` by its length alone, so an answer stays small enough for an LLM to read: its length,
// and for an object its short fields and the length of each long one, or for a list how many items
// it has; a long string is cut at `long` characters. Every command that answers a value read from a file answers it through this.
export const LONG = 20_000
export const OUTLINE = `Past ${LONG} characters of JSON a value is outlined: its \`long\` length, short \`fields\` and \`longFields\` lengths, or \`items\` count; a string is cut.`
export function outlined(value: unknown, long = LONG, short = long / 10): unknown {
  const size = JSON.stringify(value)?.length ?? 0
  if (size <= long || value === null || (typeof value !== 'object' && typeof value !== 'string')) return value
  if (typeof value === 'string') return `${value.slice(0, long)}…`
  if (Array.isArray(value)) return { long: size, items: value.length }
  const fields: Record<string, unknown> = {}, longFields: Record<string, number> = {}
  for (const [k, v] of Object.entries(value)) {
    const n = JSON.stringify(v)?.length ?? 0
    if (n <= short) fields[k] = v
    else longFields[k] = n
  }
  return { long: size, fields, longFields }
}

// How a PropertyGrid (`ui/grid.tsx`) draws a value that no binding gives a type: a string `#rrggbb` as a
// colour; two to four numbers as one field of numbers; any other object or list folded open into its
// own fields; and anything else as one field.
export const isColor = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
export const isVec = (v: unknown) => Array.isArray(v) && v.length >= 2 && v.length <= 4 && v.every(n => typeof n === 'number')
export const folds = (v: unknown): v is Record<string, unknown> | unknown[] => v !== null && typeof v === 'object' && !isVec(v)

// The shape a PropertyGrid's field keeps a value to, as the field drawn for it writes: a number, a
// boolean, a colour, a string, as many numbers, and an object or a list of the same shape all through.
function shaped(v: unknown): z.ZodType {
  if (typeof v === 'number') return z.number()
  if (typeof v === 'boolean') return z.boolean()
  if (isColor(v)) return z.string().regex(/^#[0-9a-f]{6}$/i, 'a colour, #rrggbb')
  if (typeof v === 'string') return z.string()
  if (isVec(v)) return z.array(z.number()).length((v as number[]).length)
  if (Array.isArray(v)) return z.array(v.length ? shaped(v[0]) : z.json())
  if (v !== null && typeof v === 'object') return z.strictObject(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shaped(x)])))
  return z.json()
}

// Fields of `root`, a value a PropertyGrid shows for `owner`, set by their paths joined by dots
// (`axles.0.at`), each as the grid's field for it sets it: the path one of the fields the grid draws,
// and the value of the shape of the one there (`shaped`); else refused, naming the fields there are.
// `what` names `root` in a refusal; no value at all is refused too, naming the fields. Answers each
// value at its path in `root`.
export function gridEdits(ed: Editor, owner: Pick<Owner, 'kind' | 'file'>, root: Record<string, unknown>, values: Record<string, unknown>, what: string): { at: Path; value: unknown }[] {
  // The fields the grid draws under `v` at `at`, by their paths.
  const fields = (v: unknown, at: Path): string[] =>
    folds(v) && !ed.typeOf(owner.kind, at, owner.file)
      ? Object.keys(v).flatMap(k => fields((v as Record<string, unknown>)[k], [...at, Array.isArray(v) ? Number(k) : k]))
      : [at.join('.')]
  if (!Object.keys(values).length) throw new Error(`hand a value of ${what} to set, by its path: its fields are ${fields(root, []).join(', ')}`)
  return Object.entries(values).map(([path, value]) => {
    const at: Path = []
    let here: unknown = root
    for (const k of path.split('.')) {
      const key = Array.isArray(here) && /^\d+$/.test(k) ? Number(k) : k
      if (!folds(here) || ed.typeOf(owner.kind, at, owner.file) || !Object.hasOwn(here, key)) break
      here = (here as Record<string | number, unknown>)[key]
      at.push(key)
    }
    const drawn = fields(root, [])
    if (at.join('.') !== path || !drawn.includes(path)) {
      const under = drawn.filter(f => f.startsWith(`${path}.`))
      throw new Error(`${what} has no field ${path}: ${under.length ? `its fields under it are ${under.join(', ')}` : `its fields are ${drawn.join(', ')}`}`)
    }
    const got = shaped(here).safeParse(value)
    if (!got.success) throw new Error(`${what} ${path} is ${JSON.stringify(here)}, and ${JSON.stringify(value)} is not of its shape: ${z.prettifyError(got.error)}`)
    return { at, value: got.data }
  })
}

// Fields of `world`, a plugin's `world.<kind>` as `file` holds it, set as its PropertyGrid sets them
// (`gridEdits`), as edits of that file.
export const worldGridEdits = (ed: Editor, kind: string, file: string, world: Record<string, unknown>, values: Record<string, unknown>) =>
  gridEdits(ed, { kind }, world, values, `world.${kind}`).map(g => ({ file, at: ['world', kind, ...g.at], value: g.value }))

// A truth read as a rule reads it, for a panel that works out what a rule would: its rows found and
// its world read; anything that would change the truth throws, saying `who` only reads it, as does a
// row it has not got.
export function reading(truth: Pick<Truth, 'rows' | 'world'>, who: string): W {
  const no = () => { throw new Error(`${who} only reads the rows`) }
  const rows = truth.rows
  return {
    world: truth.world,
    all: kind => rows.filter(r => r.kind === kind),
    get: id => rows.find(r => r.id === id) ?? no(),
    find: (kind, pred = () => true) => rows.find(r => r.kind === kind && pred(r)) ?? no(),
    spawn: no, end: no, die: no, call: no,
  }
}

// Lets the page go for a turn, to draw and take input between slices of a long piece of work, by a
// message to itself: a task no browser holds back in a hidden tab, where the MCP page often is, while
// a timer there waits a second, and after five minutes hidden a minute.
export function turn(): Promise<void> {
  return new Promise(done => {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = () => {
      port1.close()
      done()
    }
    port2.postMessage(null)
  })
}

type Ext = (ed: Editor) => void
export type Loader = () => Promise<Record<string, unknown>>
// A file of code, by its name.
const CODE = /\.(tsx?|jsx?|mjs|css|html)$/
// An extension a page lists as it loads (`editor/server/listing.ts`), by its path from the repo: the
// editor's own, a plugin's or an addon's; and, by its path from its game's folder, a game's own, its
// folder's, its own extensions' or its own plugins'.
const LISTED = /^(extensions|plugins|addons)\/[^/]+\/[^/]+\.extension\.tsx$/
const GAME_LISTED = /^((extensions|plugins)\/[^/]+\/)?[^/]+\.extension\.tsx$/
// The name an extension is on under, its function's: its file's, `<name>.extension.tsx`.
const extensionName = (file: string) => file.slice(file.lastIndexOf('/') + 1).replace(/\.extension\.tsx$/, '')

export class Editor {
  readonly files: FilesApi
  // The game this editor is on, its one project, or none, when the page names none or one there is
  // not; the page's url names it, and another is opened by going to its url (`openGame`).
  readonly game: Game | undefined
  // The page's end of the editor pages' socket (`channel.ts`), on which an extension hears what the
  // server says as it happens: set by the page before any extension turns on, and by a test that
  // plays the server.
  server: Channel | undefined
  // The game's own extensions, by file, on while it is open.
  readonly perGame: Record<string, Loader>
  // Every plugin's and addon's extension, by file; each is on while the open game names its folder
  // (`fit`).
  readonly named: Record<string, Loader>
  // The text of every file the editor has read or written, by its path from the repo.
  readonly texts = new Map<string, string>()
  session: Session | undefined
  selection: Selection
  undos: Change[] = []
  redos: Change[] = []
  log: Log[] = []
  busy = false
  theme = 'dark'
  // The dock's: shows a panel, opening it when it is not.
  revealer: ((id: string) => void) | undefined

  readonly panels = new Map<string, Owned<Panel>>()
  readonly commands = new Map<string, Owned<Command>>()
  readonly fields = new Map<string, Owned<{ component: Field }>>()
  readonly bindings: Owned<{ kind: string | ((kind: string) => boolean); fields: Record<string, string> }>[] = []
  readonly fileBindings: Owned<{ file: string | ((path: string) => boolean); fields: Record<string, string> }>[] = []
  readonly sections: Owned<Section>[] = []
  readonly themes = new Map<string, Owned<{ href?: string }>>()
  readonly placers: Owned<{ kind: string | ((kind: string) => boolean); placer: Placer }>[] = []
  readonly drawnPlacers: Owned<{ renderer: string; placer: Placer }>[] = []
  readonly tools = new Map<string, Owned<Tool>>()
  readonly providers: Owned<{ provider: Provider }>[] = []
  readonly holds: Owned<{ who: string }>[] = []
  // The active tool's id, undefined in Play.
  tooling: string | undefined
  // The stage of the client the game view draws with.
  staged: Stage | undefined
  // The client `staged` was made for, and the last pose an orbit had, for the next stage.
  private stagedFor: Client | undefined
  private pose: Pose | undefined
  private fileListeners: Owned<{ f(path: string, text: string, was: string): void | Promise<void> }>[] = []
  private bytesListeners: Owned<{ f(path: string): void | Promise<void> }>[] = []
  private droppers: Owned<{ f(): void }>[] = []

  private owner = 'editor'
  private gameOwned = new Set<string>()
  // The plugins' and addons' extensions that are on, by name, and each module of theirs once imported,
  // or undefined for one that failed to, which was written to the console then.
  private namedOn = new Set<string>()
  private modules = new Map<string, Record<string, unknown> | undefined>()
  private listeners = new Set<Listener>()
  // How many changes of each topic there have been, and of each file's text.
  private versions = new Map<Topic, number>()
  private textVersions = new Map<string, number>()
  private enders = new Set<() => void>()
  private unsession: (() => void)[] = []

  constructor(files: FilesApi, game: Game | undefined, perGame: Record<string, Loader> = {}, named: Record<string, Loader> = {}) {
    this.files = files
    this.game = game
    this.perGame = perGame
    this.named = named
    this.themes.set('dark', { owner: 'editor' })
    this.themes.set('light', { owner: 'editor' })
  }

  // ---------------------------------------------------------------- what changed

  // `f` called for every change of one of `topics`, every topic when left out, and of `texts` only
  // for a change of one of `paths` when given. Returns the call that stops it.
  subscribe = (f: () => void, topics: readonly Topic[] = [], paths?: readonly string[]) => {
    const l: Listener = { f, topics: topics.length ? new Set(topics) : undefined, paths: paths && new Set(paths) }
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }
  // How many changes there have been of `topics`, and of `texts` of `paths` when given: a reader that
  // read it as it drew and reads more once subscribed missed a change between.
  seen(topics: readonly Topic[], paths?: readonly string[]): number {
    let n = 0
    for (const t of topics) n += t === 'texts' && paths ? paths.reduce((k, p) => k + (this.textVersions.get(p) ?? 0), 0) : (this.versions.get(t) ?? 0)
    return n
  }
  // Tells every listener on `topic`, and for `texts` on one of `paths`, that it changed.
  changed = (topic: Topic, paths?: Iterable<string>) => {
    const changedPaths = paths && [...paths]
    this.versions.set(topic, (this.versions.get(topic) ?? 0) + 1)
    if (topic === 'texts') for (const p of changedPaths ?? []) this.textVersions.set(p, (this.textVersions.get(p) ?? 0) + 1)
    this.perfTopics.set(topic, (this.perfTopics.get(topic) ?? 0) + 1)
    for (const l of [...this.listeners]) {
      if (l.topics && !l.topics.has(topic)) continue
      if (topic === 'texts' && l.paths && changedPaths && !changedPaths.some(p => l.paths!.has(p))) continue
      l.f()
    }
  }

  // ---------------------------------------------------------------- what drawing costs

  // A docked panel drawn, as React's Profiler tells it: counted, and one drawn in more than `BUDGET`
  // milliseconds said in the console, at most once every `WARNED` milliseconds a panel.
  drawn = (panel: string, ms: number) => {
    const p = this.perfPanels.get(panel) ?? { draws: 0, ms: 0, most: 0 }
    p.draws++
    p.ms += ms
    p.most = Math.max(p.most, ms)
    this.perfPanels.set(panel, p)
    if (ms <= BUDGET) return
    const now = Date.now()
    if (now - (this.warned.get(panel) ?? -Infinity) < WARNED) return
    this.warned.set(panel, now)
    this.info(`the ${panel} panel took ${Math.round(ms)} ms to draw, over the ${BUDGET} ms of a frame`)
  }
  // What drawing has cost since the page loaded or the last `reset`: each docked panel's drawings,
  // the milliseconds in all and the most one took, the panels by their milliseconds; and how many
  // changes of each topic there were.
  perf(reset = false): Perf {
    const out: Perf = {
      panels: [...this.perfPanels].sort((a, b) => b[1].ms - a[1].ms).map(([panel, p]) => ({ panel, draws: p.draws, ms: Math.round(p.ms), most: Math.round(p.most) })),
      topics: Object.fromEntries(this.perfTopics),
    }
    if (reset) {
      this.perfPanels.clear()
      this.perfTopics.clear()
    }
    return out
  }
  private perfPanels = new Map<string, { draws: number; ms: number; most: number }>()
  private perfTopics = new Map<Topic, number>()
  private warned = new Map<string, number>()

  // ---------------------------------------------------------------- what extensions add

  panel(p: Panel) { this.panels.set(p.id, { ...p, owner: this.owner }); this.changed('extensions') }
  // A command, refused when it cannot be the tool it is: its tool name another's, its id another
  // extension's, or its input no JSON schema of an object.
  command<S extends z.ZodType>(c: Plain | Asked<S>) {
    const clash = [...this.commands.keys()].find(id => id !== c.id && toolName(id) === toolName(c.id))
    if (clash) throw new Error(`commands ${clash} and ${c.id} would both be the tool ${toolName(c.id)}`)
    const had = this.commands.get(c.id)
    if (had && had.owner !== this.owner) throw new Error(`command ${c.id} is ${had.owner}'s, and ${this.owner} registers it again`)
    // Both what a call hands the input, which is what the tool lists, and what it parses to, whose
    // schema is none for a transform: an input may be an object on one side and not the other.
    if ('input' in c) for (const io of ['input', 'output'] as const) {
      let schema: { type?: unknown }
      try {
        schema = z.toJSONSchema(c.input, { io }) as { type?: unknown }
      } catch (e) {
        throw new Error(`command ${c.id}: its input has no JSON schema, so it lists as no tool: ${(e as Error).message}`)
      }
      if (schema.type !== 'object') throw new Error(`command ${c.id}: its input must be a z.object, which lists as a tool`)
    }
    this.commands.set(c.id, { ...(c as Command), owner: this.owner })
    this.changed('extensions')
  }

  // Runs the command `id` from outside the page, as one undo, and answers what it answered.
  async call(id: string, args: unknown = {}): Promise<unknown> {
    const c = this.commands.get(id)
    if (!c) throw new Error(`no command ${id}`)
    if (c.enabled && !c.enabled()) throw new Error(`not enabled: ${id}`)
    if (!('input' in c)) return await this.together(() => c.run())
    const got = c.input.safeParse(args)
    if (!got.success) throw new Error(`${id}: ${z.prettifyError(got.error)}`)
    return await this.together(e => c.run(got.data, e))
  }
  // How a value of `type` is shown and edited, in every panel.
  field<T>(type: string, component: ComponentType<FieldProps<T>>) { this.fields.set(type, { component: component as unknown as Field, owner: this.owner }); this.changed('extensions') }
  // The type of fields of `kind`, or of every kind the test says yes to: of its rows, its prefab,
  // its actor entries and its definition. A key is a field's path joined by dots, and `*` stands
  // for any one key: `frames.*` is every entry of `frames`.
  bind(kind: string | ((kind: string) => boolean), fields: Record<string, string>) { this.bindings.push({ kind, fields, owner: this.owner }); this.changed('extensions') }
  // The type of fields of a data file that is no kind's definition, by its path from the repo or a
  // test of the path, with keys as `bind` has them, from the file's top: a scene file's too, whose
  // `world` a scene shows is drawn as its `world.*` keys say.
  bindFile(file: string | ((path: string) => boolean), fields: Record<string, string>) { this.fileBindings.push({ file, fields, owner: this.owner }); this.changed('extensions') }
  inspector(s: Section) { this.sections.push({ ...s, owner: this.owner }); this.changed('extensions') }
  // How dragging a row of `kind`, or of every kind the test says yes to, moves it in the game view.
  place(kind: string | ((kind: string) => boolean), placer: Placer) { this.placers.push({ kind, placer, owner: this.owner }); this.changed('extensions') }
  // How a row drawn by the renderer plugin `renderer` is moved, in every scene that names it, when
  // its kind has no placer of its own: the renderer's extension says, so a scene's placer is known
  // whether or not the game view draws it.
  placeBy(renderer: string, placer: Placer) { this.drawnPlacers.push({ renderer, placer, owner: this.owner }); this.changed('extensions') }
  // How a row of `kind` in scene `scene` of the open game is moved: its kind's placer, else the one of
  // the renderer the scene names that was made last; undefined when there is neither.
  placerIn(scene: string, kind: string): Placer | undefined {
    const own = this.placerOf(kind)
    if (own) return own
    const plugins = this.sceneOf(scene).scene.plugins ?? []
    for (let i = this.drawnPlacers.length - 1; i >= 0; i--) if (plugins.includes(this.drawnPlacers[i].renderer)) return this.drawnPlacers[i].placer
    return undefined
  }
  placerOf(kind: string): Placer | undefined {
    for (let i = this.placers.length - 1; i >= 0; i--) {
      const p = this.placers[i]
      if (typeof p.kind === 'string' ? p.kind === kind : p.kind(kind)) return p.placer
    }
    return undefined
  }
  // A tool of the game view, and the `tool.<id>` command that puts the view in it.
  tool(t: Tool) {
    this.command({ id: `tool.${t.id}`, title: t.title, menu: 'Tools', key: t.key, run: () => this.activate(t.id) })
    this.tools.set(t.id, { ...t, owner: this.owner })
    this.changed('extensions')
  }
  // Puts the game view in a tool, or in Play with undefined, ending the tool it was in.
  activate(id: string | undefined) {
    if (id !== undefined && !this.tools.has(id)) throw new Error(`no tool ${id}`)
    if (id === this.tooling) return
    this.leave()
    this.tooling = id
    this.steer()
    this.changed('tools')
  }
  get active(): Tool | undefined { return this.tooling === undefined ? undefined : this.tools.get(this.tooling) }
  // The game view's: how a press the view is in is ended when its tool is left. Returns the call that
  // stops it.
  ends(f: () => void) {
    this.enders.add(f)
    return () => { this.enders.delete(f) }
  }
  // Ends the active tool: its press, its hover, then its `off`.
  // Each part is run whatever an earlier one threw, so the view always leaves the tool, and what was
  // thrown is written to the console.
  private leave() {
    const t = this.active
    if (!t) return
    const run = (f: () => void) => {
      try {
        f()
      } catch (e) {
        this.error(`tool ${t.id}: ${(e as Error).message}`, (e as Error).stack)
      }
    }
    for (const f of this.enders) run(f)
    run(() => t.hover?.(undefined))
    run(() => t.off?.())
  }
  // A renderer's stage, for every client whose plugins it answers one for.
  stage(provider: Provider) {
    this.providers.push({ provider, owner: this.owner })
    this.restage(this.stagedFor)
  }
  // Keeps the orbit off while a tool stays on, until `who` lets go, so the game places its camera.
  holdOrbit(who: string) {
    if (!this.holds.some(h => h.who === who)) this.holds.push({ who, owner: this.owner })
    this.steer()
    this.changed('tools')
  }
  releaseOrbit(who: string) {
    const i = this.holds.findIndex(h => h.who === who)
    if (i >= 0) this.holds.splice(i, 1)
    this.steer()
    this.changed('tools')
  }
  // Whether the orbit holds the camera: while a tool is active and nobody holds it off.
  get orbiting() { return this.tooling !== undefined && this.holds.length === 0 }
  private steer() { this.staged?.orbit?.drive(this.orbiting) }
  // The stage for `client`, made by the last provider that answers, with the pose the last orbit had;
  // the stage there was is closed first.
  private restage(client: Client | undefined) {
    const was = this.staged
    if (was) {
      this.pose = was.orbit?.pose() ?? this.pose
      this.staged = undefined
      was.close()
    }
    this.stagedFor = client
    if (client) {
      for (let i = this.providers.length - 1; i >= 0 && !this.staged; i--) {
        try {
          this.staged = this.providers[i].provider(client.plugins)
        } catch (e) {
          this.error(`the stage of ${this.providers[i].owner} failed: ${(e as Error).message}`, (e as Error).stack)
        }
      }
      if (this.pose) this.staged?.orbit?.put(this.pose)
      this.steer()
    }
    if (was || this.staged) this.changed('tools')
  }
  // A theme: a CSS file that sets the design system's variables under `[data-theme="<name>"]`.
  addTheme(name: string, href: string) { this.themes.set(name, { href, owner: this.owner }); this.changed('extensions') }
  // Called with a file's new text, and the text it had before, whenever the editor writes it, before
  // the game is rebuilt. Many values written at once are one call, `was` the text before the first.
  onFile(f: (path: string, text: string, was: string) => void | Promise<void>) { this.fileListeners.push({ f, owner: this.owner }) }
  // Called with the path of every file a change wrote or took away that is not text the editor reads,
  // a picture or code say (`takeIn`), each time it does, before the text files it wrote are handed to
  // `onFile`.
  onBytes(f: (path: string) => void | Promise<void>) { this.bytesListeners.push({ f, owner: this.owner }) }
  // Called once as the extension that hands it is turned off (`drop`), before what it added goes: what
  // it opened that outlives a call, a listener of the editor's or the recorder's, a feed of the
  // server's, a timer, a mark on the stage, is closed here.
  onDrop(f: () => void) { this.droppers.push({ f, owner: this.owner }) }

  // The type a binding gives the field at `at` of something of `kind`, or, for a value of no kind,
  // of the data file `file`. The last binding made wins.
  typeOf(kind: string | undefined, at: Path, file?: string): string | undefined {
    const key = at.map(String)
    const match = (fields: Record<string, string>) => {
      for (const [pattern, type] of Object.entries(fields)) {
        const parts = pattern.split('.')
        if (parts.length === key.length && parts.every((p, j) => p === '*' || p === key[j])) return type
      }
      return undefined
    }
    if (kind) {
      for (let i = this.bindings.length - 1; i >= 0; i--) {
        const b = this.bindings[i]
        if (typeof b.kind === 'string' ? b.kind !== kind : !b.kind(kind)) continue
        const type = match(b.fields)
        if (type) return type
      }
      return undefined
    }
    if (file === undefined) return undefined
    for (let i = this.fileBindings.length - 1; i >= 0; i--) {
      const b = this.fileBindings[i]
      if (typeof b.file === 'string' ? b.file !== file : !b.file(file)) continue
      const type = match(b.fields)
      if (type) return type
    }
    return undefined
  }

  // Turns an extension on: calls it, and keeps what it adds under its name.
  use(name: string, ext: Ext) {
    const was = this.owner
    this.owner = name
    try {
      ext(this)
    } catch (e) {
      this.error(`extension ${name} failed to start: ${(e as Error).message}`, (e as Error).stack)
    } finally {
      this.owner = was
    }
  }
  // Turns an extension off: what it handed `onDrop` is called, the last first, and everything it added
  // goes.
  drop(name: string) {
    if (this.tooling !== undefined && this.tools.get(this.tooling)?.owner === name) this.leave()
    for (let i = this.droppers.length - 1; i >= 0; i--) {
      const d = this.droppers[i]
      if (d.owner !== name) continue
      this.droppers.splice(i, 1)
      try {
        d.f()
      } catch (e) {
        this.error(`extension ${name} failed to stop: ${(e as Error).message}`, (e as Error).stack)
      }
    }
    for (const map of [this.panels, this.commands, this.fields, this.themes, this.tools] as Map<string, { owner: string }>[])
      for (const [k, v] of map) if (v.owner === name) map.delete(k)
    const staging = this.providers.some(p => p.owner === name)
    for (const list of [this.bindings, this.fileBindings, this.sections, this.fileListeners, this.bytesListeners, this.placers, this.drawnPlacers, this.providers, this.holds] as { owner: string }[][])
      for (let i = list.length - 1; i >= 0; i--) if (list[i].owner === name) list.splice(i, 1)
    if (this.tooling !== undefined && !this.tools.has(this.tooling)) this.tooling = undefined
    if (staging) this.restage(this.stagedFor)
    this.steer()
    this.changed('extensions')
    this.changed('tools')
  }
  // Loads and turns on every extension the loaders name, each by the name of its file.
  async load(loaders: Record<string, Loader>): Promise<string[]> {
    const names: string[] = []
    for (const [file, load] of Object.entries(loaders)) {
      const name = extensionName(file)
      try {
        const mod = await load()
        if (typeof mod[name] !== 'function') throw new Error(`${file} exports no function ${name}`)
        this.use(name, mod[name] as Ext)
        names.push(name)
      } catch (e) {
        this.error(`extension ${file} failed to load: ${(e as Error).message}`, (e as Error).stack)
      }
    }
    return names
  }

  // What the open game's scene files name, each of which a plugin or an addon may be: every plugin a
  // scene's `plugins` lists, every key of its `world`, and every top-level block of its own. None with
  // no game open.
  names(): Set<string> {
    const out = new Set<string>()
    for (const scene of this.session?.files.values() ?? []) {
      for (const p of scene.plugins ?? []) out.add(p)
      for (const k of Object.keys(scene.world ?? {})) out.add(k)
      for (const k of Object.keys(scene)) out.add(k)
    }
    return out
  }

  // Turns on each plugin's and addon's extension the open game names (`names`), or that exports
  // `always` as true, and off each that is on and is neither. When that changes which are on while a
  // game is open, the game's own are turned off first and on again after, so they stay the last
  // turned on. A module that fails to import, or exports no function of its name, is written to the
  // console once and left off.
  async fit() {
    for (const [file, load] of Object.entries(this.named)) {
      if (this.modules.has(file)) continue
      try {
        const mod = await load()
        if (typeof mod[extensionName(file)] !== 'function') throw new Error(`${file} exports no function ${extensionName(file)}`)
        this.modules.set(file, mod)
      } catch (e) {
        this.modules.set(file, undefined)
        this.error(`extension ${file} failed to load: ${(e as Error).message}`, (e as Error).stack)
      }
    }
    if (this.switch()) await this.loadGame()
  }

  // `fit` on the modules imported already: turns the plugins' and addons' extensions on and off, and
  // answers whether it turned the open game's own off first, to turn on again; not when it changed
  // nothing or the game had none on.
  private switch(): boolean {
    const names = this.names()
    const want = new Map<string, Ext>()
    for (const [file, mod] of this.modules) {
      const name = extensionName(file)
      if (mod && (mod.always === true || names.has(file.split('/')[2]))) want.set(name, mod[name] as Ext)
    }
    if (want.size === this.namedOn.size && [...want.keys()].every(n => this.namedOn.has(n))) return false
    const game = this.gameOwned.size > 0 && this.session !== undefined
    this.dropGame()
    for (const name of [...this.namedOn]) {
      if (want.has(name)) continue
      this.drop(name)
      this.namedOn.delete(name)
    }
    for (const [name, ext] of want) {
      if (this.namedOn.has(name)) continue
      this.use(name, ext)
      this.namedOn.add(name)
    }
    return game
  }

  // Turns on the open game's own extensions.
  private async loadGame() {
    for (const n of await this.load(this.perGame)) this.gameOwned.add(n)
  }
  private dropGame() {
    for (const owner of this.gameOwned) this.drop(owner)
    this.gameOwned.clear()
  }

  reveal(id: string) { this.revealer?.(id) }
  // The dock's: how a panel is shown. Returns the call that stops it.
  reveals(f: (id: string) => void) {
    this.revealer = f
    return () => { if (this.revealer === f) this.revealer = undefined }
  }

  // Puts a theme on the page: its CSS file when an extension shipped one, and its name on the
  // root element, which the file's variables are set under.
  setTheme(name: string) {
    const t = this.themes.get(name)
    if (!t) throw new Error(`no theme ${name}: the themes are ${[...this.themes.keys()].join(', ')}`)
    if (t.href && !document.querySelector(`link[data-theme='${name}']`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = t.href
      link.dataset.theme = name
      document.head.appendChild(link)
    }
    document.documentElement.dataset.theme = name
    this.theme = name
    this.changed('theme')
  }

  // ---------------------------------------------------------------- the console

  // How many lines clearing the console has taken away: a line's index, which a reader of the console
  // goes on from (`console.read`), is its place in `log` plus this, so it holds across a clear.
  cleared = 0
  clearLog() {
    this.cleared += this.log.length
    this.log = []
    this.changed('log')
  }
  // An error written to the console as `message`, and kept as written, so whoever it reaches after
  // writes it no more (`said`): a write the editor made that failed is written with its files, and
  // the menu item or key whose command it failed does not write it again.
  private told(e: Error, message: string): Error {
    this.error(message, e.stack)
    this.toldErrors.add(e)
    return e
  }
  private toldErrors = new WeakSet<object>()
  // Whether the console has `e` written already.
  said(e: unknown): boolean { return typeof e === 'object' && e !== null && this.toldErrors.has(e) }
  info(message: string) { this.log.push({ level: 'info', message, at: Date.now() }); this.changed('log') }
  error(message: string, stack?: string) { this.log.push({ level: 'error', message, stack, at: Date.now() }); this.changed('log') }

  // ---------------------------------------------------------------- the game

  // Opens the game, from a saved session when there is one, and turns its own extensions on.
  // Opening is an action in hand, so a change on the disk is taken in once the game is open, not while
  // it boots from the files.
  async open(saved?: Saved) {
    const game = this.game
    if (!game) throw new Error('this editor has no game: open one with File › Open Game…')
    if (!game.managed) throw new Error(`${game.name} is not on the scenemanager pattern`)
    this.close()
    this.busy = true
    this.changed('game')
    await this.holding(async () => {
      try {
        // The manager scene as its file is now, whatever it held when the page read it: a change on
        // the disk before the game opens, as the page boots or after an open that failed, is what the
        // game opens from. A session refills it from then on (`Session.authored`).
        const text = await this.files.read(game.path)
        const file = game.file as Record<string, unknown>
        for (const key of Object.keys(file)) delete file[key]
        Object.assign(file, JSON.parse(text))
        this.texts.set(game.path, text)
        this.changed('texts', [game.path])
        const session = await Session.open(game, saved)
        this.session = session
        this.unsession = [session.subscribe(() => this.changed('game')), session.onError((m, s) => this.error(m, s)), session.onClient(c => this.restage(c))]
        await this.fit()
        await this.loadGame()
        this.info(`opened ${game.name}`)
      } finally {
        this.busy = false
        this.changed('game')
      }
    })
  }

  // Opens game `name`, as File › Open Game does: this editor's own here, when it is not open already
  // (`here`); another by leaving this one for it (`going`), the page going to the editor on it once
  // every action in hand is done, the one that called this too, and a call in hand has had its answer.
  async openGame(name: string): Promise<'here' | 'going'> {
    if (this.leaving !== undefined) {
      if (name === this.leaving) return 'going'
      throw new Error(`the page is going to ${this.leaving} already`)
    }
    if (name === this.game?.name) {
      if (!this.session) await this.open()
      return 'here'
    }
    const games = await this.files.games()
    const game = games.find(g => g.name === name)
    if (!game) throw new Error(`no game ${name}: the games are ${games.filter(g => g.opens).map(g => g.name).join(', ')}`)
    if (!game.opens) throw new Error(`${name} is not on the scenemanager pattern`)
    // Leaving for good: nothing reloads this page after, which would call it back from the other.
    this.leaving = name
    void this.quiet().then(() => this.files.open(name))
    return 'going'
  }

  // ---------------------------------------------------------------- the disk

  // Whether a reload of the page is under way, which nothing then gets in front of.
  private reloading = false
  // The game the page is leaving for (`openGame`), for good: nothing reloads it after, and nothing is
  // taken in.
  private leaving: string | undefined
  // The notices of the disk, taken one after the other.
  private noticed: Promise<void> = Promise.resolve()

  // The page reloaded for `paths`, once every action in hand is done, the one that called this too,
  // its change in the history the reload puts back, and a call in hand has had its answer: the page
  // saves its session as it goes (`main.tsx`). Done once the reload is asked for.
  reloadPage(paths: string[]): Promise<void> {
    if (this.reloading || this.leaving !== undefined) return Promise.resolve()
    this.reloading = true
    return this.quiet().then(() => {
      // Nothing is taken in while the page waits to reload; one that has not gone after, as no page
      // in a test does, goes on. A page that is leaving for another game meanwhile goes there instead.
      try {
        if (this.leaving === undefined) this.files.reload(paths)
      } finally {
        this.reloading = false
      }
    })
  }
  // Done once no action is in hand, and none has begun in the turn the page lets go for a call in hand
  // to have its answer: a call already sent, run in that turn, is waited for too.
  private async quiet() {
    do {
      await this.idle()
      await turn()
    } while (this.acting)
  }

  // A file on the disk changed by no change after the page began to load (`editor/server/disk.ts`), by
  // anyone, a request of this page's that is no change too (`routeOf`), taken in. The page reloads for
  // it by the rule it reloads by for a change (`held`, `lost`). Other code is none the page holds, and
  // is handed to the bytes listeners, so the Code panel shows a file it has open as it now is. Any
  // other file of the game's, a data file, a picture, a scene file, and any file the editor holds the
  // text of, is read anew and taken in as the files a change writes are, unless it holds what the
  // editor has already (`takeIn`). The rest is no file of this page's.
  disk(n: Notice) {
    this.noticed = this.noticed.then(async () => {
      await this.idle()
      if (this.reloading || this.leaving !== undefined) return
      const reload = [...this.held([n]), ...this.lost([n])]
      if (reload.length) return this.reloadPage(reload)
      if (CODE.test(n.path)) {
        // Code the page does not hold: a panel that shows it, the Code panel, reads it anew.
        await Promise.all(this.bytesListeners.map(l => l.f(n.path)))
        return
      }
      if (!this.texts.has(n.path) && !(this.game && n.path.startsWith(`games/${this.game.name}/`))) return
      if (!n.gone && this.texts.has(n.path) && (await this.files.read(n.path)) === this.texts.get(n.path)) return
      // Read only when it is text the editor reads; any other is bytes, which are not read here.
      const read = this.texts.has(n.path) || /\.json$/i.test(n.path)
      await this.takeIn({ [n.path]: read ? await this.files.read(n.path).catch(() => null) : null })
      this.info(`${n.path} ${n.gone ? 'was taken away' : n.added ? 'was made' : 'changed'} on the disk`)
    }).catch(e => {
      // A file the editor could not take in has said so already, naming it.
      if (!this.said(e)) this.error(`${n.path} changed on the disk and could not be taken in: ${(e as Error).message}`, (e as Error).stack)
    })
    return this.noticed
  }

  // What the page reloads for, of the files a change wrote, this page's or another's, or that changed
  // on the disk, each by its path and whether it is gone. A page holds every module it has imported as
  // it was until it reloads, so it reloads for the files it holds as they were (`held`):
  //   - a file it fetched as a module (`FilesApi.ran`), but a scene file or an actors file of the
  //     game's, which the session refills in place;
  //   - an extension it lists as it loads (`LISTED`) that is there and that it never fetched, one made
  //     since it loaded, which it loads only once it reloads;
  // and for a scene file or an actors file the game boots from taken away (`lost`), so the page says
  // why the game does not open, as a page loaded now would. Any other code it never fetched it fetches
  // as it now is when it first imports it, as the sim of a scene made new is, so it reloads for none.
  // For a change, what it holds is decided before the files are taken in, as taking them in can import
  // what they name, and what the game boots from after, as a change that takes a scene's file away
  // takes the scene out of the manager's table too.
  private held(files: { path: string; gone: boolean }[]): string[] {
    const s = this.session
    const own = this.game && `games/${this.game.name}/`
    const listed = (path: string) => LISTED.test(path) || (!!own && path.startsWith(own) && GAME_LISTED.test(path.slice(own.length)))
    return files.filter(({ path, gone }) => !(s && (s.files.has(path) || s.lists.has(path))) && (this.files.ran(path) || (!gone && listed(path)))).map(f => f.path)
  }
  private lost(files: { path: string; gone: boolean }[]): string[] {
    const s = this.session
    return files.filter(({ path, gone }) => gone && !!s && (s.files.has(path) || s.lists.has(path))).map(f => f.path)
  }

  // How many actions are in hand (`together`), and who waits for none to be.
  private acting = 0
  private waiters: (() => void)[] = []
  // Done once no action is in hand.
  idle(): Promise<void> {
    return this.acting ? new Promise(done => this.waiters.push(done)) : Promise.resolve()
  }
  // Runs `f`, an action in hand until it settles, which a reload and a change on the disk wait for:
  // the game opening is one, a change of the files until its answer is taken in (`answered`), an undo
  // and a redo, another page's change until it is taken in (`another`), and the MCP server's call
  // until its answer has been sent (`mcp.ts`).
  async holding<T>(f: () => Promise<T>): Promise<T> {
    this.acting++
    try {
      return await f()
    } finally {
      if (!--this.acting) for (const done of this.waiters.splice(0)) done()
    }
  }

  close() {
    const s = this.session
    if (!s) return
    this.restage(undefined)
    this.pose = undefined
    for (const f of this.unsession.splice(0)) f()
    s.close()
    this.session = undefined
    this.selection = undefined
    this.undos = []
    this.redos = []
    this.changed('game')
    this.changed('selection')
    this.changed('history')
    this.dropGame()
    this.switch()
    this.info(`closed ${s.game.name}`)
  }

  // A file's text, read once and kept up to date with every write the editor makes.
  async text(path: string): Promise<string> {
    const had = this.texts.get(path)
    if (had !== undefined) return had
    const text = await this.files.read(path)
    this.texts.set(path, text)
    this.changed('texts', [path])
    return text
  }

  // The scene a panel on `kind` works on: the scene selected, else the one the game view shows, else
  // the first with a row of that kind or a `world.<kind>`. Undefined with no game open or no such
  // scene.
  focus(kind: string): Focus | undefined {
    const s = this.session
    if (!s) return undefined
    const having = [...s.scenes()].filter(([, t]) => t.rows.some(r => r.kind === kind) || kind in t.world).map(([n]) => n)
    const sel = this.selection && 'scene' in this.selection ? this.selection.scene : undefined
    const scene = [sel, s.viewing].find(n => n !== undefined && having.includes(n)) ?? having[0]
    if (scene === undefined) return undefined
    const truth = s.scene(scene)
    const file = this.prefabFile(scene, kind)
    const worldFile = this.worldFile(scene, kind)
    return {
      scene, truth, file, worldFile,
      row: truth.rows.find(r => r.kind === kind),
      prefab: (s.files.get(file)?.prefabs?.[kind] ?? {}) as Record<string, unknown>,
      world: (s.files.get(worldFile)?.world?.[kind] ?? {}) as Record<string, unknown>,
      plugins: s.viewing === scene ? s.client?.plugins : undefined,
    }
  }

  // The file that holds the prefab of `kind` a scene boots from: the scene's own file when it gives
  // one, else the game's.
  prefabFile(scene: string, kind: string): string {
    const s = this.need()
    const own = s.path(scene)
    return kind in (s.files.get(own)?.prefabs ?? {}) ? own : s.game.path
  }

  // The file that holds `world.<key>` a scene boots from: the scene's own file when its `world` gives
  // the key, else the game's, as the scenemanager composes a child's `world`.
  worldFile(scene: string, key: string): string {
    const s = this.need()
    const own = s.path(scene)
    return key in (s.files.get(own)?.world ?? {}) ? own : s.game.path
  }

  // `world.<key>` as the file scene `scene` boots it from holds it (`worldFile`), and that file; a
  // scene whose `world` has none is refused, naming those whose `world` has one.
  worldOf(scene: string, key: string): { file: string; value: Record<string, unknown> } {
    const s = this.need()
    this.sceneOf(scene)
    const file = this.worldFile(scene, key)
    const value = s.files.get(file)?.world?.[key] as Record<string, unknown> | undefined
    if (value) return { file, value }
    const having = [...s.scenes()].filter(([, t]) => key in t.world).map(([n]) => n)
    throw new Error(`scene ${scene} has no world.${key}: ${having.length ? `${having.join(', ')} do` : 'no scene does'}`)
  }

  // The open game's data files, by their paths from the repo: every JSON file in its folder, as the
  // Files panel lists them.
  async dataFiles(): Promise<string[]> {
    const s = this.need()
    return (await this.files.list(`games/${s.game.name}`)).filter(p => p.endsWith('.json'))
  }
  // `path`, when it is one of the open game's data files; one that is not is refused, naming them.
  async dataFile(path: string): Promise<string> {
    const files = await this.dataFiles()
    if (!files.includes(path)) throw new Error(`no data file ${path} of ${this.need().game.name}: its data files are ${files.join(', ')}`)
    return path
  }

  // The names of the open game's scenes, or of those with a row of `kind`; none with no game open.
  scenesWith(kind?: string): string[] {
    const s = this.session
    return s ? [...s.scenes()].filter(([, t]) => kind === undefined || t.rows.some(r => r.kind === kind)).map(([n]) => n) : []
  }
  // The truth of scene `name` of the open game, or, with `kind`, of one that has a row of that kind.
  // A name it has not got throws, naming those it has.
  sceneOf(name: string, kind?: string): Truth {
    const s = this.need()
    const names = this.scenesWith(kind)
    if (names.includes(name)) return s.scene(name)
    if (kind === undefined) throw new Error(`no scene ${name} of ${s.game.name}: its scenes are ${names.join(', ')}`)
    throw new Error(`no scene ${name} of ${s.game.name} has ${kind} rows: ${names.length ? `${names.join(', ')} do` : 'none does'}`)
  }
  // `entry`, an actors entry to write into scene `scene`, when each field it sets that its kind's
  // prefab has is of the shape of the prefab's (`shaped`), so the row it makes can be read as its
  // kind's rule reads it; else refused, naming the field and the prefab's value.
  entryShaped<T extends { is: string }>(scene: string, entry: T): T {
    const prefab = this.sceneOf(scene).scene.prefabs[entry.is] as Record<string, unknown> | undefined
    for (const [k, v] of Object.entries(entry)) {
      if (k === 'is' || !prefab || !Object.hasOwn(prefab, k)) continue
      const got = shaped(prefab[k]).safeParse(v)
      if (!got.success) throw new Error(`${entry.is}'s ${k} is ${JSON.stringify(prefab[k])} in its prefab, and ${JSON.stringify(v)} is not of its shape: ${z.prettifyError(got.error)}`)
    }
    return entry
  }
  // Row `id` of scene `scene`, live at the step the game is at.
  rowOf(scene: string, id: number): Row {
    const row = this.sceneOf(scene).rows.find(r => r.id === id)
    if (!row) throw new Error(`scene ${scene} has no row ${id}`)
    return row
  }

  select(selection: Selection) {
    this.selection = selection
    this.changed('selection')
  }

  // ---------------------------------------------------------------- changes, and undo

  // The editor's own edits, each an undo of its own.
  private readonly mine = this.edits(c => this.did(c))
  readonly editRow = this.mine.editRow
  readonly spawn = this.mine.spawn
  readonly end = this.mine.end
  readonly editFile = this.mine.editFile
  readonly saveFile = this.mine.saveFile
  readonly editFiles = this.mine.editFiles
  readonly route = this.mine.route
  readonly endHere = this.mine.endHere

  // The edits, each handed to `did` as it is made, a change of the files as it is sent (`sent`).
  private edits(did: (c: Change) => void): Edits {
    const ed: Edits = {
      editRow: (scene, id, at, value) => did({ row: this.need().edit({ set: { scene, id, path: at, value } }) }),
      spawn: (scene, kind, data = {}) => did({ row: this.need().edit({ spawn: { scene, kind, data } }) }),
      end: (scene, id) => {
        did({ row: this.need().edit({ end: { scene, id } }) })
        if (this.selection && 'id' in this.selection && this.selection.id === id) this.select({ scene })
      },
      editFile: async (file, at, value, insert = false) => {
        await this.sent(did, [{ json: file, at, value, insert }], file)
      },
      saveFile: async (file, value) => {
        await ed.editFiles(changes(JSON.parse(await this.text(file)), value).map(c => ({ file, ...c })))
      },
      editFiles: async edits => {
        if (!edits.length) return
        const ops: Op[] = edits.map(e => ({ json: e.file, at: e.at, value: e.value, ...(e.insert && { insert: true }), ...(e.index !== undefined && { index: e.index }) }))
        await this.sent(did, ops, [...new Set(edits.map(e => e.file))].join(', '))
      },
      route: async (owner, route, body) => (await this.sent(did, [{ route: { owner, route, body } }], `${owner} ${route}`)).answers[0] as never,
      endHere: async () => {
        const s = this.need(), at = s.n
        did({ recording: { at, tail: await s.rec.splice(at, { end: at, entries: [] }) } })
      },
      // The editor's own starts an action; an action's runs another as part of itself.
      together: action => (ed === this.mine ? this.together(action) : action(ed)),
    }
    return ed
  }

  // A change of the files made of `ops`, sent, and in the history at once (`did`), so an undo asked
  // for as soon as it is sent takes it back, which the server applies after it. Done once its answer
  // is taken in (`answered`). One the server refuses leaves the history, since nothing of it was
  // kept, and throws, said in the console as a change of `what`.
  private sent(did: (c: Change) => void, ops: Op[], what: string): Promise<Changed> {
    const id = crypto.randomUUID()
    const c: FilesChange = { change: id, files: [...new Set(ops.flatMap(o => ('json' in o ? [o.json] : 'text' in o ? [o.text] : 'bytes' in o ? [o.bytes] : [])))], ops }
    did(c)
    const asked = this.files.change(id, ops)
    asked.then(a => { c.files = Object.keys(a.files) }, () => this.forget(c))
    return this.answered(asked, what)
  }

  // Every answer of the server's, and every change another page made, taken in one after another, in
  // the order each arrives (`inTurn`).
  private taking: Promise<unknown> = Promise.resolve()
  private inTurn<T>(f: () => Promise<T>): Promise<T> {
    const next = this.taking.then(f)
    this.taking = next.catch(() => {})
    return next
  }

  // `asked`, a change, an undo or a redo sent, taken in as its answer arrives, after every answer and
  // every other page's change that arrived before it, so this page's own in the order it sent them, as
  // the server answers them (`took`). It is in hand from when it is sent until then (`holding`), so a
  // change on the disk is taken in after it. Done once it is taken in, with the answer. What the server
  // refuses, in its turn too, or a listener throws, is said in the console as a change of `what`, and
  // thrown.
  private answered(asked: Promise<Changed>, what: string): Promise<Changed> {
    const done = asked.then(
      a => this.inTurn(async () => {
        await this.took(a.files)
        return a
      }),
      (e: Error) => this.inTurn(() => Promise.reject(e)),
    ).catch((e: Error) => {
      throw this.said(e) ? e : this.told(e, `${what}: ${e.message}`)
    })
    return this.holding(() => done)
  }

  // A change, an undo or a redo another page made, as the server tells every page but that one
  // (`editor/server/disk.ts`), taken in as it arrives, on the chain this page's own answers are taken in
  // on (`took`), in hand until then (`holding`). Nothing is taken in while the page waits to reload or
  // is leaving, as it reads every file anew then. What a listener throws is said in the console.
  another(n: Applied): Promise<void> {
    const what = Object.keys(n.files).join(', ')
    const done = this.inTurn(async () => {
      if (this.reloading || this.leaving !== undefined) return
      await this.took(n.files)
      this.info(`${what} changed in another page`)
    }).catch((e: Error) => {
      if (!this.said(e)) this.error(`${what} changed in another page and could not be taken in: ${e.message}`, e.stack)
    })
    return this.holding(() => done)
  }

  // The files a change, an undo or a redo wrote, this page's or another's, by what each now reads,
  // null for one taken away or that holds no text, taken in (`takeIn`); and the page reloaded for those
  // it holds as they were and those the game boots from that are gone (`held`, `lost`), which a file
  // that holds no text, a picture say, is none of, once every action in hand is done, the one that
  // holds this change too, so it is in the history the reload puts back.
  private async took(files: Record<string, string | null>) {
    const written = Object.entries(files).map(([path, text]) => ({ path, gone: text === null }))
    const held = this.held(written)
    await this.takeIn(files)
    const reload = [...held, ...this.lost(written)]
    if (reload.length) void this.reloadPage(reload)
  }

  // A change the server refused, out of the history, and out of the action it is of.
  private forget(c: Change) {
    const out = (list: Change[]) => {
      const i = list.indexOf(c)
      if (i >= 0) list.splice(i, 1)
      for (const s of list) if ('steps' in s) out(s.steps)
    }
    out(this.undos)
    out(this.redos)
    this.changed('history')
  }

  // How many times a change has written the file at `path` since the editor began, or the disk has
  // changed it: what a picture read from the file is read anew by, since the page keeps one it has
  // read.
  writes(path: string) { return this.rewritten.get(path) ?? 0 }
  // How many times a change has written a file in the folder `dir`, or below it, or taken one away:
  // what a list of the folder's files is listed anew by, as such a change adds a file.
  writesIn(dir: string) {
    let n = 0
    for (const [p, k] of this.rewritten) if (p.startsWith(`${dir}/`)) n += k
    return n
  }
  private rewritten = new Map<string, number>()

  // Files a change wrote or took away, or that changed on the disk, taken in as `now` says each now
  // reads, by its path, null for one taken away or that holds no text: each counts once more
  // (`writes`); each that the editor does not hold the text of, is not named `.json` and holds no
  // JSON object or list, a picture or code say, is handed to every bytes listener (`onBytes`); and
  // each other one is handed to every file listener and the game rebuilt from it (`written`), or
  // forgotten when it was taken away.
  private async takeIn(now: Record<string, string | null>) {
    const texts = new Map<string, string>()
    const read = (f: string) => this.texts.has(f) || /\.json$/i.test(f) || holdsJson(now[f])
    const files = Object.keys(now)
    for (const f of files) this.rewritten.set(f, this.writes(f) + 1)
    const bytes = files.filter(f => !read(f))
    if (bytes.length) this.changed('texts', bytes)
    for (const f of bytes) await Promise.all(this.bytesListeners.map(l => l.f(f)))
    const gone: string[] = []
    for (const f of files) {
      if (!read(f)) continue
      const text = now[f]
      if (text === null) {
        if (this.texts.delete(f)) gone.push(f)
      } else texts.set(f, text)
    }
    if (gone.length) this.changed('texts', gone)
    if (texts.size) await this.written(texts)
  }

  // Files written, by a change or on the disk, as they now read: each is handed to every file listener
  // and the game rebuilt from it. A listener is handed as the text before the one the editor last read
  // or wrote, or, for a file it never has, the new one.
  async written(texts: Map<string, string>) {
    try {
      const first = new Map([...texts].map(([file, text]) => [file, this.texts.get(file) ?? text]))
      for (const [file, text] of texts) this.texts.set(file, text)
      this.changed('texts', texts.keys())
      await this.landed(texts, first)
    } catch (e) {
      throw this.told(e as Error, `${[...texts.keys()].join(', ')}: ${(e as Error).message}`)
    }
  }

  // Hands each file's new text, and the text it had before, to every file listener, then rebuilds the
  // game from each. Every file is handed to the listeners before the game is rebuilt from any: a
  // change that spans files, such as the packs of one sheet, is whole only once the last of them is
  // written, so a file a listener threw on is handed to them again after the rest, and only a second
  // throw fails.
  private async landed(texts: Map<string, string>, first: Map<string, string>) {
    const hand = async (file: string, text: string) => { await Promise.all(this.fileListeners.map(l => l.f(file, text, first.get(file)!))) }
    const again: [string, string][] = []
    for (const [file, text] of texts) await hand(file, text).catch(() => again.push([file, text]))
    for (const [file, text] of again) await hand(file, text)
    // A scene the manager's table names no more is let go of before the game is rebuilt without it,
    // which every panel is drawn from at once.
    const manager = this.session && texts.get(this.session.game.path)
    if (manager !== undefined) {
      const kept = this.kept(this.selection, Object.keys(JSON.parse(manager).prefabs.scenemanager.scenes))
      if (kept !== this.selection) {
        this.selection = kept
        this.changed('selection')
      }
    }
    for (const [file, text] of texts) await this.session?.authored(file, text)
    // A scene file may name a plugin or an addon more, or one less, which `fit` tells as it turns
    // their extensions on and off.
    await this.fit()
    this.changed('game')
  }

  // A selection of a scene the game has not got, one a change took out of the manager's table, is
  // no selection; `names` is the table's, by default the one the game has.
  private kept(sel: Selection, names = [...(this.session?.scenes().keys() ?? [])]): Selection {
    return sel && 'scene' in sel && !names.includes(sel.scene) ? undefined : sel
  }

  // Runs one action, handed an editor whose every change, to rows and files, is one undo, however
  // many edits it takes: a slider's value that is several fields, or an act that sets several. Only
  // what the action makes through the editor it is handed is its own, so an action that waits and
  // another run meanwhile are two undos, each of only its own changes. An action run by the editor
  // handed to another is part of that one. An action that does not wait is done when it returns; one
  // that waits (a promise) takes in its changes until it settles, and one made after that is an
  // undo of its own. It is in the history from the first change it makes, so an undo asked for while
  // it is in hand takes it back, once it ends (`undo`); one that ends with one change is that change.
  together<T>(action: (ed: Edits) => T): T {
    const one: Steps = { steps: [] }
    let open = true
    let ended!: () => void
    const ending = new Promise<void>(done => { ended = done })
    const end = () => {
      open = false
      this.ending.delete(one)
      ended()
      const i = this.undos.indexOf(one)
      if (i < 0 || one.steps.length > 1) return
      if (one.steps.length) this.undos[i] = one.steps[0]
      else this.undos.splice(i, 1)
      this.changed('history')
    }
    let out: T
    try {
      out = action(this.edits(c => {
        if (!open) return this.did(c)
        one.steps.push(c)
        if (one.steps.length > 1) return this.changed('history')
        this.ending.set(one, ending)
        this.did(one)
      }))
    } catch (e) {
      end()
      throw e
    }
    if (!(out instanceof Promise)) {
      end()
      return out
    }
    return this.holding(() => out.finally(end)) as T
  }
  // Each action in hand that is in the history, and what settles as it ends.
  private ending = new WeakMap<Change, Promise<void>>()

  private did(c: Change) {
    this.undos.push(c)
    this.redos = []
    this.changed('history')
  }

  // Takes back the last change in the history, and done once what it wrote back is taken in; one of an
  // action still in hand is taken back whole once the action ends. It is an action in hand itself
  // until it is done (`holding`), so a reload for the code it writes back waits for the change to be
  // in the history again.
  undo() {
    return this.holding(async () => {
      const c = this.undos.pop()
      if (!c) return
      this.changed('history')
      await this.ending.get(c)
      await this.take(c)
      this.redos.push(c)
      this.changed('history')
    })
  }

  // Makes again the last change taken back, and done once what it wrote is taken in, as `undo` is.
  redo() {
    return this.holding(async () => {
      const c = this.redos.pop()
      if (!c) return
      this.changed('history')
      await this.make(c)
      this.undos.push(c)
      this.changed('history')
    })
  }

  // A change taken back, the last of an action's first; and made again, in the order it was made. The
  // server takes back a change of the files, and makes it again, by its id.
  private async take(c: Change) {
    if ('steps' in c) for (const s of [...c.steps].reverse()) await this.take(s)
    else if ('change' in c) await this.answered(this.files.undo(c.change), c.files.join(', '))
    else if ('recording' in c) c.recording.tail = await this.need().rec.splice(c.recording.at, c.recording.tail)
    else await this.need().unedit(c.row)
  }
  private async make(c: Change) {
    if ('steps' in c) for (const s of c.steps) await this.make(s)
    else if ('change' in c) await this.answered(this.files.redo(c.change), c.files.join(', '))
    else if ('recording' in c) c.recording.tail = await this.need().rec.splice(c.recording.at, c.recording.tail)
    else await this.need().redo(c.row)
  }

  // The open game, for whatever needs one: with none open it throws, as every command on a game is
  // refused then.
  need(): Session {
    if (!this.session) throw new Error('no game is open')
    return this.session
  }

  // ---------------------------------------------------------------- across a reload

  // What a reload puts back: the game, its recording and step, the selection and the history, with
  // each row change named by its place in the journal, and each change of the files by its id and its
  // files, which the server keeps it by across the reload, without the ops it was sent as.
  save(): Remembered | undefined {
    const s = this.session
    if (!s) return undefined
    const index = (c: Change): SavedChange =>
      'steps' in c ? { steps: c.steps.map(index) } : 'row' in c ? { row: s.rec.journal.indexOf(c.row) } : 'change' in c ? { change: c.change, files: c.files } : c
    return { session: s.save(), selection: this.selection, undos: this.undos.map(index), redos: this.redos.map(index) }
  }

  // A session of another game than this editor's is refused: the page keeps one for each game.
  async restore(state: Remembered) {
    if (state.session.game !== this.game?.name) throw new Error(`the session kept is of ${state.session.game}, not ${this.game?.name ?? 'a game this editor has'}`)
    await this.open(state.session)
    const journal = this.need().rec.journal
    const back = (c: SavedChange): Change | undefined => {
      if ('steps' in c) {
        const steps = c.steps.map(back).filter(s => s !== undefined)
        return steps.length ? { steps } : undefined
      }
      return 'row' in c ? (journal[c.row] ? { row: journal[c.row] } : undefined) : c
    }
    this.undos = state.undos.map(back).filter(c => c !== undefined)
    this.redos = state.redos.map(back).filter(c => c !== undefined)
    this.selection = this.kept(state.selection)
    this.changed('history')
    this.changed('selection')
  }
}

export type Remembered = { session: Saved; selection: Selection; undos: SavedChange[]; redos: SavedChange[] }
