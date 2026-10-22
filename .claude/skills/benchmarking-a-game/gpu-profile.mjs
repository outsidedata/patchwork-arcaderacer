// Profiles what a scene of a game costs the GPU as it plays: games/<game>/dev.html?scene=<scene>, opened,
// waited on until it is up and loaded, clicked, pressed and settled by testbed.mjs (`--loading`,
// `--ready`, `--after`, `--press`, `--settle`), as scene-profile.mjs is. It then measures the milliseconds
// a frame takes, by the frames counted over `--each` seconds, as it is and with one thing of the scene's
// drawing taken away at a time, put back before the next:
//   each pass   each pass of render3d's composer but the scene's own draw (bloom, a plugin's effect, the
//               output), switched off;
//   shadows     every light that casts a shadow let go of it, so no shadow map is drawn (the materials
//               compile again, so it settles a second first);
//   each material  every mesh, instanced mesh and skinned mesh drawn with it put in one plain material
//               instead, three's MeshBasicMaterial in one colour, unlit and untextured: what is saved is
//               what that material's shaders cost over every pixel and vertex it draws, the pixel
//               shader most often, where it covers much of the screen. A material is named by its own
//               name, its type, whether it is canyon3d's ground look, the keys of its `userData` in
//               braces (the plugin that made it: terrain3d's ground is `{terrain3d, terrain3dValues}`),
//               and the name of the first mesh drawn with it (its parent's where it has none), or its
//               geometry's type in angle brackets where neither has one;
//   all flat    every such mesh in the plain material at once.
// A mesh wears the plain material only inside the renderer's `render` (each of its calls in a frame: the
// shadow map's, a plugin's own pass, the composer's), and its own again the moment that returns, so a
// plugin that reads its mesh's material back each frame (skydome3d's precipitation writes its uniforms
// through `mesh.material.uniforms`) never meets the plain one.
// Every exception the page throws and every console.error it logs while a thing is taken away is
// counted and its first message printed beside that thing: a frame that throws before it draws is a
// fast frame, so a row whose page threw measures the throw, not the drawing. If the page still throws
// once the thing is put back, the rest of the run would measure a broken page, and it stops there.
// The whole of it is done `--runs` times (1 when left out). Each run measures the page as it is at its
// start and again at its end, and each thing's saving in that run is against the mean of the two, so a
// page that drifts faster or slower over a run is not read as a saving. Each row prints the median over
// the runs and, with more than one, the least and most saved.
// The page has to be held by the GPU for this to read anything: a page that already makes 60 frames a
// second saves nothing it can show. A window counts whole frames, so a row reads to one frame over
// `--each` seconds (1.2 ms at 17 frames a second over 3 s).
// Prints the frame's milliseconds as it is, and for each thing taken away the frames a second, the
// frame's milliseconds and the milliseconds saved, most saved first.
//
// The GPU's own timer (WebGL2's EXT_disjoint_timer_query_webgl2) is not used: on Chrome's ANGLE Metal on
// an M1 it read 204 ms of GPU a frame on a page making 27 frames a second, and 35 ms for one line.
//   node gpu-profile.mjs <server base url> <game> <scene> [--each <s>] [--runs <n>] [--press <key>]…
//        [--settle <s>] [--loading] [--ready <page expression>] [--after <steps>] [--still] [--out <folder>]
import { open, testbedFlags, usage } from './testbed.mjs'

const args = process.argv.slice(2)
const testbed = testbedFlags(args, 'gpu-profile')
const flag = name => {
  const i = args.indexOf(name)
  if (i < 0) return undefined
  return args.splice(i, 2)[1]
}
const each = Number(flag('--each') ?? 3)
const runs = Number(flag('--runs') ?? 1)
const [base, game, sceneName] = args
if (!base || !game || !sceneName) {
  console.error(`usage: node gpu-profile.mjs <server base url> <game> <scene> [--each <s>] [--runs <n>] ${usage}`)
  process.exit(1)
}
const { evaluate, wait, done, take } = await open({ ...testbed, base, game, scene: sceneName, render: true })
const firstLine = s => String(s).split('\n')[0]

// The page's frames counted, and what can be taken away: the passes, the lights that cast shadows, and
// the materials of every mesh drawn, each with the meshes drawn with it.
const setup = await evaluate(`(() => {
  const r = window.__page.client.plugins.render3d, three = r.THREE
  const g = window.__gpu = { frames: 0 }
  const tick = () => { g.frames++; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  g.flat = new three.MeshBasicMaterial({ color: 0x808080 })
  // the meshes that wear the plain material, only while the renderer draws
  g.swapped = []
  const render = r.renderer.render.bind(r.renderer)
  r.renderer.render = (scene, camera) => {
    const own = g.swapped.map(o => o.material)
    for (const o of g.swapped) o.material = g.flat
    try { render(scene, camera) } finally { g.swapped.forEach((o, i) => { o.material = own[i] }) }
  }
  g.passes = r.composer ? r.composer.passes.map((p, i) => [i + ' ' + p.constructor.name, p]).filter(([, p]) => p.enabled && p.constructor.name !== 'RenderPass') : []
  g.materials = () => {
    const by = new Map()
    r.scene.traverse(o => {
      if (!o.isMesh || !o.visible || Array.isArray(o.material) || !o.material) return
      const m = o.material
      if (!by.has(m)) {
        const look = m.userData && m.userData.canyon3d ? ' canyon3d ground look' : ''
        // what the material carries for the plugin that made it (terrain3d's ground its uniforms), so
        // a material neither it nor its mesh names is still known by its plugin
        const tags = m.userData ? Object.keys(m.userData).filter(k => k !== 'canyon3d') : []
        const name = o.name || (o.parent && o.parent.name) || ''
        by.set(m, { label: (m.name ? m.name + ' ' : '') + m.type + look + (tags.length ? ' {' + tags.join(', ') + '}' : '') + (name ? ' (' + name + ')' : ' <' + o.geometry.type + '>'), meshes: [] })
      }
      by.get(m).meshes.push(o)
    })
    // materials of the same label are one thing to take away (each pod's own, each particle sheet's)
    const out = new Map()
    for (const [m, v] of by) {
      const e = out.get(v.label) || []
      for (const o of v.meshes) e.push([o, m])
      out.set(v.label, e)
    }
    return out
  }
  g.lights = () => { const l = []; r.scene.traverse(o => { if (o.isLight && o.castShadow) l.push(o) }); return l }
  return [...g.materials().keys()].length + ' materials, ' + g.passes.length + ' passes to take away, ' + g.lights().length + ' lights casting shadows'
})()`)
console.log(`${game} ${sceneName}: ${setup}`)
for (const [label, n] of await evaluate('[...window.__gpu.materials()].map(([k, v]) => [k, v.length])')) console.log(`  ${String(n).padStart(4)} meshes  ${label}`)

const measure = async () => {
  await evaluate('window.__gpu.frames = 0, true')
  const t0 = Date.now()
  await wait(each * 1000)
  const n = await evaluate('window.__gpu.frames')
  const fps = n / ((Date.now() - t0) / 1000)
  return { fps, ms: 1000 / fps }
}
// each run's page as it is, at its start and its end, and each thing's measurements, a run's each
const asIs = []
const rows = new Map()
const median = list => { const s = [...list].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2 }

for (let run = 0; run < runs; run++) {
  take()
  const start = await measure()
  const startThrew = take()
  if (startThrew.length) {
    console.log(`the page threw ${startThrew.length} times as it is, before anything was taken away: ${firstLine(startThrew[0])}`)
    print()
    done(1)
  }
  const taken = []
  const away = async (label, off, on, settleMs = 300) => {
    take()
    await evaluate(off)
    await wait(settleMs)
    const m = await measure()
    const threw = take()
    await evaluate(on)
    await wait(settleMs)
    take()
    await wait(1000)
    taken.push({ label, ...m, threw })
    const still = take()
    if (still.length) {
      console.log(`the page still threw ${still.length} times in the second after ${label} was put back: ${firstLine(still[0])}`)
      keep(start, start, taken)
      print()
      done(1)
    }
  }
  const passes = await evaluate('window.__gpu.passes.map(([k]) => k)')
  for (const [i, k] of passes.entries()) await away('pass ' + k, `window.__gpu.passes[${i}][1].enabled = false, true`, `window.__gpu.passes[${i}][1].enabled = true, true`)
  await away('shadows', `window.__gpu.held = window.__gpu.lights(); window.__gpu.held.forEach(l => l.castShadow = false); true`, `window.__gpu.held.forEach(l => l.castShadow = true); true`, 1000)
  const materials = await evaluate('[...window.__gpu.materials().keys()]')
  for (const label of materials) {
    const key = JSON.stringify(label)
    await away('material ' + label,
      `(() => { const g = window.__gpu; g.swapped = (g.materials().get(${key}) || []).map(([o]) => o); return true })()`,
      `(window.__gpu.swapped = [], true)`, 1000)
  }
  await away('every material flat',
    `(() => { const g = window.__gpu; g.swapped = [...g.materials().values()].flat().map(([o]) => o); return true })()`,
    `(window.__gpu.swapped = [], true)`, 1000)
  take()
  const end = await measure()
  const endThrew = take()
  keep(start, end, taken)
  console.log(`run ${run + 1} of ${runs}: as it is ${start.fps.toFixed(1)} frames a second, ${start.ms.toFixed(2)} ms a frame at its start, ${end.fps.toFixed(1)}, ${end.ms.toFixed(2)} ms at its end` + (endThrew.length ? `; the page threw ${endThrew.length} times at its end: ${firstLine(endThrew[0])}` : ''))
}
print()
done(0)

// A run's measurements kept, each thing's saving against the mean of the run's start and end.
function keep(start, end, taken) {
  const ms = (start.ms + end.ms) / 2
  asIs.push({ start, end, ms })
  for (const t of taken) {
    const r = rows.get(t.label) ?? []
    r.push({ ...t, saved: ms - t.ms })
    rows.set(t.label, r)
  }
}

function print() {
  if (!asIs.length) return
  const ms = median(asIs.map(a => a.ms))
  console.log(`\nas it is: ${(1000 / ms).toFixed(1)} frames a second, ${ms.toFixed(2)} ms a frame (the median of ${asIs.length} run${asIs.length > 1 ? 's' : ''}, each the mean of its start and end)\n`)
  console.log(`frames/s   ms/frame   ms saved${runs > 1 ? '   least..most saved' : ''}   taken away`)
  const lines = [...rows].map(([label, r]) => ({
    label, fps: median(r.map(x => x.fps)), ms: median(r.map(x => x.ms)), saved: median(r.map(x => x.saved)),
    least: Math.min(...r.map(x => x.saved)), most: Math.max(...r.map(x => x.saved)),
    threw: r.reduce((n, x) => n + x.threw.length, 0), first: r.flatMap(x => x.threw)[0],
  }))
  for (const l of lines.sort((a, b) => b.saved - a.saved)) {
    console.log(l.fps.toFixed(1).padStart(8), l.ms.toFixed(2).padStart(10), l.saved.toFixed(2).padStart(10),
      (runs > 1 ? (l.least.toFixed(1) + '..' + l.most.toFixed(1)).padStart(20) : '') + '   ' + l.label +
      (l.threw ? `   [the page threw ${l.threw} times: ${firstLine(l.first)}]` : ''))
  }
}
