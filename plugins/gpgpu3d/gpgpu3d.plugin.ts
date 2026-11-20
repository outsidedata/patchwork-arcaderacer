// The browser half of gpgpu3d (`gpgpu3d.sim.ts`): the things texture, filled each frame, and the shader
// handed to whoever asks. Nothing of it is on a row and nothing of it goes up the wire: every page holds
// its own.
//
// Listing. It fills the texture in its `afterTick`, from the camera as render3d has it, so it is listed
// with render3d, and before every plugin whose pass reads the texture in its own `afterTick`
// (gpuparticle3d), which throws when it is not.
//
// `fill(plugins)` asks every `things` mod for its things within `world.gpgpu3d.reach` of the camera, packs
// them (`pack`), and writes the texture when they are not the ones it holds: a scene whose things stand
// still writes it once. Its `afterTick` fills it. A plugin whose pass runs as the scene is drawn, where
// every object stands where the frame draws it (fabric3d, hair3d), fills it again there, first, so a thing
// carried by a bone is where the bone is drawn.
//
// It hands out `shader(plugins, who)`, for the plugin `who` that reads it: `{ glsl, uniforms, words,
// things() }`. `glsl` is `glslOf` for the plugins whose things `who` meets (`world.gpgpu3d.meets`);
// `uniforms` what it reads, gpgpu3d's and every word's own, each the one object for as long as the page
// lives, so a material handed them once reads the texture as it is every frame after; `words` the words in
// the order `gpWord` numbers them; and `things()` the things `who` meets as they were last filled, for what
// a reader does with them on the CPU. `close` disposes the texture and every texture a word made.
//
// It hands out `program(plugins, name, program, allowed?, what?, part?)` for a reader whose shader runs a program of ops
// (`gpgpu3d.ops.ts`): the program compiled over the ops this scene's mods deliver, `{ glsl, outs, kinds, at,
// moves, kept, uniforms }`, `outs` the name of the function of each name of the program's `out`, `kinds` whether each is a
// number or a colour (`allowed`, `{ <name>: 'number' | 'colour' }`, says which the reader takes), `moves` whether
// each changes from frame to frame, `part` and `kept` the half of it a reader that keeps what does not move
// asks for and the kept nodes of that half (`gpgpu3d.ops.ts`, Still and moving), `at` the name of the
// function the reader gives each point to before it reads an output, `uniforms` the shared uniforms the
// GLSL reads (`gpTime`, the page's clock in seconds, set each frame by `fill`), each the one object for as
// long as the page lives. The GLSL goes in the reader's shader once, ahead of the calls, and the uniforms
// are spread into its material's. The same program under the same name is compiled once.
//
// It hands out `keeper(plugins, spec)` for a reader that keeps what its things are (`gpgpu3d.keeper.ts`): what
// is kept and where (`layout`), and `room({ cols, rows, count, uniforms, what, hint })`, a grid of slots of
// `count` things each, a texel a thing, in render targets of its own. A room hands out `reading(groups?)`,
// the GLSL a reader's shader holds and the uniforms it reads (the room's textures among them, each the one
// object for as long as the room lives); `want(col, row, a, b)`, which says a slot is to hold the things of the
// tag (a, b), and costs nothing where it does; `stale(col, row)` and `staleAll()`, which say what a slot holds
// is no longer right, so the next `want` writes it again; `keep(renderer)`, which draws the keeping shader over
// every slot wanted and not held, one square a slot, a draw for each four textures, and no draw with none; the
// readouts `held()`, `drew()` (the slots written since it was made, one written again counted again) and
// `textures()`; and `dispose()`. A room of more texels than the GPU's largest texture throws at `keep`, naming
// `what` and saying `hint`.
import type { Plugins } from '#engine/browser.ts'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { WIDE, check, glslOf, handing, pack, tableOf, type Shader, type Table, type Thing, type Things, type Uniforms } from './gpgpu3d.sim.ts'
import { compile, opsOf, type Kind, type OpTable, type Part, type Program } from './gpgpu3d.ops.ts'
import { plan, type Kept, type Programmed, type Room, type Roomed, type Spec } from './gpgpu3d.keeper.ts'

// One reader: the plugins whose things it meets, each its place in `mods.things`, and what it was handed.
type Reader = { from: number[]; shader: Shader }
// A program compiled for a reader: its GLSL, the function of each of its outputs, the uniforms it reads.
export type { Programmed }

export function gpgpu3d() {
  let made: {
    three: any; reach: number; meets: Record<string, string[]>; names: string[]
    table: Table; owns: Record<string, Uniforms>; shared: Uniforms; sent: Float32Array
    // each plugin's things as last filled, and every reader
    lists: Thing[][]; readers: Map<string, Reader>
    // the moment the frame last filled draws and the one before it, and where each moving thing's point
    // was at each
    clock: number; before: number; was: Map<string, number[]>; now: Map<string, number[]>
    // the ops this scene's mods deliver, the uniforms programs read, and the programs compiled
    ops: OpTable; time: Uniforms; programs: Map<string, Programmed>
    // the scene of one mesh every keeping shader is drawn with, made with the first room
    quad: { scene: any; camera: any; mesh: any } | undefined
  } | undefined

  const build = (plugins: Plugins) => {
    if (made) return made
    const world = plugins.wire.scene.world!
    const { reach, meets } = check(world)
    const table = tableOf(world)
    const owns = Object.fromEntries(table.words.map(w => [w, table.behaviors[w].uniforms?.() ?? {}]))
    const shared: Uniforms = Object.assign({ gpThings: { value: null } }, ...Object.values(owns))
    const names = handing(world)
    made = {
      three: plugins.render3d.THREE, reach, meets, names, table, owns, shared, sent: new Float32Array(0), lists: names.map(() => []), readers: new Map(), clock: NaN, before: NaN, was: new Map(), now: new Map(),
      ops: opsOf(world), time: { gpTime: { value: 0 } }, programs: new Map(), quad: undefined,
    }
    return made
  }

  // The texture holding `data`, WIDE texels across, made twice as tall when it no longer holds it.
  const write = (m: NonNullable<typeof made>, data: Float32Array) => {
    const three = m.three, u = m.shared.gpThings
    const rows = Math.ceil(data.length / 4 / WIDE)
    if (!u.value || u.value.image.height < rows) {
      const tall = Math.max(rows, u.value ? u.value.image.height * 2 : 1)
      u.value?.dispose()
      u.value = new three.DataTexture(new Float32Array(WIDE * tall * 4), WIDE, tall, three.RGBAFormat, three.FloatType)
    }
    u.value.image.data.fill(0)
    u.value.image.data.set(data)
    u.value.needsUpdate = true
    m.sent = data
  }

  // A reader's spans, [start, count] for each plugin it meets, from the lists as last filled.
  const span = (m: NonNullable<typeof made>, r: Reader) => {
    const starts: number[] = []
    let at = 0
    for (const l of m.lists) { starts.push(at); at += l.length }
    const u = r.shader.uniforms
    r.from.forEach((p, k) => { u.gpSpan.value[2 * k] = starts[p]; u.gpSpan.value[2 * k + 1] = m.lists[p].length })
    u.gpCount.value = r.from.reduce((n, p) => n + m.lists[p].length, 0)
  }

  const me = {
    shader(plugins: Plugins, who: string): Shader {
      const m = build(plugins)
      let r = m.readers.get(who)
      if (!r) {
        const from = (m.meets[who] ?? m.names).map(n => m.names.indexOf(n))
        const reader: Reader = {
          from,
          shader: {
            glsl: glslOf(m.table, from.length),
            uniforms: { ...m.shared, gpSpan: { value: new Array(2 * Math.max(1, from.length)).fill(0) }, gpCount: { value: 0 } },
            words: m.table.words,
            things: () => from.flatMap(p => m.lists[p]),
          },
        }
        m.readers.set(who, r = reader)
        span(m, r)
      }
      return r.shader
    },
    program(plugins: Plugins, name: string, program: Program, allowed?: Record<string, Kind>, what = `gpgpu3d program ${name}`, part?: Part): Programmed {
      const m = build(plugins)
      const key = `${name}\n${what}\n${JSON.stringify([program, allowed, part])}`
      let done = m.programs.get(key)
      if (!done) {
        const c = compile(m.ops, program, name, what, allowed, part)
        done = { glsl: c.glsl, outs: c.outs, kinds: c.kinds, at: c.at, moves: c.moves, kept: c.kept, uniforms: Object.fromEntries(c.uses.map(u => [u, m.time[u]])) }
        m.programs.set(key, done)
      }
      return done
    },
    keeper(plugins: Plugins, spec: Spec): Kept {
      const m = build(plugins), three = m.three, P = spec.prefix
      const allowed: Record<string, Kind> = Object.fromEntries(Object.entries(spec.outs).map(([name, o]) => [name, o.kind]))
      const p = plan(spec, spec.program && (part => me.program(plugins, spec.name, spec.program!, allowed, `${spec.what} program`, part)))
      const room = (r: Roomed): Room => {
        const slots = r.cols * r.rows
        const across = Math.ceil(Math.sqrt(r.count)), down = Math.ceil(r.count / across)
        const width = r.cols * across, height = r.rows * down
        const grid: Uniforms = { [`${P}ValPatch`]: { value: new three.Vector2(across, down) }, [`${P}ValGrid`]: { value: new three.Vector2(r.cols, r.rows) } }
        const uniforms: Uniforms = { ...r.uniforms, ...p.uniforms, ...grid, [`${P}ValCount`]: { value: r.count } }
        // a target for each draw of the keeping shader, a texture of it for each texture of the layout
        const targets = p.passes.map(pass => {
          const target = new three.WebGLRenderTarget(width, height, { count: pass.textures.length, type: three.FloatType, format: three.RGBAFormat, depthBuffer: false, minFilter: three.NearestFilter, magFilter: three.NearestFilter, generateMipmaps: false })
          pass.textures.forEach((t, n) => { if (p.layout.textures[t].half) target.textures[n].type = three.HalfFloatType })
          return target
        })
        const materials = p.passes.map(pass => new three.RawShaderMaterial({ glslVersion: three.GLSL3, vertexShader: p.vertex, fragmentShader: pass.fragment, uniforms, depthTest: false, depthWrite: false, blending: three.NoBlending }))
        const squares = new three.InstancedBufferGeometry()
        squares.setAttribute('position', new three.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3))
        squares.setIndex([0, 1, 2, 0, 2, 3])
        const slotAt = new three.InstancedBufferAttribute(new Float32Array(4 * slots), 4)
        slotAt.setUsage(three.DynamicDrawUsage)
        squares.setAttribute(`${P}ValSlot`, slotAt)
        squares.instanceCount = 0
        // each slot: the tag it holds, whether it holds one, whether that is no longer right, whether it waits
        // to be written
        const tags = new Float64Array(2 * slots), has = new Uint8Array(slots), dirty = new Uint8Array(slots), waits = new Uint8Array(slots)
        let waiting = 0, drew = 0
        return {
          reading(groups) {
            const read = p.reading(groups)
            const samplers = Object.fromEntries(read.textures.map(t => [`${P}ValT${t}`, { value: targets[t >> 2].textures[t & 3] }]))
            return { glsl: read.glsl, uniforms: { ...read.uniforms, ...grid, ...samplers } }
          },
          want(col, row, a, b) {
            const s = row * r.cols + col
            if (has[s] && tags[2 * s] === a && tags[2 * s + 1] === b && !dirty[s]) return
            has[s] = 1; tags[2 * s] = a; tags[2 * s + 1] = b; dirty[s] = 0
            if (!waits[s]) { waits[s] = 1; waiting++ }
          },
          stale(col, row) { dirty[row * r.cols + col] = 1 },
          staleAll() { dirty.fill(1) },
          keep(renderer) {
            if (!waiting) return 0
            if (!targets.length) { waits.fill(0); waiting = 0; return 0 }
            const most = renderer.capabilities.maxTextureSize
            if (width > most || height > most) throw new Error(`${r.what} is kept in a texture ${width} by ${height}, more than this GPU's ${most}: ${r.hint}`)
            const at = slotAt.array as Float32Array
            let n = 0
            for (let s = 0; s < slots; s++) {
              if (!waits[s]) continue
              waits[s] = 0
              at[4 * n] = s % r.cols; at[4 * n + 1] = Math.floor(s / r.cols); at[4 * n + 2] = tags[2 * s]; at[4 * n + 3] = tags[2 * s + 1]
              n++
            }
            waiting = 0
            slotAt.clearUpdateRanges()
            slotAt.addUpdateRange(0, 4 * n)
            slotAt.needsUpdate = true
            squares.instanceCount = n
            drew += n
            if (!m.quad) {
              const mesh = new three.Mesh()
              mesh.frustumCulled = false
              m.quad = { scene: new three.Scene(), camera: new three.OrthographicCamera(-1, 1, 1, -1, 0, 1), mesh }
              m.quad.scene.add(mesh)
            }
            const was = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, xr: renderer.xr.enabled, shadows: renderer.shadowMap.autoUpdate }
            renderer.autoClear = false
            renderer.xr.enabled = false
            renderer.shadowMap.autoUpdate = false
            m.quad.mesh.geometry = squares
            materials.forEach((material, k) => {
              m.quad!.mesh.material = material
              renderer.setRenderTarget(targets[k])
              renderer.render(m.quad!.scene, m.quad!.camera)
            })
            renderer.setRenderTarget(was.target)
            renderer.autoClear = was.autoClear
            renderer.xr.enabled = was.xr
            renderer.shadowMap.autoUpdate = was.shadows
            return n
          },
          held: () => has.reduce((n, h) => n + h, 0),
          drew: () => drew,
          textures: () => targets.flatMap(t => t.textures.map((x: { type: unknown }) => ({ width: t.width, height: t.height, half: x.type === three.HalfFloatType }))),
          dispose() {
            for (const t of targets) t.dispose()
            for (const material of materials) material.dispose()
            squares.dispose()
          },
        }
      }
      return { layout: p.layout, room }
    },
    fill(plugins: Plugins) {
      const m = build(plugins)
      const near = { at: plugins.render3d.camera!.position.toArray(), reach: m.reach }
      m.lists = modsOf<Things>(plugins.wire.scene.world!, 'gpgpu3d', 'things').map(f => f(plugins, near))
      // a new frame: what was now is what was; a second fill of one frame measures from the same frame before
      const { wire } = plugins
      const clock = (wire.n - 1 + (wire.between ?? 1)) * (wire.scene.prefabs.engine?.dt ?? 0)
      if (clock !== m.clock) {
        m.before = m.clock
        m.clock = clock
        m.was = m.now
        m.now = new Map()
      }
      m.time.gpTime.value = m.clock
      const elapsed = m.clock - m.before
      const speed = (key: string, at: number[]) => {
        const was = m.was.get(key)
        m.now.set(key, at)
        return was && elapsed > 0 ? at.map((v, i) => (v - was[i]) / elapsed) : [0, 0, 0]
      }
      const data = pack(m.table, m.lists.flat(), m.owns, m.three, speed)
      if (data.length !== m.sent.length || data.some((v, i) => v !== m.sent[i])) write(m, data)
      for (const r of m.readers.values()) span(m, r)
    },
    afterTick(plugins: Plugins) { me.fill(plugins) },
    close() {
      if (!made) return
      for (const u of Object.values(made.shared)) u.value?.dispose?.()
      made = undefined
    },
  }
  return me
}
