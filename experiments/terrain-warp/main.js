// The experiment's page: the test ground under the new material, a panel for every knob of the
// design, fly and orbit cameras, debug views, the GPU-vs-JS agreement check and the field JSON.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { BAKE, BAKE_STEP, buildGrid, SIZE } from './terrain.js'
import { BIOMES, biomeWeights, COMPOSE, LAYERS, packField, PER, weights } from './warp.js'
import { makeMaterial } from './shader.js'
import { checker, flat, toonGrass, toonRock } from './toon.js'

// ---------- state ----------

const SETS = ['meadow', 'rock', 'snow', 'gravel', 'dry-ground', 'cracked-mud', 'desert-rock', 'red-ground', 'toon-grass', 'toon-rock', 'checker']
const octave = (freq = 0, amp = 0, stretch = [1, 1, 1], rotate = 0) => ({ freq, amp, stretch, rotate })
// "no limit" is the slider's own end: height 0..1000 m brackets all of this ground (30..800 m), slope 0..1 is flat to wall
const H = [0, 1000], S = [0, 1]
const layer = (name, map, o) => ({ name, on: true, map, scale: 10, normalStrength: 1, tri: false, sharp: 4, height: [0, 0, 1000, 1000], slope: [0, 0, 1, 1], noise: { freq: 0, amp: 0 }, edge: 0.3, ...o })
const DEFAULTS = {
  res: '4k',
  compose: 'stack',
  hb: 2,
  hbDepth: 0.1,
  hbSrc: 'luminance',
  far: 0.7,
  farMul: 7.3,
  debug: 'shaded',
  fog: 0.00012,
  sunAz: 35,
  sunEl: 38,
  speed: 20,
  pixelRatio: 1,
  vt: true,
  vtNear: 150,
  vtFar: 300,
  vtCliff: 0.6,
  vtBand: 0.06,
  vtBudget: 1024,
  controls: 'fly',
  walk: false,
  biomes: [
    { name: 'alpine', on: true, cover: 0.5, noise: { freq: 0, amp: 0 }, edge: 0.2, warp: [octave(), octave(), octave()], land: { form: 'alpine', edge: 0.6 },
      layers: [
        layer('meadow', 'meadow', { scale: 24,
          warp: [octave(0.005, 30, [1, 1, 1], 0), octave(0.035, 3, [1, 1, 1], 0.7), octave(0.18, 0.5, [1, 1, 1], 1.9)] }),
        layer('gravel', 'gravel', { scale: 5, height: [0, 0, 45, 80], slope: [0, 0, 0.06, 0.14], noise: { freq: 0.08, amp: 0.9 }, edge: 0.35,
          warp: [octave(0.01, 12, [1, 1, 1], 0), octave(0.07, 2.5, [1, 1, 1], 1.1), octave(0.3, 0.3, [1, 1, 1], 2.3)] }),
        layer('rock', 'rock', { scale: 10, normalStrength: 1.2, tri: true, sharp: 12, slope: [0.3, 0.45, 1, 1], noise: { freq: 0.12, amp: 0.8 }, edge: 0.35,
          warp: [octave(0.006, 18, [1, 1, 1], 0), octave(0.04, 1.5, [1, 3, 1], 0.4), octave(0.2, 0.6, [1, 1, 1], 1.3)] }),
        layer('snow', 'snow', { scale: 12, tri: true, sharp: 12, height: [330, 400, 1000, 1000], slope: [0, 0, 0.4, 0.55], noise: { freq: 0.08, amp: 0.8 }, edge: 0.35,
          warp: [octave(0.006, 20, [1, 1, 1], 0), octave(0.05, 2.5, [1, 1, 1], 0.9), octave(0.25, 0.4, [1, 1, 1], 2.1)] }),
      ] },
    { name: 'desert', on: true, cover: 0.5, noise: { freq: 0.0011, amp: 0.7 }, edge: 0.12,
      warp: [octave(0.0012, 160, [1, 1, 1], 0), octave(0.008, 30, [1, 1, 1], 0.8), octave(0.04, 5, [1, 1, 1], 2.2)],
      // the desert's own landform: dunes across a wind from 20°, 180 m apart and 22 m high, on a 45 m floor lifted up to 60 m by a broad swell
      land: { form: 'dunes', edge: 0.6, wind: 20, wavelength: 180, height: 22, lee: 0.3, base: 45, swell: 60 },
      layers: [
        layer('dry ground', 'dry-ground', { scale: 14,
          warp: [octave(0.005, 30, [1, 1, 1], 0.3), octave(0.035, 3, [1, 1, 1], 1.4), octave(0.18, 0.5, [1, 1, 1], 2.6)] }),
        layer('cracked mud', 'cracked-mud', { scale: 9, height: [0, 0, 60, 110], slope: [0, 0, 0.05, 0.12], noise: { freq: 0.06, amp: 0.9 }, edge: 0.35,
          warp: [octave(0.01, 12, [1, 1, 1], 0.5), octave(0.07, 2.5, [1, 1, 1], 1.7), octave(0.3, 0.3, [1, 1, 1], 2.9)] }),
        layer('desert rock', 'desert-rock', { scale: 18, normalStrength: 1.2, tri: true, sharp: 12, slope: [0.3, 0.45, 1, 1], noise: { freq: 0.12, amp: 0.8 }, edge: 0.35,
          warp: [octave(0.006, 18, [1, 1, 1], 0.2), octave(0.04, 1.5, [1, 3, 1], 0.6), octave(0.2, 0.6, [1, 1, 1], 1.5)] }),
        layer('red ground', 'red-ground', { scale: 12, tri: true, sharp: 12, height: [300, 380, 1000, 1000], slope: [0, 0, 0.4, 0.55], noise: { freq: 0.08, amp: 0.8 }, edge: 0.35,
          warp: [octave(0.006, 20, [1, 1, 1], 0.4), octave(0.05, 2.5, [1, 1, 1], 1.2), octave(0.25, 0.4, [1, 1, 1], 2.4)] }),
      ] },
  ],
}
const KEY = 'terrain-warp-v11'
const clone = (v) => JSON.parse(JSON.stringify(v))
let saved = null
try { saved = JSON.parse(localStorage.getItem(KEY)) } catch { saved = null }
const fits = saved && saved.biomes?.length === BIOMES && saved.biomes.every(b => b.layers?.length === PER)
const state = fits ? { ...clone(DEFAULTS), ...saved } : clone(DEFAULTS)
const flatLayers = () => state.biomes.flatMap(b => b.layers)
for (const l of flatLayers()) {
  l.height = l.height.map(v => Math.min(H[1], Math.max(H[0], v)))
  l.slope = l.slope.map(v => Math.min(S[1], Math.max(S[0], v)))
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private window: nothing kept */ } }

// ---------- renderer, scene, ground ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(state.pixelRatio)
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.NoToneMapping
renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const gl = renderer.getContext()

const scene = new THREE.Scene()
const sky = new THREE.Color('#9cc3e6')
scene.background = sky
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 20000)

const material = makeMaterial()
const U = material.uniforms
const ground = new THREE.Mesh(new THREE.BufferGeometry(), material)
ground.frustumCulled = false
scene.add(ground)
// The ground's shape follows the biomes (each has its own landform), so it is built again whenever a
// biome's border or land changes: the mesh, the 2 m normal bake the shader reads, and `grid.sample`.
let grid = null
function buildGround() {
  grid = buildGrid(state.biomes)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(grid.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(grid.normals, 3))
  geometry.setIndex(new THREE.BufferAttribute(grid.index, 1))
  ground.geometry.dispose()
  ground.geometry = geometry
  U.uBake.value?.dispose()
  const bakeTex = new THREE.DataTexture(grid.bake, grid.bakeSize, grid.bakeSize, THREE.RGBAFormat, THREE.FloatType)
  bakeTex.minFilter = bakeTex.magFilter = THREE.NearestFilter
  bakeTex.generateMipmaps = false
  bakeTex.needsUpdate = true
  U.uBake.value = bakeTex
}
let groundTimer = 0
const reshape = () => { clearTimeout(groundTimer); groundTimer = setTimeout(() => { buildGround(); sync() }, 250) }
buildGround()
U.uBakeN.value = BAKE
U.uBakeStep.value = BAKE_STEP
U.uHalf.value = SIZE / 2

const hud = document.getElementById('hud')
let msg = ''
function status(s) { msg = s }

// ---------- texture arrays: every layer of every biome ----------

// A texture array the renderer draws into, layer by layer, with a full mip chain and wrapped
// addressing. Its mips are made by `mips`, once after each change, not by three after every draw.
const maxAniso = renderer.capabilities.getMaxAnisotropy()
function arrayTarget(size, depth, type, srgb, depthBuffer) {
  const rt = new THREE.WebGLArrayRenderTarget(size, size, depth, { type, depthBuffer, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter })
  const t = rt.texture
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = maxAniso
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  renderer.initRenderTarget(rt)
  t.generateMipmaps = false
  return rt
}
function mips(rt) {
  renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, renderer.properties.get(rt.texture).__webglTexture)
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY)
  renderer.state.unbindTexture()
}

// The copy pass: a source map drawn over the whole of one array layer at the array's size, its mips
// choosing the footprint. Mode 0 copies a colour; mode 1 packs a normal's x and y with a roughness.
const copyMat = new THREE.ShaderMaterial({
  uniforms: { uA: { value: null }, uB: { value: null }, uMode: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D uA; uniform sampler2D uB; uniform float uMode; varying vec2 vUv;
void main() { gl_FragColor = uMode < 0.5 ? vec4(texture2D(uA, vUv).rgb, 1.0) : vec4(texture2D(uA, vUv).rg, texture2D(uB, vUv).r, 1.0); }`,
  depthTest: false,
  depthWrite: false,
})
const copyScene = new THREE.Scene()
const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat)
copyQuad.frustumCulled = false
copyScene.add(copyQuad)
const copyCam = new THREE.Camera()

// The maps of a set as textures: the 4K files for a photo set, canvases for the drawn ones.
const loader = new THREE.TextureLoader()
const canvasTex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t }
const urlTex = (url, srgb) => new Promise((ok, no) => loader.load(url, (t) => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; ok(t) }, undefined, () => no(new Error(`failed to load ${url}`))))
const DRAWN = { 'toon-grass': () => toonGrass(), 'toon-rock': () => toonRock(), checker: () => checker() }
async function sources(set) {
  if (DRAWN[set]) return { color: canvasTex(DRAWN[set](), true), normal: canvasTex(flat('#8080ff'), false), rough: canvasTex(flat('#808080'), false) }
  const [color, normal, rough] = await Promise.all([urlTex(`./4k/${set}-color.jpg`, true), urlTex(`./4k/${set}-normal.jpg`, false), urlTex(`./4k/${set}-rough.jpg`, false)])
  return { color, normal, rough }
}

const ARR = { '1k': 1024, '2k': 2048, '4k': 4096 }
let arr = null
let fills = Promise.resolve()
function makeArrays(res) {
  if (arr) { arr.col.dispose(); arr.nr.dispose() }
  arr = { res, col: arrayTarget(res, LAYERS, THREE.UnsignedByteType, true, false), nr: arrayTarget(res, LAYERS, THREE.UnsignedByteType, false, false), filled: new Array(LAYERS).fill(null), loading: new Array(LAYERS).fill(null) }
  U.uCol.value = arr.col.texture
  U.uNR.value = arr.nr.texture
  U.uRes.value = res
}
// Layer k of both arrays is drawn from set's maps. One set is loaded at a time, so at most three 4K
// images are decoded at once.
function fill(k, set) {
  const a = arr
  a.loading[k] = set
  fills = fills.then(async () => {
    if (arr !== a || a.loading[k] !== set) return
    let src
    try { src = await sources(set) } catch (e) { status(e.message); a.loading[k] = null; return }
    if (arr === a && a.loading[k] === set) {
      copyMat.uniforms.uMode.value = 0
      copyMat.uniforms.uA.value = src.color
      renderer.setRenderTarget(a.col, k)
      renderer.render(copyScene, copyCam)
      copyMat.uniforms.uMode.value = 1
      copyMat.uniforms.uA.value = src.normal
      copyMat.uniforms.uB.value = src.rough
      renderer.setRenderTarget(a.nr, k)
      renderer.render(copyScene, copyCam)
      renderer.setRenderTarget(null)
      mips(a.col)
      mips(a.nr)
      a.filled[k] = set
      a.loading[k] = null
      rebake()
      const n = a.filled.filter(Boolean).length
      status(n < LAYERS ? `maps ${n}/${LAYERS}` : '')
    }
    copyMat.uniforms.uA.value = copyMat.uniforms.uB.value = null
    for (const t of Object.values(src)) t.dispose()
  })
}

// ---------- uniforms from state ----------

const sunDir = new THREE.Vector3()
function sync() {
  if (!arr || arr.res !== ARR[state.res]) makeArrays(ARR[state.res])
  const pack = packField(state.biomes)
  const layers = flatLayers()
  for (let k = 0; k < LAYERS; k++) {
    const L = layers[k]
    U.uHeight.value[k].fromArray(pack.height[k])
    U.uSlope.value[k].fromArray(pack.slope[k])
    U.uScale.value[k] = L.scale
    U.uTri.value[k] = L.tri ? 1 : 0
    U.uSharp.value[k] = L.sharp
    U.uNorStr.value[k] = L.normalStrength
    if (arr.filled[k] !== L.map && arr.loading[k] !== L.map) fill(k, L.map)
  }
  pack.noise.forEach((v, i) => U.uNoise.value[i].fromArray(v))
  pack.oct.forEach((v, i) => U.uOct.value[i].fromArray(v))
  pack.str.forEach((v, i) => U.uStr.value[i].fromArray(v))
  pack.cover.forEach((v, j) => { U.uCover.value[j] = v })
  U.uCompose.value = COMPOSE[state.compose]
  U.uHB.value = state.hb
  U.uHBDepth.value = state.hbDepth
  U.uHBSrc.value = state.hbSrc === 'luminance' ? 0 : 1
  U.uFar.value = state.far
  U.uFarMul.value = state.farMul
  U.uDebug.value = DEBUG[state.debug]
  U.uFog.value = state.fog
  U.uSky.value.copy(sky)
  const az = THREE.MathUtils.degToRad(state.sunAz), el = THREE.MathUtils.degToRad(state.sunEl)
  sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
  U.uSunDir.value.copy(sunDir)
  U.uSunCol.value.setRGB(1.0, 0.96, 0.9).multiplyScalar(2.2)
  U.uAmb.value.setRGB(0.42, 0.52, 0.66)
  U.uVTNear.value = state.vtNear
  U.uVTFar.value = Math.max(state.vtFar, state.vtNear + 1)
  U.uVTCliff.value = state.vtCliff
  U.uRingBand.value = state.vtBand
  // every setting can change the albedo, so the rings are baked again
  rebake()
  save()
}
const DEBUG = { shaded: 0, weights: 1, warp: 2, mip: 3, albedo: 4, normals: 6, rings: 8, biomes: 11 }

// ---------- virtual texture: baked rings around the camera ----------

// Three squares centred near the camera, each 2048² texels, each four times the side of the last:
// 512 m at 0.25 m a texel, 2048 m at 1 m, 8192 m at 4 m (the last covers the whole ground). A ring
// holds this shader's albedo and its normal-mapped normal rendered straight down, with mips, in a
// texture array of two layers.
//
// A ring is addressed by world position wrapped on its side (the shader's ringOne), so a world texel
// always lands on the same texel of the ring. When the camera has moved an eighth of the side, the
// ring's window moves with it and only the part of the new window the old one did not hold is baked:
// a strip along each side it moved toward. `valid` is the rectangle of finished texels the shader may
// read. On a move it shrinks to what the old and new windows share, and grows again as each strip is
// finished, one whole strip at a time, so it is always a rectangle. Strips are cut into tiles of
// TILE² texels, and tiles are baked finest ring first until the frame's budget of texels is spent,
// so a move costs a strip spread over frames, not a whole ring in one.
const RING_RES = 2048
const TILE = 512
const rings = [512, 2048, 8192].map(side => ({ side, t: side / RING_RES, at: null, valid: null, queue: [], rt: arrayTarget(RING_RES, 2, THREE.HalfFloatType, false, true) }))
rings.forEach((r, i) => { U[`uRing${i}`].value = r.rt.texture; U.uRingS.value[i] = r.side })
const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000)

// rectangles are [x0, z0, x1, z1] in metres
const inter = (a, b) => {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]
  return r[0] < r[2] && r[1] < r[3] ? r : null
}
const bbox = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
// W less V (V inside W) as strips, in an order where each finished strip leaves V ∪ strips a rectangle:
// the two along z within V's x span first, then the two full-height ones along x
function strips(W, V) {
  if (!V) return [W]
  const out = []
  if (V[1] > W[1]) out.push([V[0], W[1], V[2], V[1]])
  if (W[3] > V[3]) out.push([V[0], V[3], V[2], W[3]])
  if (V[0] > W[0]) out.push([W[0], W[1], V[0], W[3]])
  if (W[2] > V[2]) out.push([V[2], W[1], W[2], W[3]])
  return out
}
function tiles(rect, t) {
  const out = [], step = TILE * t
  for (let z = rect[1]; z < rect[3]; z += step) for (let x = rect[0]; x < rect[2]; x += step) out.push([x, z, Math.min(x + step, rect[2]), Math.min(z + step, rect[3])])
  return out
}
// a run of texel indices [a, b) cut where it crosses a multiple of n, so each piece is one run of the wrapped texture
function seams(a, b, n) {
  const out = []
  while (a < b) { const e = Math.min(b, (Math.floor(a / n) + 1) * n); out.push([a, e]); a = e }
  return out
}
const wrap = (v, n) => ((v % n) + n) % n

function retarget(r, cx, cz) {
  r.at = [cx, cz]
  const h = r.side / 2, W = [cx - h, cz - h, cx + h, cz + h]
  r.valid = r.valid && inter(r.valid, W)
  r.queue = strips(W, r.valid).map(rect => ({ rect, tiles: tiles(rect, r.t) }))
}

// One tile into ring r: in the wrapped texture a tile is up to four pieces, each drawn by an
// orthographic camera over exactly its texels, the albedo into layer 0 and the normal into layer 1.
function bakeTile(r, [x0, z0, x1, z1]) {
  const N = RING_RES, t = r.t
  // texel i covers x in [i t, (i + 1) t); texel row j covers −z in [j t, (j + 1) t), so row 0 is the most +z
  const i0 = Math.round(x0 / t), i1 = Math.round(x1 / t), j0 = Math.round(-z1 / t), j1 = Math.round(-z0 / t)
  for (const [a, b] of seams(i0, i1, N)) {
    for (const [c, d] of seams(j0, j1, N)) {
      const w = (b - a) * t, h = (d - c) * t, xc = ((a + b) / 2) * t, zc = -((c + d) / 2) * t
      bakeCam.left = -w / 2; bakeCam.right = w / 2; bakeCam.top = h / 2; bakeCam.bottom = -h / 2
      bakeCam.updateProjectionMatrix()
      bakeCam.position.set(xc, 4000, zc)
      bakeCam.up.set(0, 0, -1)
      bakeCam.lookAt(xc, 0, zc)
      r.rt.viewport.set(wrap(a, N), wrap(c, N), b - a, d - c)
      r.rt.scissor.copy(r.rt.viewport)
      r.rt.scissorTest = true
      for (const [layerIndex, pass] of [[0, 7], [1, 9]]) {
        U.uDebug.value = pass
        renderer.setRenderTarget(r.rt, layerIndex)
        renderer.render(scene, bakeCam)
      }
    }
  }
  return (i1 - i0) * (j1 - j0)
}

const ringStats = { tiles: 0, texels: 0 }
function updateRings() {
  U.uVT.value = state.vt ? 1 : 0
  if (!state.vt) return
  for (const r of rings) {
    const snap = r.side / 8
    const cx = Math.round(camera.position.x / snap) * snap, cz = Math.round(camera.position.z / snap) * snap
    if (!r.at || r.at[0] !== cx || r.at[1] !== cz) retarget(r, cx, cz)
  }
  ringStats.tiles = ringStats.texels = 0
  if (rings.every(r => r.queue.length === 0)) return
  // the bake draws the ground with no ring bound (a ring may not be read while it is drawn into),
  // nothing but the ground, over a black clear
  const was = { debug: U.uDebug.value, markers: markers.visible, clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() }
  rings.forEach((r, i) => { U[`uRing${i}`].value = null })
  U.uVT.value = 0
  markers.visible = false
  scene.background = null
  renderer.setClearColor(0x000000, 1)
  const touched = new Set()
  let budget = state.vtBudget * 1024
  outer: for (const r of rings) {
    while (r.queue.length) {
      const job = r.queue[0]
      while (job.tiles.length) {
        if (budget <= 0) break outer
        const n = bakeTile(r, job.tiles.shift())
        budget -= n
        ringStats.tiles++
        ringStats.texels += n
        touched.add(r)
      }
      r.valid = r.valid ? bbox(r.valid, job.rect) : job.rect
      r.queue.shift()
    }
  }
  for (const r of rings) { r.rt.scissorTest = false; r.rt.viewport.set(0, 0, RING_RES, RING_RES); r.rt.scissor.copy(r.rt.viewport) }
  renderer.setRenderTarget(null)
  for (const r of touched) mips(r.rt)
  renderer.setClearColor(was.clear, was.alpha)
  scene.background = sky
  markers.visible = was.markers
  U.uDebug.value = was.debug
  U.uVT.value = 1
  rings.forEach((r, i) => {
    U[`uRing${i}`].value = r.rt.texture
    if (r.valid) U.uRingV.value[i].fromArray(r.valid)
    else U.uRingV.value[i].set(1, 1, -1, -1)
  })
}
// every ring forgets its bake; the shader reads none of it until it is baked again
const rebake = () => rings.forEach((r, i) => { r.at = null; r.valid = null; r.queue = []; U.uRingV.value[i].set(1, 1, -1, -1) })

// ---------- cameras ----------

const look = { yaw: 0, pitch: -0.1 }
const keys = new Set()
const orbit = new OrbitControls(camera, renderer.domElement)
orbit.enabled = false
orbit.enableDamping = true
function place(x, y, z, yaw, pitch) {
  camera.position.set(x, y, z)
  look.yaw = yaw
  look.pitch = pitch
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
  if (orbit.enabled) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    orbit.target.copy(camera.position).addScaledVector(f, 60)
  }
}
const groundY = (x, z) => grid.sample(x, z).h
// The steepest point within 600 m of the middle, for the cliff preset.
function steepest() {
  let best = { s: -1, x: 0, z: 0 }
  for (let z = -600; z <= 600; z += 8) for (let x = -600; x <= 600; x += 8) {
    const s = 1 - grid.sample(x, z).ny
    if (s > best.s) best = { s, x, z }
  }
  return best
}
// The point nearest the middle, on a 16 m grid within 1800 m, that passes test(x, z), or the middle.
function nearest(test) {
  let best = null, bd = Infinity
  for (let z = -1800; z <= 1800; z += 16) for (let x = -1800; x <= 1800; x += 16) {
    const d = x * x + z * z
    if (d < bd && test(x, z)) { best = { x, z }; bd = d }
  }
  return best ?? { x: 0, z: 0 }
}
const PRESETS = {
  'eye level': () => place(0, groundY(0, 0) + 1.7, 0, 0, -0.08),
  '300 m up': () => place(0, groundY(0, 0) + 300, 0, 0, -0.55),
  'horizon from 1 km': () => place(0, 1000, 0, 0, -0.18),
  'cliff face': () => {
    const c = steepest(), s = grid.sample(c.x, c.z)
    const dx = s.nx, dz = s.nz, l = Math.hypot(dx, dz) || 1
    // stand 60 m out from the face, on the ground, looking back at it and up to its middle
    const x = c.x + (dx / l) * 60, z = c.z + (dz / l) * 60, y = groundY(x, z) + 2
    place(x, y, z, Math.atan2(dx / l, dz / l), Math.atan2(s.h - y, 60))
  },
  'snow line': () => {
    const p = nearest((x, z) => Math.abs(groundY(x, z) - 360) < 4 && biomeWeights(state.biomes, x, z)[0] > 0.99)
    place(p.x, groundY(p.x, p.z) + 40, p.z + 80, 0, -0.35)
  },
  'desert, eye level': () => {
    const p = nearest((x, z) => biomeWeights(state.biomes, x, z)[1] > 0.99 && grid.sample(x, z).ny > 0.95)
    place(p.x, groundY(p.x, p.z) + 1.7, p.z, 0, -0.08)
  },
  'biome border': () => {
    // a low, gentle place where the two biomes meet, seen from 25 m up and 40 m back across the border
    const p = nearest((x, z) => Math.abs(biomeWeights(state.biomes, x, z)[1] - 0.5) < 0.1 && grid.sample(x, z).ny > 0.95)
    place(p.x, groundY(p.x, p.z + 40) + 25, p.z + 40, 0, -0.45)
  },
  'border from 600 m': () => {
    const p = nearest((x, z) => Math.abs(biomeWeights(state.biomes, x, z)[1] - 0.5) < 0.1)
    place(p.x, groundY(p.x, p.z) + 600, p.z + 700, 0, -0.65)
  },
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return
  keys.add(e.code)
  const views = { Digit1: 'shaded', Digit2: 'weights', Digit3: 'warp', Digit4: 'mip', Digit5: 'albedo', Digit6: 'normals', Digit7: 'rings', Digit8: 'biomes' }
  if (views[e.code]) setDebug(views[e.code])
})
addEventListener('keyup', (e) => keys.delete(e.code))
renderer.domElement.addEventListener('click', () => { if (state.controls === 'fly') renderer.domElement.requestPointerLock() })
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return
  look.yaw -= e.movementX * 0.0022
  look.pitch = Math.max(-1.55, Math.min(1.55, look.pitch - e.movementY * 0.0022))
})
const fwd = new THREE.Vector3(), right = new THREE.Vector3()
function fly(dt) {
  camera.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'))
  fwd.set(0, 0, -1).applyQuaternion(camera.quaternion)
  right.set(1, 0, 0).applyQuaternion(camera.quaternion)
  const v = state.speed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6 : 1) * dt
  if (keys.has('KeyW')) camera.position.addScaledVector(fwd, v)
  if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -v)
  if (keys.has('KeyD')) camera.position.addScaledVector(right, v)
  if (keys.has('KeyA')) camera.position.addScaledVector(right, -v)
  if (keys.has('KeyE') || keys.has('Space')) camera.position.y += v
  if (keys.has('KeyQ') || keys.has('KeyC')) camera.position.y -= v
  const h = groundY(camera.position.x, camera.position.z)
  camera.position.y = state.walk ? h + 1.7 : Math.max(camera.position.y, h + 0.5)
}

// ---------- agreement: GPU weights against JS weights ----------

const markers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshBasicMaterial(), 4000)
markers.count = 0
scene.add(markers)
// the weights view's colours, layer by layer
const PAL = [[0.25, 0.75, 0.25], [0.9, 0.6, 0.2], [0.3, 0.4, 1.0], [1, 1, 1], [0.95, 0.85, 0.35], [0.45, 0.28, 0.12], [0.85, 0.15, 0.1], [1.0, 0.55, 0.75]].map(c => new THREE.Color(...c))
const dominant = (w) => w.indexOf(Math.max(...w))
function dropMarkers() {
  const m = new THREE.Matrix4(), mode = COMPOSE[state.compose]
  let n = 0
  for (let z = -60; z <= 60 && n < 4000; z += 2) for (let x = -60; x <= 60 && n < 4000; x += 2) {
    const px = camera.position.x + x, pz = camera.position.z + z, s = grid.sample(px, pz)
    const w = weights(state.biomes, mode, px, s.h, pz, s.ny)
    m.makeTranslation(px, s.h, pz)
    markers.setMatrixAt(n, m)
    markers.setColorAt(n, PAL[dominant(w)])
    n++
  }
  markers.count = n
  markers.instanceMatrix.needsUpdate = true
  markers.instanceColor.needsUpdate = true
}
const result = { agreement: 'not measured' }
// The GPU's weights over 256 m under the camera, rendered straight down four at a time (uDebug 5 for
// layers 0–3, 10 for 4–7), against warp.js's at every pixel centre.
function measure() {
  const R = 512, half = 128
  const cx = camera.position.x, cz = camera.position.z
  const rt = new THREE.WebGLRenderTarget(R, R)
  const top = new THREE.OrthographicCamera(-half, half, half, -half, 1, 5000)
  top.position.set(cx, 3000, cz)
  top.up.set(0, 0, -1)
  top.lookAt(cx, 0, cz)
  const was = U.uDebug.value, mVis = markers.visible
  markers.visible = false
  scene.background = new THREE.Color(0, 0, 0)
  const pages = [5, 10].map((pass) => {
    U.uDebug.value = pass
    renderer.setRenderTarget(rt)
    renderer.render(scene, top)
    const px = new Uint8Array(R * R * 4)
    renderer.readRenderTargetPixels(rt, 0, 0, R, R, px)
    return px
  })
  renderer.setRenderTarget(null)
  rt.dispose()
  U.uDebug.value = was
  markers.visible = mVis
  scene.background = sky
  const mode = COMPOSE[state.compose], cell = (2 * half) / R
  let sum = 0, max = 0, same = 0, n = 0, mixed = 0
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const x = cx - half + (i + 0.5) * cell, z = cz + half - (j + 0.5) * cell
    const s = grid.sample(x, z)
    const w = weights(state.biomes, mode, x, s.h, z, s.ny)
    const o = (j * R + i) * 4
    const gw = []
    for (const px of pages) for (let c = 0; c < 4; c++) gw.push(px[o + c] / 255)
    for (let k = 0; k < LAYERS; k++) { const d = Math.abs(gw[k] - w[k]); sum += d; if (d > max) max = d }
    if (dominant(gw) === dominant(w)) same++
    if (w.slice(0, PER).some(v => v > 0) && w.slice(PER).some(v => v > 0)) mixed++
    n++
  }
  result.agreement = `${n} px (${mixed} in both biomes): mean |Δw| ${(sum / (n * LAYERS)).toFixed(4)}, max ${max.toFixed(4)}, same top layer ${((100 * same) / n).toFixed(2)}%`
  console.log('agreement', result.agreement)
  return result.agreement
}

// ---------- field JSON (the issue's per-layer shape, grouped by biome) ----------

// a rule end at the slider's end is no limit, written as null
const finite = (r, [lo, hi]) => r.map(v => (v <= lo || v >= hi ? null : v))
const warpJson = (list) => list.filter(o => o.freq && o.amp).map(o => ({ freq: o.freq, amp: o.amp, stretch: o.stretch, rotate: o.rotate }))
function fieldJson() {
  return JSON.stringify({
    compose: state.compose,
    heightBlend: state.hb > 0 ? { amount: state.hb, depth: state.hbDepth, from: state.hbSrc } : null,
    far: state.far > 0 ? { amount: state.far, scale: state.farMul } : null,
    biomes: state.biomes.filter((b, j) => j === 0 || b.on).map((b, j) => ({
      name: b.name,
      land: b.land,
      ...(j === 0 ? {} : { cover: b.cover, noise: b.noise, edge: b.edge, warp: warpJson(b.warp) }),
      layers: b.layers.filter((l, r) => r === 0 || l.on).map((l, r) => ({
        map: l.map, normal: `${l.map}-normal`, scale: l.scale, normalStrength: l.normalStrength,
        ...(r === 0 ? {} : { where: { height: finite(l.height, H), slope: finite(l.slope, S) }, noise: l.noise, edge: l.edge }),
        warp: warpJson(l.warp),
        tri: l.tri, ...(l.tri ? { sharp: l.sharp } : {}),
      })),
    })),
  }, null, 2)
}

// ---------- panel ----------

const gui = new GUI({ title: 'terrain warp (#20)' })
const on = (c) => c.onChange(sync)
const view = gui.addFolder('view')
let debugCtl
function setDebug(d) { state.debug = d; debugCtl.updateDisplay(); sync() }
debugCtl = on(view.add(state, 'debug', Object.keys(DEBUG)).name('debug (keys 1–8)'))
on(view.add(state, 'res', Object.keys(ARR)).name('texture array size'))
view.add(state, 'pixelRatio', [0.5, 1, 1.5, 2]).name('pixel ratio').onChange((v) => { renderer.setPixelRatio(v); renderer.setSize(innerWidth, innerHeight); save() })
on(view.add(state, 'fog', 0, 0.0006, 0.00001).name('aerial fog'))
on(view.add(state, 'sunAz', 0, 360, 1).name('sun azimuth'))
on(view.add(state, 'sunEl', 2, 89, 1).name('sun elevation'))
const cam = gui.addFolder('camera')
cam.add(state, 'controls', ['fly', 'orbit']).onChange((v) => { orbit.enabled = v === 'orbit'; if (orbit.enabled) { document.exitPointerLock(); place(camera.position.x, camera.position.y, camera.position.z, look.yaw, look.pitch) } save() })
cam.add(state, 'speed', 1, 200, 1).name('fly speed m/s').onChange(save)
cam.add(state, 'walk').name('walk on ground').onChange(save)
for (const [name, go] of Object.entries(PRESETS)) cam.add({ [name]: go }, name)
const comp = gui.addFolder('composition (open questions)')
on(comp.add(state, 'compose', Object.keys(COMPOSE)).name('weights formula'))
on(comp.add(state, 'hb', 0, 2, 0.01).name('height blend amount'))
on(comp.add(state, 'hbDepth', 0.01, 1, 0.01).name('height blend depth'))
on(comp.add(state, 'hbSrc', ['luminance', '1 − roughness']).name('height from'))
on(comp.add(state, 'far', 0, 1, 0.01).name('far read amount'))
on(comp.add(state, 'farMul', 2, 64, 1).name('far read × scale'))
function warpFolders(parent, list, freqMax, ampMax, change = sync) {
  const ch = (c) => c.onChange(change)
  list.forEach((o, i) => {
    const wf = parent.addFolder(`warp octave ${i}`)
    wf.close()
    ch(wf.add(o, 'freq', 0, freqMax, freqMax / 1000).name('freq /m'))
    ch(wf.add(o, 'amp', 0, ampMax, ampMax / 600).name('amp m'))
    ch(wf.add(o.stretch, 0, 0, 8, 0.05).name('stretch x'))
    ch(wf.add(o.stretch, 1, 0, 8, 0.05).name('stretch y'))
    ch(wf.add(o.stretch, 2, 0, 8, 0.05).name('stretch z'))
    ch(wf.add(o, 'rotate', -Math.PI, Math.PI, 0.01).name('rotate about y'))
  })
}
state.biomes.forEach((B, j) => {
  const bf = gui.addFolder(`biome ${j}: ${B.name}${j === 0 ? ' (base)' : ''}`)
  bf.close()
  if (j > 0) {
    // the border moves the land too, so these build the ground again
    const re = (c) => c.onChange(reshape)
    re(bf.add(B, 'on'))
    const wf = bf.addFolder('where')
    re(wf.add(B, 'cover', 0, 1, 0.01).name('cover (0 none, 1 all)'))
    re(wf.add(B.noise, 'freq', 0, 0.01, 0.00001).name('noise freq /m'))
    re(wf.add(B.noise, 'amp', 0, 1.5, 0.01).name('noise amount'))
    on(wf.add(B, 'edge', 0, 1, 0.01).name('texture edge (0 cut, 1 soft)'))
    re(wf.add(B.land, 'edge', 0, 1, 0.01).name('land edge (0 cut, 1 soft)'))
    warpFolders(wf, B.warp, 0.05, 400, reshape)
  }
  if (B.land.form === 'dunes') {
    const lf = bf.addFolder('land: dunes')
    lf.close()
    lf.add(B.land, 'wind', 0, 180, 1).name('wind direction °').onChange(reshape)
    lf.add(B.land, 'wavelength', 40, 600, 5).name('dune spacing m').onChange(reshape)
    lf.add(B.land, 'height', 0, 80, 0.5).name('dune height m').onChange(reshape)
    lf.add(B.land, 'lee', 0.1, 0.5, 0.01).name('lee share (steep side)').onChange(reshape)
    lf.add(B.land, 'base', 0, 300, 1).name('floor height m').onChange(reshape)
    lf.add(B.land, 'swell', 0, 200, 1).name('swell m').onChange(reshape)
  }
  B.layers.forEach((L, r) => {
    const f = bf.addFolder(`layer ${j * PER + r}: ${L.name}${r === 0 ? ' (base)' : ''}`)
    f.close()
    if (r > 0) on(f.add(L, 'on'))
    on(f.add(L, 'map', SETS))
    on(f.add(L, 'scale', 1, 100, 0.5).name('texture repeat m'))
    on(f.add(L, 'normalStrength', 0, 3, 0.05).name('normal strength'))
    on(f.add(L, 'tri').name('triplanar'))
    on(f.add(L, 'sharp', 1, 16, 0.5).name('triplanar sharpness'))
    if (r > 0) {
      const w = f.addFolder('where')
      const r4 = (obj, key, lo, hi, st, label) => ['from 0', 'full', 'full to', 'to 0'].forEach((n, i) => on(w.add(obj[key], i, lo, hi, st).name(`${label} ${n}`)))
      r4(L, 'height', H[0], H[1], 1, 'height m')
      r4(L, 'slope', S[0], S[1], 0.005, 'slope (0 flat, 1 wall)')
      on(w.add(L.noise, 'freq', 0, 1, 0.001).name('noise freq /m'))
      on(w.add(L.noise, 'amp', 0, 1.5, 0.01).name('noise amount'))
      on(w.add(L, 'edge', 0, 1, 0.01).name('edge (0 cut, 1 soft)'))
    }
    warpFolders(f, L.warp, 0.5, 60)
  })
})
const vtf = gui.addFolder('virtual texture (baked rings)')
vtf.add(state, 'vt').name('on').onChange(save)
on(vtf.add(state, 'vtNear', 0, 1000, 5).name('ring fade starts m'))
on(vtf.add(state, 'vtFar', 1, 1500, 5).name('ring fade ends m'))
on(vtf.add(state, 'vtCliff', 0, 1, 0.01).name('live where normal y below'))
on(vtf.add(state, 'vtBand', 0.01, 0.2, 0.005).name('ring to ring blend (of side)'))
vtf.add(state, 'vtBudget', 64, 8192, 64).name('bake budget k texels/frame').onChange(save)
vtf.add({ rebake }, 'rebake').name('bake rings again')
const agree = gui.addFolder('GPU = JS agreement')
agree.add({ measure }, 'measure').name('measure 256 m under camera')
agree.add(result, 'agreement').listen().disable()
agree.add({ drop: dropMarkers }, 'drop').name('drop JS markers here')
agree.add({ clear: () => { markers.count = 0 } }, 'clear').name('clear markers')
const out = gui.addFolder('output')
const pre = document.getElementById('json')
out.add({ show: () => { pre.textContent = fieldJson(); pre.hidden = !pre.hidden } }, 'show').name('show field JSON')
out.add({ copy: () => navigator.clipboard?.writeText(fieldJson()) }, 'copy').name('copy field JSON')
out.add({ reset: () => { try { localStorage.removeItem(KEY) } catch { /* nothing kept */ } location.reload() } }, 'reset').name('reset everything')

// ---------- hud, loop ----------

let last = performance.now(), frames = 0, fpsT = last, fps = 0
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (state.controls === 'fly') fly(dt)
  else orbit.update()
  updateRings()
  renderer.render(scene, camera)
  frames++
  if (now - fpsT > 500) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now }
  const c = camera.position, b = biomeWeights(state.biomes, c.x, c.z)
  const pending = rings.map(r => r.queue.reduce((s, q) => s + q.tiles.length, 0)).join('/')
  hud.textContent = `${fps.toFixed(0)} fps · ${state.debug} · ${state.res} · x ${c.x.toFixed(0)} z ${c.z.toFixed(0)} · ${(c.y - groundY(c.x, c.z)).toFixed(1)} m above ground · biomes ${b.map(v => v.toFixed(2)).join('/')} · ring tiles left ${pending}${msg ? ` · ${msg}` : ''}\nclick to fly · WASD · E/Q up/down · shift fast · 1–8 debug views`
  requestAnimationFrame(frame)
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
})
orbit.enabled = state.controls === 'orbit'
sync()
PRESETS['eye level']()
requestAnimationFrame(frame)

// for driving from a script (screenshots, the agreement check)
// ms per frame over n frames, each forced to finish on the GPU by a one-pixel read
function bench(n = 20) {
  const px = new Uint8Array(4)
  renderer.render(scene, camera)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
  const t = performance.now()
  for (let i = 0; i < n; i++) { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) }
  const ms = (performance.now() - t) / n
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  return `${ms.toFixed(1)} ms/frame at ${size.x}×${size.y}`
}
// what the rings hold, for a script to check: each ring's window centre, finished rectangle and tiles left
const ringState = () => rings.map(r => ({ side: r.side, at: r.at, valid: r.valid, tilesLeft: r.queue.reduce((s, q) => s + q.tiles.length, 0) }))
const mapsReady = () => arr.filled.every(Boolean)
window.tw = { state, sync, measure, place, PRESETS, setDebug, fieldJson, bench, SIZE, ringState, ringStats, mapsReady }
