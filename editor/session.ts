// The open game, played in the page the way `index.html` plays it: the manager booted and loaded
// under the recorder, one seat, and, while a game view shows it, the scenemanager's `view` on that
// seat drawing into the view's element. The client it draws with is `client`, and every panel is
// told when that changes. `onClient` hears each client the view mounts, once its canvases are on the
// page, and hears undefined just before the view lets that client go, while its plugins still stand.
// A client is let go at once, even in the middle of a frame: what the rest of that frame throws on
// the closed client is said by nothing, and the client drawn next draws on.
// The editor's clock steps it while it plays; paused, it steps when told, and goes back by seeking.
// The clock is a timer on the machine's clock, never the display's `requestAnimationFrame`, which
// Chrome slows in a window it thinks is covered and stops in a hidden tab: a frame each `FRAME`
// milliseconds steps what real time owes, at most `OWED` seconds of it, so a hidden tab, whose
// timers Chrome fires once a second, plays at the game's pace too; then draws the view, then calls
// whoever follows the clock (`onFrame`). Whether a view draws it at all is `attached`: the Game panel
// attaches it while it is shown.
// A command needs no clock: it runs steps (`run`), draws a frame of the view (`frame`), mounts the
// view's client (`mounted`), draws a frame and answers the client of the scene a preview is of
// (`clientOn`), and takes a picture of the view (`shot`) itself, so all of it works at once, whenever
// the clock's next frame falls, and with no clock at all, as in a test that stops it.
//
// Scene files are edited in memory too: every scene file the game booted from is an object the
// page imported, and an authored edit refills that object from the file's new text before the
// step is rebuilt, so the rebuild boots from what the file now says, and the view makes a new
// client for it, since plugins read their prefab once. An edit of the manager's file whose table
// names a scene more takes that scene's file in, imported as the scenemanager boots it, and one it
// names no longer is let go. A data file is handed to whoever reads it
// through the editor's file listeners, which the datafiles extension is one of: its parsed copies
// are refilled in place, and each plugin's browser half builds again what it built once from the
// file (the loader's `onWritten`). Then the step is rebuilt, and the view keeps the client it draws
// with, at the step it was at, and sets every actor of it up again from the rows it was handed
// last, as a page arriving now would, so a value an actor read once as it first drew, a mesh's size
// say, is the file's new one. It is every actor, because an actor reads whatever file of its
// scene's catalogue it likes, its own kind's definition or another's, in `setup` or on the first
// frame it draws, and nothing records which: the one file known to reach no actor is one its scene
// does not catalogue, and that sets none up again.
//
// A scene's actors file, the list of `actors` entries its `actorsFile` names, is part of the scene
// the game boots from: the scenemanager reads it once and keeps the list (`actorsOf`), and an
// authored edit of it refills that kept list in place from the file's new text, so the rebuild boots
// from what the file now says, and the view makes a new client, as it does for a scene file. So the
// entry a row was made from is in one file or the other (`actor`).
import type { Client } from '#engine/browser.ts'
import type { Row, Scene, Sim, Truth } from '#engine/engine.ts'
import { actorsOf, manager, scenes, view, type Entry as SceneEntry } from '#addons/scenemanager/scenemanager.addon.ts'
import { put, recorder, type Edit, type Entry, type Path, type Recorder } from '#addons/recorder/recorder.addon.ts'
import { watch } from './drawn.ts'
import type { Game } from './games.ts'

export type Saved = { game: string; journal: Entry[]; end: number; n: number }

// The milliseconds of a frame of the editor's clock, and the most seconds of steps one frame runs.
const FRAME = 1000 / 60
const OWED = 1

// Empties `into` and gives it every field of `from`, so whatever holds `into` reads `from`.
function refill(into: Record<string, unknown>, from: Record<string, unknown>) {
  for (const key of Object.keys(into)) delete into[key]
  Object.assign(into, from)
}

// `files` made to hold the file of every scene the manager's table names, by its path from the repo,
// beside the manager's own: the one its sim exports, which the scenemanager boots it from, imported
// for a scene it lacks; and a scene's file the table no longer names let go.
async function named(game: Game, files: Map<string, Scene>) {
  const table = game.file.prefabs.scenemanager.scenes as Record<string, SceneEntry>
  const folder = game.path.slice(0, game.path.lastIndexOf('/') + 1)
  const paths = new Set(Object.values(table).map(e => folder + e.file))
  for (const path of [...files.keys()]) if (path !== game.path && !paths.has(path)) files.delete(path)
  for (const entry of Object.values(table)) {
    if (files.has(folder + entry.file)) continue
    const mod = await import(/* @vite-ignore */ new URL(entry.file.replace(/\.scene\.json$/, '.sim.ts'), game.base).href)
    files.set(folder + entry.file, mod.scene)
  }
}

export class Session {
  readonly game: Game
  readonly sim: Sim
  readonly rec: Recorder
  // Every scene file the game booted from, by its path from the repo: the manager's and each child's.
  readonly files: Map<string, Scene>
  // The list the scenemanager keeps of each actors file a scene the game booted from names, by the
  // file's path from the repo.
  readonly lists = new Map<string, Scene['actors']>()
  playing = false
  speed = 1
  private stage: HTMLElement | undefined
  private page: ReturnType<typeof view> | undefined
  private closed = false
  private last = 0
  private owed = 0
  // What a frame threw, while nothing has changed since that could make the next one draw.
  private stuck: Error | undefined
  // The client the game view drew with last frame, so a panel reading it hears when it changes.
  private drawing: Client | undefined
  // The frame being drawn and the actors being set up again, one after the other and never together,
  // so no actor is set up while the client is still importing it.
  private turn: Promise<unknown> = Promise.resolve()
  private listeners = new Set<() => void>()
  private told = 0
  private version = 0
  private errors = new Set<(message: string, stack?: string) => void>()
  private clients = new Set<(client: Client | undefined) => void>()
  private frames = new Set<() => void>()

  // The one timer the clock asks for, `f` run `ms` milliseconds from now: a test that stops the clock
  // stops this (`noClock`).
  static after(ms: number, f: () => void) { setTimeout(f, ms) }

  private constructor(game: Game, sim: Sim, rec: Recorder, files: Map<string, Scene>) {
    this.game = game
    this.sim = sim
    this.rec = rec
    this.files = files
    rec.on(() => this.changed())
  }

  static async open(game: Game, saved?: Saved): Promise<Session> {
    const sim = await game.sim()
    const files = new Map<string, Scene>([[game.path, game.file]])
    await named(game, files)
    const rec = await recorder(game.file, sim, game.base, saved?.journal ?? [], saved?.end ?? 0)
    const me = new Session(game, sim, rec, files)
    await me.track()
    if (saved?.n) await rec.seek(saved.n)
    me.loop()
    return me
  }

  save(): Saved {
    return { game: this.game.name, journal: [...this.rec.journal], end: this.rec.end, n: this.rec.n }
  }

  // ---------------------------------------------------------------- what the editor reads

  get n() { return this.rec.n }
  get end() { return this.rec.end }
  get truth(): Truth { return this.rec.truth }
  // The manager's children, by scene name.
  scenes(): Map<string, Truth> { return scenes(manager(this.rec.truth)) }
  scene(name: string): Truth {
    const t = this.scenes().get(name)
    if (!t) throw new Error(`no scene ${name}`)
    return t
  }
  row(scene: string, id: number): Row | undefined { return this.scenes().get(scene)?.rows.find(r => r.id === id) }
  // The path from the repo of the file a child scene was booted from, by the table the game booted
  // with, so every scene `scenes` has has one, while a change to the manager's file is rebuilding it.
  path(scene: string): string {
    const entry = (manager(this.rec.truth).data.scenes as Record<string, SceneEntry>)[scene]
    if (!entry) throw new Error(`no scene ${scene}`)
    return this.fileOf(entry)
  }
  // The path from the repo of the actors file a child scene's file names, when it names one: its
  // `actorsFile`, from the scene file's folder.
  actorsPath(scene: string): string | undefined {
    return this.listedBy(this.path(scene))
  }
  // The `actors` entry row `id` of a child scene was made from, and where it is written: `file` by
  // its path from the repo and `at` in it. A scene's actors are its file's `actors`, then the list
  // its actors file holds, as the scenemanager boots them, and a row's id is its entry's place in
  // the two, plus one. Undefined for a row no entry made, one spawned.
  actor(scene: string, id: number): { file: string; at: Path; entry: Scene['actors'][number] } | undefined {
    const path = this.path(scene)
    const own = this.files.get(path)?.actors ?? []
    const i = id - 1
    if (i < own.length) return { file: path, at: ['actors', i], entry: own[i] }
    const listed = this.actorsPath(scene)
    const entry = listed === undefined ? undefined : this.lists.get(listed)?.[i - own.length]
    return entry && { file: listed!, at: [i - own.length], entry }
  }
  // The path from the repo of the scene file a table's entry names, and of the actors file a scene
  // file at `path` names.
  private fileOf(entry: SceneEntry) { return this.game.path.slice(0, this.game.path.lastIndexOf('/') + 1) + entry.file }
  private listedBy(path: string): string | undefined {
    const file = this.files.get(path)?.actorsFile
    return typeof file === 'string' ? decodeURIComponent(new URL(file, `file:///${path}`).pathname.slice(1)) : undefined
  }
  // The client the game view draws with, while one does, and the scene it draws.
  get client(): Client | undefined { return this.page?.client }
  get viewing(): string | undefined { return this.page?.name }
  // Whether a game view draws the game (`attach`), as the Game panel does while it is shown.
  get attached(): boolean { return this.page !== undefined }

  // ---------------------------------------------------------------- changes

  subscribe = (f: () => void) => {
    this.listeners.add(f)
    return () => { this.listeners.delete(f) }
  }
  snapshot = () => this.version
  onError(f: (message: string, stack?: string) => void) {
    this.errors.add(f)
    return () => { this.errors.delete(f) }
  }
  onClient(f: (client: Client | undefined) => void) {
    this.clients.add(f)
    return () => { this.clients.delete(f) }
  }
  // `f` called after each frame of the clock, whether a view draws or not, until the call it hands
  // back is made. What it throws is told as an error, and the clock goes on.
  onFrame(f: () => void) {
    this.frames.add(f)
    return () => { this.frames.delete(f) }
  }

  // Tells React. While playing, at most ten times a second, so a panel listing every row is not
  // drawn every step.
  private changed() {
    this.stuck = undefined
    const now = performance.now()
    if (this.playing && now - this.told < 100) return
    this.told = now
    this.tell()
  }
  private tell() {
    this.version++
    for (const f of this.listeners) f()
  }

  // ---------------------------------------------------------------- the clock

  // The clock: each frame it steps what the time since the last owes, while playing, at most `OWED`
  // seconds of it, then draws (`frame`), then calls whoever follows it (`onFrame`). The next frame is
  // due `FRAME` after this one was, or at once when this one ended past that, as a display's next
  // frame comes as soon as a slow one is done: a frame is a task of its own, so a press or a key is
  // taken between two frames however slow they are, and what counts frames, as a page's own effect
  // ages a step a frame, counts as many as the display would draw.
  private loop() {
    let due = performance.now()
    const tick = async () => {
      if (this.closed) return
      const now = performance.now()
      if (this.playing) {
        // What the view reads once a frame goes up before the steps, which take it.
        if (!this.stuck) this.page?.input()
        this.owed += Math.min((now - this.last) / 1000, OWED) * this.speed
        while (this.playing && this.owed >= this.rec.dt) {
          this.owed -= this.rec.dt
          const failed = this.stepped()
          if (failed) await failed
        }
      }
      this.last = now
      // Playing, the view draws between the last two steps, as far past the newest as the clock
      // owes; paused, it draws the step the game is at.
      await this.frame(this.playing ? this.owed / this.rec.dt : undefined)
      for (const f of [...this.frames]) {
        try {
          f()
        } catch (e) {
          for (const told of this.errors) told(`frame: ${(e as Error).message}`, (e as Error).stack)
        }
      }
      if (this.closed) return
      const ended = performance.now()
      due = Math.max(due + FRAME, ended)
      Session.after(due - ended, () => void tick())
    }
    Session.after(0, () => void tick())
  }

  // One frame of the game view, as the clock draws each: none while the view is closed, or stuck on
  // a frame that threw. The first frame after a packet of a scene the view has no client for makes
  // that client, so before the clock's next frame, or with no clock, this is what mounts one.
  // `between` is how far past the newest step the clock is, in steps, which the view draws a step
  // behind (`engine/browser.ts`, Drawing between steps); with none it draws the newest step.
  async frame(between?: number) {
    const page = this.page
    if (!page || this.stuck) return
    // Paused, the seat is handed the step it is at again, every frame: the client draws what has
    // landed since, a file or a texture.
    if (!this.playing) this.rec.refresh()
    await this.queued(async () => {
      if ((await this.draw(page, between)) === undefined) this.saw()
    })
  }
  // `page`'s frame, answering what it threw, or undefined when it drew. One that throws pauses the
  // game and holds the view still until something changes that could make the next frame draw, and
  // is told as a frame's failure. A page let go while it drew this frame (`rebuild`, `detach`) closed
  // its client inside it, and the engine goes on to that client's plugins, whose renderer is gone:
  // what that throws is of a client no view draws, and the one drawn now is not stuck by it.
  private async draw(page: ReturnType<typeof view>, between?: number): Promise<Error | undefined> {
    try {
      await page.frame(between)
      return undefined
    } catch (e) {
      if (this.page !== page) return undefined
      this.broke('frame', e as Error)
      return e as Error
    }
  }
  // A panel reading the client hears when the view draws with another.
  private saw() {
    if (this.page?.client === this.drawing) return
    this.drawing = this.page?.client
    this.changed()
  }
  // A frame or a redraw threw: the game pauses, the view holds still, and the failure is told.
  private broke(what: string, e: Error) {
    this.pause()
    this.stuck = e
    for (const f of this.errors) f(`${what}: ${e.message}`, e.stack)
  }

  // A picture of the game view as it is now, a PNG at most `width` pixels across, at the shape the
  // view draws: every canvas the view put on the stage, the game's and the UI's over it, one over
  // the other as the page shows them, with whatever the renderer draws over the game inside its
  // frame. It is taken in the turn, so it never lands inside a frame the clock draws: a frame is
  // drawn for it, and its canvases copied with nothing run between, since a canvas read once the
  // page has shown it is transparent, and one read a task after its frame is blank some of the
  // time. It needs no frame of the clock's.
  shot({ width = 800 }: { width?: number } = {}): Promise<Blob> {
    return this.queued(async () => {
      const { page, stage } = this.open()
      await this.drawn(page)
      const canvases = this.canvases(stage)
      const k = Math.min(1, width / canvases[0].width)
      const out = document.createElement('canvas')
      out.width = Math.round(canvases[0].width * k)
      out.height = Math.round(canvases[0].height * k)
      const g = out.getContext('2d')!
      for (const c of canvases) g.drawImage(c, 0, 0, out.width, out.height)
      this.saw()
      return new Promise<Blob>((ok, no) => out.toBlob(b => (b ? ok(b) : no(new Error('the picture of the game view could not be made'))), 'image/png'))
    })
  }
  // The client the game view draws with, for a command on what only it holds: where the view has
  // mounted none, as where no frame has run, a frame is drawn for it first. Refused as a shot is,
  // from what the view drew.
  mounted(): Promise<Client> {
    return this.queued(async () => {
      const { page, stage } = this.open()
      if (!page.client) await this.drawn(page)
      this.canvases(stage)
      this.saw()
      return page.client!
    })
  }
  // The client the game view draws `scene` with, for a preview drawn with what only it holds: a frame
  // is drawn for it first, so the view is on the scene its seat is on now, which no frame of the
  // clock's may have moved it to yet, and has mounted that scene's client. Refused as
  // `mounted` is, and, naming the scene it shows, while it shows another.
  clientOn(scene: string): Promise<Client> {
    return this.queued(async () => {
      const { page, stage } = this.open()
      await this.drawn(page)
      this.canvases(stage)
      this.saw()
      if (page.name !== scene) throw new Error(`the game view shows ${page.name}, not ${scene}: a preview is drawn in the scene the view shows`)
      return page.client!
    })
  }
  // The view, while it is open and not held still; as the clock draws no frame over one that threw
  // until something changes, neither does a command.
  private open() {
    const page = this.page, stage = this.stage
    if (!page || !stage) throw new Error('the game view is not open: show the Game panel')
    if (this.stuck) throw new Error(`the game view is held still: its last frame threw, and nothing has changed since: ${this.stuck.message}`)
    return { page, stage }
  }
  // A frame of the view drawn for a command, its failure the command's.
  private async drawn(page: ReturnType<typeof view>) {
    if (!this.playing) this.rec.refresh()
    const threw = await this.draw(page)
    if (threw) throw new Error(`the game view's frame failed: ${threw.message}`)
  }
  // The canvases the view drew on: none until its seat's first packet mounts a client.
  private canvases(stage: HTMLElement) {
    const canvases = [...stage.querySelectorAll('canvas')]
    if (!canvases.length) {
      this.saw()
      throw new Error('the game view draws nothing yet: its seat has had no packet, until the game steps')
    }
    return canvases
  }

  setSpeed(speed: number) {
    this.speed = speed
    this.owed = 0
    this.changed()
  }
  play() {
    if (this.playing) return
    this.playing = true
    this.owed = 0
    this.last = performance.now()
    // Told whenever the last telling was: the ten a second while playing are for its steps.
    this.told = 0
    this.changed()
  }
  pause() {
    if (!this.playing) return
    this.playing = false
    this.told = 0
    this.changed()
  }
  async step() {
    this.pause()
    await this.stepped()
  }
  // `steps` steps, paused, one after the other with no clock, at once, as fast as they run. Stops at
  // a step that throws.
  async run(steps: number) {
    this.pause()
    for (let i = 0; i < steps && !this.closed; i++) {
      const failed = this.stepped()
      if (failed) return await failed
    }
  }
  // One step: undefined when it ran, and else a step that threw, which pauses the game and is done
  // once the step before it is rebuilt and its failure told.
  private stepped(): Promise<void> | undefined {
    const failed = this.rec.step()
    if (!failed) return undefined
    this.pause()
    return failed.then(() => {
      const f = this.rec.failure
      if (f) for (const e of this.errors) e(`step ${f.at}: ${f.message}`, f.stack)
    })
  }
  async back() {
    this.pause()
    await this.rec.seek(this.rec.n - 1)
  }
  async seek(k: number) {
    this.pause()
    await this.rec.seek(k)
  }
  async restart() {
    this.pause()
    await this.rec.restart()
  }

  // ---------------------------------------------------------------- the view

  // Draws the game into `stage`: the canvases every page makes, the game's and the UI's over it.
  // Each tells every panel, whether the game plays or not, so one waiting on `attached` hears it.
  attach(stage: HTMLElement) {
    this.stage = stage
    this.page = this.view()
    this.tell()
  }
  detach() {
    this.letGo(this.page)
    this.page = undefined
    this.stage = undefined
    this.tell()
  }
  // A view let go: closed now, so it draws nothing more, and again once the frame in hand has
  // finished, since a frame that was mounting a client as the view was let go mounts it after, and
  // that client, with the renderer it has begun to make, is closed then. What that second close
  // throws has no caller to reach, and is told as a frame's failure is.
  private letGo(page: ReturnType<typeof view> | undefined) {
    if (!page) return
    page.close()
    void this.queued(async () => {
      try {
        page.close()
      } catch (e) {
        for (const f of this.errors) f(`close: ${(e as Error).message}`, (e as Error).stack)
      }
    })
  }
  // Runs `f` once the frame or redraw before it has finished.
  private queued<T>(f: () => Promise<T>): Promise<T> {
    const next = this.turn.then(f)
    this.turn = next.catch(() => {})
    return next
  }

  // Every actor of the client the game view draws with, set up again from the rows it was handed
  // last: its `remove`, then its `setup`, on the module the client runs for that row (`actor` in
  // `engine/browser.ts`), so the client goes on ticking the actor set up again. Only a client whose scene catalogues the file at `url`, whose actors are the
  // only ones that can have read it. What an actor throws is said as a frame's failure is.
  private async redraw(url: string) {
    await this.queued(async () => {
      const me = this.page?.client
      if (!me) return
      const assets = (me.plugins.wire.scene.world?.loader?.assets ?? {}) as Record<string, { url: string }>
      if (!Object.values(assets).some(a => a.url === url)) return
      const rows = me.rows
      const actors = rows.map(r => me.actor(r.id))
      try {
        rows.forEach((r, i) => {
          actors[i]?.remove(me.plugins)
          actors[i]?.setup(r, me.plugins)
        })
      } catch (e) {
        this.broke('redraw', e as Error)
      }
    })
  }

  // A new client, for a scene file whose numbers plugins and actors read once, at setup.
  rebuild() {
    if (!this.stage) return
    this.letGo(this.page)
    this.page = this.view()
    this.stuck = undefined
  }
  private view() {
    const stage = this.stage!
    return view(this.rec.link, this.game.file, this.game.base, (me: Client, scene: Scene) => {
      watch(me.plugins)
      for (const surface of [me.plugins.render3d ?? me.plugins.render2d, me.plugins.ui]) {
        if (!surface) continue
        const canvas = document.createElement('canvas')
        canvas.width = scene.prefabs.engine.width
        canvas.height = scene.prefabs.engine.height
        stage.appendChild(canvas)
        surface.mount(canvas)
      }
      const close = me.close
      me.close = () => {
        for (const f of this.clients) f(undefined)
        close()
      }
      for (const f of this.clients) f(me)
    })
  }

  // ---------------------------------------------------------------- edits

  // A field of a live row, from this step on; journaled, so every rebuild keeps it.
  edit(e: Edit): Entry { return this.rec.edit(e) }
  unedit(e: Entry) { return this.rec.unedit(e) }
  redo(e: Entry) { return this.rec.redo(e) }

  // A field of a live row, for this frame only: what a drag shows before it lets go.
  preview(scene: string, id: number, at: Path, value: unknown) {
    const row = this.row(scene, id)
    if (!row) return
    put(row.data, at, structuredClone(value))
    this.rec.refresh()
    this.changed()
  }

  // A value of a scene's `world`, for this frame only, as `preview` shows a row's: put in the
  // truth's `world` and, while the view draws that scene, in its client's scene, where a plugin's
  // browser half reads it. Letting go writes the file, which boots the truth and makes a client again.
  previewWorld(scene: string, at: Path, value: unknown) {
    put(this.scene(scene).world, at, structuredClone(value))
    const client = this.viewing === scene ? this.client : undefined
    if (client) put(client.plugins.wire.scene.world!, at, structuredClone(value))
    this.rec.refresh()
    this.changed()
  }

  // The kept list of every actors file a child scene names, found anew: the scenemanager's own, read
  // from the url the recorder boots it from, so it is the very list every boot reads.
  private async track() {
    this.lists.clear()
    const table = this.game.file.prefabs.scenemanager.scenes as Record<string, SceneEntry>
    for (const entry of Object.values(table)) {
      const at = this.listedBy(this.fileOf(entry))
      if (at === undefined) continue
      const file = this.files.get(this.fileOf(entry))!.actorsFile as string
      this.lists.set(at, await actorsOf(new URL(entry.file, this.game.base), file))
    }
  }

  // A file changed: the step is rebuilt from the files as they are now. A scene file the game booted
  // from takes the new text, and an actors file one of them names refills the list the scenemanager
  // keeps of it, and the view a new client, because plugins read their prefab once and a client its
  // scene; a data file has been refilled in place, and the view keeps its client and sets its actors
  // up again once the frame it is drawing has finished, which the edit does not wait for.
  async authored(path: string, text: string) {
    const scene = this.files.get(path)
    const list = this.lists.get(path)
    if (scene) refill(scene as Record<string, unknown>, JSON.parse(text))
    // The manager's table may name a scene more, or one less.
    if (path === this.game.path) await named(this.game, this.files)
    if (list) {
      const now = JSON.parse(text)
      if (!Array.isArray(now)) throw new Error(`${path} is not a list of actors entries`)
      list.splice(0, list.length, ...now)
    }
    // A scene file may name another actors file now.
    if (scene) await this.track()
    await this.rec.rerun()
    if (scene || list) this.rebuild()
    else void this.redraw('/' + path.replace(/^\//, ''))
  }

  close() {
    // The frame the clock has asked for runs nothing once closed.
    this.closed = true
    this.frames.clear()
    this.detach()
    this.rec.link.close()
  }
}
