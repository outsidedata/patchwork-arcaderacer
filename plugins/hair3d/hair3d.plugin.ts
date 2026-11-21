// The browser half of hair3d: every hair of the hairs file (`hair3d.sim.ts`) grown on the wearers that
// wear it, each lock simulated on the GPU and each strand made there every frame (`hair3d.glsl.ts`).
// Nothing of it is on a row and nothing of it goes up the wire: every page grows its own.
//
// Listing. hair3d arms its pass in its `afterTick` and render3d draws in its own, so hair3d is listed
// before render3d; the loader, whose catalogue holds its hairs file, and the plugins its `skins`,
// `behaviors` and `wind` mods name are listed too. Each is checked on every frame, and each throws
// naming the plugin out of place.
//
// The hairs file. `world.hair3d.hairs` names it in the loader's catalogue; nothing is grown until it has
// landed, and it is checked (`check`) whenever it changes, a file written while the game runs too.
//
// The wearers. Each frame every `skins` mod is asked for its wearers, and each skin a wearer is handed
// with is made by the behavior of its word (`world.hair3d.mods.behaviors`); a word nothing delivers
// throws. A wearer of a kind the hairs file's `kinds` lists gets a body: for each hair the kind wears, a
// patch on each of the wearer's skins whose name the hair's `on.meshes` matches; a hair that matches
// none throws, naming the skins. A
// body goes when its wearer does, when its skins are others, and when what its hairs are built from
// (`builtFrom`) changes; every other number of a hair is read as it draws, so a panel
// changes it with nothing built.
//
// A patch. Its locks are rooted once for each skin's `key` and hair (`rootsOf`), on the skin as it was
// bound, in metres, and shared by every patch of that key: four float textures, a lock a texel. Each
// patch has three state textures of its own (`layout`), turned through as now, before and next, with room
// for every copy of its skin: as many as the skin's `pose()` says, and when that is more than the room
// there is, textures of twice the room are made and every lock laid again. It has a pass material and a
// mesh of one instanced draw of every strand of every lock of every copy. The mesh is never culled (its
// strands are wherever its wearers are), casts shadows when the hair's `shadow` says so, takes them, and
// is marked moving (`userData.moving`), so lights3d draws its shadow every frame. What its locks
// are kept out of is the `solids` mod's, whose GLSL its pass is made with.
//
// The pass. render3d draws every object between where the last two steps left it, the bones too, so the
// locks are moved the moment the scene is first drawn in a frame, from three's own `onBeforeRender` of
// the scene, when every bone stands where it is drawn: each patch's skin asked for its pose, and its
// state drawn a frame on, on this page's clock, a frame never longer than a thirtieth of a second. A
// lock never moved, and one whose root is more than JUMP metres from where it was the frame before, is
// laid where it lies with nothing on it. A page with no canvas draws nothing, and its locks stay unmoved.
//
// The wind. The `wind` mod's wind and drift, or with none named the hairs file's `wind` and its drift over
// this page's clock.
//
// Kept. What a lock is that is the same every frame (its comb, stiffness, width, curl, colour: every number of
// the hair, its own rolls and what the hair's `program` says where it is rooted), and what a strand is (its
// own rolls), is worked out once and kept by the `keeper` mod's keeper (gpgpu3d's,
// `plugins/gpgpu3d/gpgpu3d.keeper.ts`), which hair3d hands the values (`hair3d.glsl.ts`, `lockSpec`,
// `strandSpec`): a room of the locks and a room of the strands for each hair on each skin's geometry, shared
// as its roots are. They are written the first time the scene is drawn, before the locks are moved, and the
// locks' again when a number of the hair changes; the pass and the strands read each value through the
// keeper's reading. With no program nothing but the rolls is kept, and a number of the hair is read as it is
// drawn. A hair's program is compiled with it: what it gives that stands still is kept with the lock, and
// what reads the clock is worked out each frame.
//
// It hands out `bodies()` (`[{ id, kind, patches: [{ hair, skin, locks, strands, copies, room, wide, high,
// kept }] }]`, `strands` the strands drawn, `copies` the copies of the skin they are drawn on, `room` the
// copies the state has room for, and `kept` `{ locks, strands }`, how many times each has been written),
// `roots(id, hair)` (the `Roots` of that wearer's first patch of that
// hair, or undefined), `state(id, hair)` (the target that patch's locks stand in now, read with the
// renderer's `readRenderTargetPixels`, or undefined) and `close()`, which takes everything off the scene
// and disposes it.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { listed, mod, modsOf, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Room } from '#plugins/gpgpu3d/gpgpu3d.keeper.ts'
import { TIE_TEXELS, builtFrom, check, layout, rootsOf, seedOf, tieRows, type Behavior, type Behaviors, type Frame, type Hair, type Hair3d, type Keeper, type Looks, type Numbers, type Roots, type Skinned, type Skins, type Solids, type Thing, type WindMod } from './hair3d.sim.ts'
import { NOTHING, lockSpec, moving, shadowed, strandSpec, surface } from './hair3d.glsl.ts'

// A wearer with each of its skins made by its word's behavior.
type Wearer = { id: string; kind: string; skins: Skinned[] }

// Metres a lock's root moves in one frame past which it is laid again, not swung.
const JUMP = 1
// The longest frame the locks are moved by, seconds.
const LONGEST = 1 / 30

type Three = typeof import('three')
type Uniforms = Record<string, THREE.IUniform>
// The locks of a hair on a skin's geometry: where they are rooted, the uniforms every shader of the hair
// reads (`sheet`: the roots and the hairs file's numbers of the hair), the keeper's rooms of what each lock
// and each strand is, and the hair as it was when they were last kept.
// `textures` are the roots' four and the tie each lock is gathered to; `ties` is the texture of the hair's ties,
// a row a tie, and `frames` the skin's bones' frames it is written from.
type Rooted = { from: string; roots: Roots; textures: THREE.DataTexture[]; ties: THREE.DataTexture; frames: Frame[]; used: number; sheet: Uniforms; locks: Room; strands: Room; text: string }

// A hash of a text: a shader's place in the cache's key, since three reuses a program whose key it has seen.
function textHash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
  return h
}
type Patch = {
  hair: string; links: number; index: number; skin: Skinned; rooted: Rooted
  room: number; copies: number; lay: ReturnType<typeof layout>
  targets: THREE.WebGLRenderTarget[]; turn: number
  pass: THREE.ShaderMaterial
  draw: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.Material>
  depth: THREE.MeshDepthMaterial; distance: THREE.MeshDistanceMaterial
  own: Uniforms
}
type Body = { kind: string; from: string; patches: Patch[] }

// The geometry of a strand of `s` segments (`hair3d.glsl.ts`).
function strandOf(three: Three, s: number): THREE.BufferGeometry {
  const position: number[] = [], normal: number[] = [], index: number[] = []
  for (let k = 0; k < s; k++) position.push(-1, k / s, 0, 1, k / s, 0)
  position.push(0, 1, 0)
  for (let v = 0; v < 2 * s + 1; v++) normal.push(0, 0, 1)
  for (let k = 0; k < s - 1; k++) index.push(2 * k, 2 * k + 1, 2 * k + 3, 2 * k, 2 * k + 3, 2 * k + 2)
  index.push(2 * (s - 1), 2 * (s - 1) + 1, 2 * s)
  const g = new three.BufferGeometry()
  g.setAttribute('position', new three.Float32BufferAttribute(position, 3))
  g.setAttribute('normal', new three.Float32BufferAttribute(normal, 3))
  g.setIndex(index)
  return g
}

export function hair3d() {
  let checked: string | undefined
  let three: Three | undefined
  let scene: THREE.Scene | undefined
  const bodies = new Map<string, Body>()
  const rooted = new Map<string, Rooted>()
  const strands = new Map<number, THREE.BufferGeometry>()
  let clock = -1
  let last = -1
  let dtWas = LONGEST
  let drift: [number, number] = [0, 0]
  let due = false
  let closed = false
  let armed: THREE.Scene['onBeforeRender'] | undefined
  let under: THREE.Scene['onBeforeRender'] | undefined
  let quad: { scene: THREE.Scene; camera: THREE.OrthographicCamera; mesh: THREE.Mesh } | undefined
  // What every patch's pass reads of the frame.
  let frame: Uniforms | undefined
  // What every lock is kept out of, the `solids` mod's, asked once.
  let meets: ReturnType<Solids> | undefined
  // What keeps each lock and each strand, the `keeper` mod's, asked once.
  let keeper: ReturnType<Keeper> | undefined
  let asked = false

  // The hairs file's numbers of a hair, into the uniforms its shaders read.
  function sheetOf(u: Uniforms, h: Hair) {
    ;(u.hComb.value as THREE.Vector3).fromArray(h.comb)
    ;(u.hStiff.value as THREE.Vector2).fromArray(h.stiffness)
    u.hGravity.value = h.gravity
    u.hDamping.value = h.damping
    u.hDrag.value = h.drag
    ;(u.hWidth.value as THREE.Vector2).fromArray(h.width)
    u.hTaper.value = h.taper
    ;(u.hClump.value as THREE.Vector2).set(h.clump.radius, h.clump.tight)
    ;(u.hCurl.value as THREE.Vector2).set(h.curl.radius, h.curl.turns)
    u.hRagged.value = h.ragged
    ;(u.hRootColour.value as THREE.Color).set(h.colours.root)
    ;(u.hTipColour.value as THREE.Color).set(h.colours.tip)
    u.hVary.value = h.vary
    u.hAo.value = h.ao
    ;(u.hShine.value as THREE.Vector2).set(h.shine.strength, h.shine.power)
    u.hTranslucency.value = h.translucency
  }

  // The locks of a hair on a skin's geometry, rooted once and shared.
  function root(T: Three, name: string, hair: Hair, skin: Skinned): Rooted {
    const key = `${skin.key}|${name}`, from = builtFrom(hair)
    const held = rooted.get(key)
    if (held && held.from === from) { held.used++; return held }
    const roots = rootsOf(hair, name, skin.skin())
    const { wide, high } = layout(roots.count, hair.links, 1)
    const rows = high / (hair.links + 1)
    const textures = [roots.at, roots.normal, roots.bones, roots.weights, roots.tie].map(values => {
      const data = new Float32Array(wide * rows * 4)
      data.set(values)
      const tex = new T.DataTexture(data, wide, rows, T.RGBAFormat, T.FloatType)
      tex.magFilter = T.NearestFilter
      tex.minFilter = T.NearestFilter
      tex.generateMipmaps = false
      tex.needsUpdate = true
      return tex
    })
    const frames = skin.frames()
    const tied = tieRows(hair, frames, name)
    const ties = new T.DataTexture(tied, TIE_TEXELS, tied.length / (TIE_TEXELS * 4), T.RGBAFormat, T.FloatType)
    ties.magFilter = T.NearestFilter
    ties.minFilter = T.NearestFilter
    ties.generateMipmaps = false
    ties.needsUpdate = true
    const sheet: Uniforms = {
      hTies: { value: ties },
      hAt: { value: textures[0] }, hWide: { value: wide }, hSeed: { value: seedOf(name) }, hStrands: { value: hair.strands },
      hComb: { value: new T.Vector3() }, hStiff: { value: new T.Vector2() },
      hGravity: { value: 0 }, hDamping: { value: 0 }, hDrag: { value: 0 },
      hWidth: { value: new T.Vector2() }, hTaper: { value: 0 },
      hClump: { value: new T.Vector2() }, hCurl: { value: new T.Vector2() }, hRagged: { value: 0 },
      hRootColour: { value: new T.Color() }, hTipColour: { value: new T.Color() },
      hVary: { value: 0 }, hAo: { value: 0 }, hShine: { value: new T.Vector2() }, hTranslucency: { value: 0 },
    }
    sheetOf(sheet, hair)
    // What is kept of each lock, the hair's program compiled with it, and of each strand: a room of one slot
    // for each.
    const what = `hair3d hair ${name}`
    const locks = keeper!(lockSpec(what, hair.program)).room({ cols: 1, rows: 1, count: roots.count, uniforms: sheet, what: `${what}: its ${roots.count} locks`, hint: 'lower its density' })
    const strandsOf = keeper!(strandSpec(what)).room({ cols: 1, rows: 1, count: roots.count * hair.strands, uniforms: sheet, what: `${what}: its ${roots.count * hair.strands} strands`, hint: 'lower its density or its strands' })
    const made: Rooted = { from, roots, textures, ties, frames, used: 1, sheet, locks, strands: strandsOf, text: JSON.stringify(hair) }
    rooted.set(key, made)
    return made
  }

  // A patch's state textures with room for `room` copies, every lock unmoved.
  function room(T: Three, p: Patch, room: number) {
    for (const t of p.targets) t.dispose()
    p.room = room
    p.lay = layout(p.rooted.roots.count, p.links, room)
    p.targets = [0, 1, 2].map(() => new T.WebGLRenderTarget(p.lay.width, p.lay.height, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: false, generateMipmaps: false }))
    p.turn = 0
    const u = p.pass.uniforms, o = p.own
    u.hCols.value = o.hCols.value = p.lay.cols
    u.hHigh.value = o.hHigh.value = p.lay.high
    o.hState.value = p.targets[0].texture
  }

  function patch(T: Three, plugins: Plugins, name: string, hair: Hair, index: number, skin: Skinned): Patch {
    const r = root(T, name, hair, skin)
    // What each shader reads of what is kept: the pass what moves a lock, the strands what shapes them and
    // their look, the shadows' what shapes them alone.
    const moved = r.locks.reading(['move'])
    const drawn = { locks: r.locks.reading(['shape', 'look']), strands: r.strands.reading(['shape', 'look']) }
    const cast = { locks: r.locks.reading(['shape']), strands: r.strands.reading(['shape']) }
    const pass = new T.ShaderMaterial({
      glslVersion: T.GLSL3,
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: moving(hair.links, meets?.glsl ?? NOTHING, moved.glsl, !!hair.ties?.length),
      uniforms: {
        ...meets?.uniforms,
        ...frame!,
        ...r.sheet,
        ...moved.uniforms,
        hNormal: { value: r.textures[1] }, hBones: { value: r.textures[2] }, hWeights: { value: r.textures[3] }, hTied: { value: r.textures[4] },
        hNow: { value: null }, hWas: { value: null }, boneTexture: { value: null },
        hBind: { value: new T.Matrix4() }, hUnit: { value: 1 / skin.unit },
        hFirst: { value: -1 }, hCopies: { value: 0 }, hCols: { value: 1 }, hHigh: { value: 1 }, hJump: { value: JUMP },
      },
      depthTest: false,
      depthWrite: false,
    })
    const own: Uniforms = {
      ...r.sheet, ...drawn.locks.uniforms, ...drawn.strands.uniforms,
      hState: { value: null }, hHigh: { value: 1 }, hCols: { value: 1 }, hLocks: { value: r.roots.count }, hThin: { value: 0 },
    }
    const drawing = surface(hair.links, drawn.locks.glsl, drawn.strands.glsl)
    // In a look, the looks mod's material of it shapes each strand and the look colours it; else hair3d's own.
    const looks = hair.look === undefined ? undefined : mod<Looks>(plugins.wire.scene.world!, 'hair3d', 'looks')!(plugins)
    const material = looks
      ? looks.material(hair.look!, { uniforms: own, vertex: drawing.vertex })!
      : plugins.render3d.dress(new T.MeshStandardMaterial({ color: 0xffffff, roughness: hair.roughness, metalness: 0, side: T.DoubleSide }), { surface: { uniforms: own, ...drawing } }) as THREE.MeshStandardMaterial
    material.side = T.DoubleSide
    const shadowsOf = <M extends THREE.Material>(m: M, what: string): M => {
      const s = shadowed(hair.links, cast.locks.glsl, cast.strands.glsl)
      m.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, own)
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${s.common}`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>\n${s.begin_vertex}`)
      }
      m.customProgramCacheKey = () => `hair3d ${what} ${textHash(s.common)}`
      return m
    }
    const depth = shadowsOf(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, side: T.DoubleSide }), 'depth')
    const distance = shadowsOf(new T.MeshDistanceMaterial({ side: T.DoubleSide }), 'distance')
    const shape = strands.get(hair.segments) ?? (strands.set(hair.segments, strandOf(T, hair.segments)), strands.get(hair.segments)!)
    const geometry = new T.InstancedBufferGeometry()
    geometry.setIndex(shape.getIndex())
    geometry.setAttribute('position', shape.getAttribute('position'))
    geometry.setAttribute('normal', shape.getAttribute('normal'))
    geometry.instanceCount = 0
    if (looks) geometry.setAttribute('lookId', new T.Float32BufferAttribute(new Float32Array(shape.getAttribute('position').count).fill(looks.idOf(hair.look!)!), 1))
    const draw = new T.Mesh(geometry, material)
    draw.customDepthMaterial = depth
    draw.customDistanceMaterial = distance
    draw.receiveShadow = true
    draw.castShadow = hair.shadow
    draw.frustumCulled = false
    draw.matrixAutoUpdate = false
    draw.userData.moving = true
    draw.name = `hair3d ${name} ${skin.name}`
    scene!.add(draw)
    const p: Patch = { hair: name, links: hair.links, index, skin, rooted: r, room: 0, copies: 0, lay: layout(r.roots.count, hair.links, 1), targets: [], turn: 0, pass, draw, depth, distance, own }
    room(T, p, 1)
    return p
  }

  function make(T: Three, plugins: Plugins, s: Hair3d, w: Wearer, from: string): Body {
    const worn = s.kinds[w.kind]
    const patches: Patch[] = []
    for (const name of worn.hairs) {
      const hair = s.hairs[name]
      const on = new RegExp(hair.on.meshes)
      const matched = w.skins.map((skin, index) => ({ skin, index })).filter(x => on.test(x.skin.name))
      if (!matched.length) throw new Error(`hair3d hair ${name} grows on no skin of ${w.id}, of kind ${w.kind}: its on.meshes ${JSON.stringify(hair.on.meshes)} matches none of ${w.skins.map(k => JSON.stringify(k.name)).join(', ')}`)
      for (const { skin, index } of matched) patches.push(patch(T, plugins, name, hair, index, skin))
    }
    return { kind: w.kind, from, patches }
  }

  function drop(id: string) {
    const b = bodies.get(id)
    if (!b) return
    for (const p of b.patches) {
      p.draw.removeFromParent()
      p.draw.geometry.dispose()
      p.draw.material.dispose()
      p.depth.dispose()
      p.distance.dispose()
      p.pass.dispose()
      for (const t of p.targets) t.dispose()
      if (--p.rooted.used === 0) {
        for (const t of p.rooted.textures) t.dispose()
        p.rooted.ties.dispose()
        p.rooted.locks.dispose()
        p.rooted.strands.dispose()
        for (const [k, r] of rooted) if (r === p.rooted) rooted.delete(k)
      }
    }
    bodies.delete(id)
  }

  // Every patch's locks moved a frame on, the scene's bones where they are drawn.
  function move(renderer: THREE.WebGLRenderer) {
    const T = three!
    if (!quad) {
      const triangle = new T.BufferGeometry()
      triangle.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
      const mesh = new T.Mesh(triangle)
      mesh.frustumCulled = false
      const s = new T.Scene()
      s.add(mesh)
      quad = { scene: s, camera: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), mesh }
    }
    // what stands in the world, as it stands now that every object is where the frame draws it
    meets?.now()
    // what each lock and each strand is, kept: written once, and again only when the hair's numbers change
    for (const r of rooted.values()) {
      r.locks.want(0, 0, 0, 0)
      r.strands.want(0, 0, 0, 0)
      r.locks.keep(renderer)
      r.strands.keep(renderer)
    }
    const was = renderer.getRenderTarget(), auto = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    const most = renderer.capabilities.maxTextureSize
    for (const [id, b] of bodies) {
      for (const p of b.patches) {
        const pose = p.skin.pose(), u = p.pass.uniforms
        p.copies = pose.copies
        p.draw.geometry.instanceCount = p.rooted.roots.count * (p.own.hStrands.value as number) * pose.copies
        if (!pose.copies) continue
        if (pose.copies > p.room) {
          let next = p.room
          while (next < pose.copies) next *= 2
          room(T, p, next)
          if (p.lay.width > most || p.lay.height > most) throw new Error(`hair3d hair ${p.hair} on ${id}: ${pose.copies} copies of ${p.rooted.roots.count} locks need a texture ${p.lay.width} by ${p.lay.height}, more than this GPU's ${most}: lower its density or its links`)
        }
        u.boneTexture.value = pose.bones
        ;(u.hBind.value as THREE.Matrix4).copy(pose.bind)
        u.hFirst.value = pose.first
        u.hCopies.value = pose.copies
        u.hNow.value = p.targets[p.turn].texture
        u.hWas.value = p.targets[(p.turn + 2) % 3].texture
        p.turn = (p.turn + 1) % 3
        quad.mesh.material = p.pass
        renderer.setRenderTarget(p.targets[p.turn])
        renderer.render(quad.scene, quad.camera)
        p.own.hState.value = p.targets[p.turn].texture
      }
    }
    renderer.setRenderTarget(was)
    renderer.shadowMap.autoUpdate = auto
  }

  // The pass armed on the scene's `onBeforeRender`, over whatever is there now; left where it is while it
  // is still the scene's own.
  function arm(s: THREE.Scene) {
    if (armed && s.onBeforeRender === armed) return
    const before = s.onBeforeRender
    const hook: THREE.Scene['onBeforeRender'] = function (this: THREE.Scene, renderer, s3, camera, target, material, group) {
      before.call(this, renderer, s3, camera, target, material, group)
      if (closed || armed !== hook || !due) return
      due = false
      move(renderer as THREE.WebGLRenderer)
    }
    under = before
    armed = hook
    s.onBeforeRender = hook
  }

  const first = (id: string, hair: string) => bodies.get(id)?.patches.find(p => p.hair === hair)

  const me = {
    bodies: () => [...bodies].map(([id, b]) => ({
      id, kind: b.kind,
      patches: b.patches.map(p => ({ hair: p.hair, skin: p.skin.name, locks: p.rooted.roots.count, strands: p.draw.geometry.instanceCount, copies: p.copies, room: p.room, wide: p.lay.wide, high: p.lay.high, kept: { locks: p.rooted.locks.drew(), strands: p.rooted.strands.drew() } })),
    })),
    roots: (id: string, hair: string): Roots | undefined => first(id, hair)?.rooted.roots,
    state(id: string, hair: string): THREE.WebGLRenderTarget | undefined {
      const p = first(id, hair)
      return p && p.targets[p.turn]
    },

    afterTick(plugins: Plugins) {
      const wire = plugins.wire
      const n = wire.scene.world?.hair3d as Numbers | undefined
      if (!n) return
      if (!plugins.loader) throw new Error('hair3d reads its hairs file through the loader, and this scene does not list loader')
      if (typeof n.hairs !== 'string') throw new Error(`hair3d: world.hair3d.hairs ${JSON.stringify(n.hairs)} is not the name of the hairs file in the scene's loader catalogue`)
      const s = plugins.loader.get(n.hairs) as Hair3d | undefined
      if (!s) return
      const render3d = plugins.render3d
      if (!render3d) throw new Error('hair3d draws through render3d, and this scene does not list render3d')
      const order = listed(wire.scene)
      if (order.indexOf('hair3d') > order.indexOf('render3d')) throw new Error('hair3d is listed after render3d, which draws in its afterTick before hair3d has armed its pass')
      const world = wire.scene.world!
      if (!world.hair3d.mods?.skins) throw new Error('hair3d grows on skins, and the scene names no world.hair3d.mods.skins')
      if (!world.hair3d.mods?.keeper) throw new Error('hair3d keeps what each lock is once it is worked out, and the scene names no world.hair3d.mods.keeper')
      provided(wire.scene, 'hair3d', 'skins')
      provided(wire.scene, 'hair3d', 'behaviors')
      provided(wire.scene, 'hair3d', 'keeper')
      provided(wire.scene, 'hair3d', 'wind')
      provided(wire.scene, 'hair3d', 'solids')
      if (!asked) {
        asked = true
        meets = mod<Solids>(world, 'hair3d', 'solids')?.(plugins)
        keeper = mod<Keeper>(world, 'hair3d', 'keeper')!(plugins)
      }
      const text = JSON.stringify(s)
      if (text !== checked) { check(s); checked = text }
      const T = (three = render3d.THREE as Three)
      scene = render3d.scene as THREE.Scene
      closed = false
      frame ??= {
        hDt: { value: LONGEST }, hDtWas: { value: LONGEST }, hTime: { value: 0 },
        hWind: { value: new T.Vector2() }, hDrift: { value: new T.Vector2() }, hGust: { value: new T.Vector3() },
      }

      // The bodies: made, kept or gone.
      const seen = new Set<string>()
      const table: Record<string, Behavior> = Object.assign({}, ...modsOf<Behaviors>(world, 'hair3d', 'behaviors').map(b => b()))
      const skinOf = (thing: Thing, who: string): Skinned => {
        const words = Object.keys(thing)
        if (words.length !== 1) throw new Error(`hair3d: a skin of ${who} gives ${words.length} words (${words.join(', ')}), and a skin is one thing under one word`)
        const behavior = table[words[0]]
        if (!behavior) throw new Error(`hair3d has no behavior for a skin of ${who}, of the word ${words[0]}: no plugin world.hair3d.mods.behaviors names delivers it`)
        return behavior(plugins, thing[words[0]])
      }
      for (const handed of modsOf<Skins>(world, 'hair3d', 'skins').flatMap(f => f(plugins))) {
        const worn = s.kinds[handed.kind]
        if (!worn) continue
        const w: Wearer = { id: handed.id, kind: handed.kind, skins: handed.skins.map(thing => skinOf(thing, handed.id)) }
        if (seen.has(w.id)) throw new Error(`hair3d was handed the wearer ${w.id} twice by its skins mods`)
        seen.add(w.id)
        const from = JSON.stringify([w.kind, worn.hairs.map(h => [h, builtFrom(s.hairs[h])]), w.skins.map(k => [k.name, k.key])])
        const b = bodies.get(w.id)
        if (b && b.from === from) {
          for (const p of b.patches) p.skin = w.skins[p.index]
          continue
        }
        drop(w.id)
        // a hair drawn in a look waits for the looks to land
        const looked = worn.hairs.map(h => s.hairs[h].look).filter((l): l is string => l !== undefined)
        if (looked.length) {
          if (!world.hair3d.mods?.looks) throw new Error(`hair3d: a hair of ${w.kind} is drawn in the look ${looked[0]}, and the scene names no world.hair3d.mods.looks`)
          provided(wire.scene, 'hair3d', 'looks')
          const looks = mod<Looks>(world, 'hair3d', 'looks')!(plugins)
          if (looked.some(l => looks.idOf(l) === undefined)) continue
        }
        bodies.set(w.id, make(T, plugins, s, w, from))
      }
      for (const id of [...bodies.keys()]) if (!seen.has(id)) drop(id)

      // The page's clock, and the frame's seconds.
      const now = performance.now() / 1000
      if (clock < 0) clock = now
      const time = now - clock
      const dt = last < 0 ? LONGEST : Math.min(LONGEST, Math.max(1e-4, time - last))
      last = time
      const f = frame
      f.hDtWas.value = dtWas
      f.hDt.value = dt
      dtWas = dt
      f.hTime.value = time
      ;(f.hGust.value as THREE.Vector3).set(s.gust.scale, s.gust.strength, s.gust.rate)
      const blowing = mod<WindMod>(world, 'hair3d', 'wind')?.(plugins)
      if (blowing) {
        ;(f.hWind.value as THREE.Vector2).set(blowing.wind[0], blowing.wind[1])
        ;(f.hDrift.value as THREE.Vector2).set(blowing.drift[0], blowing.drift[1])
      } else {
        const a = (s.wind.toward * Math.PI) / 180
        const wx = s.wind.speed * Math.sin(a), wz = -s.wind.speed * Math.cos(a)
        drift = [drift[0] + wx * dt, drift[1] + wz * dt]
        ;(f.hWind.value as THREE.Vector2).set(wx, wz)
        ;(f.hDrift.value as THREE.Vector2).set(drift[0], drift[1])
      }

      // Every number of a hair that is read as it draws; and where the hair is not as it was when its locks
      // were last kept, what was kept of them is no longer right, and is kept again.
      for (const b of bodies.values()) {
        for (const p of b.patches) {
          const h = s.hairs[p.hair], r = p.rooted
          p.own.hThin.value = h.thin
          if (h.look === undefined) (p.draw.material as THREE.MeshStandardMaterial).roughness = h.roughness
          const now = JSON.stringify(h)
          if (now === r.text) continue
          r.text = now
          sheetOf(r.sheet, h)
          // its ties: the rows of the ties texture, which a tie's own numbers change
          r.ties.image.data!.set(tieRows(h, r.frames, p.hair))
          r.ties.needsUpdate = true
          r.locks.staleAll()
        }
      }

      due = bodies.size > 0
      if (due) arm(scene)
    },

    close() {
      for (const id of [...bodies.keys()]) drop(id)
      for (const g of strands.values()) g.dispose()
      strands.clear()
      if (quad) quad.mesh.geometry.dispose()
      quad = undefined
      if (scene && armed && scene.onBeforeRender === armed && under) scene.onBeforeRender = under
      closed = true
      armed = undefined
      under = undefined
      due = false
      checked = undefined
      frame = undefined
      meets = undefined
      keeper = undefined
      asked = false
      clock = -1
      last = -1
      dtWas = LONGEST
      drift = [0, 0]
    },
  }

  return me
}
