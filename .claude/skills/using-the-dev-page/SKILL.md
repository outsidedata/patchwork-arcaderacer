---
name: using-the-dev-page
description: Use in core, or any clone of it, whenever a game's `dev.html` testbed is written, changed or driven. Triggers on "fps meter", "frame rate", "show the fps", "stats panel", "dev page", "testbed", "add a panel", "add a slider", "lil-gui", "tune it live", "the panel eats my keys", "the game's keys stop working after I touch the panel", "the dropdown closes", "a click on the panel takes the pointer", "pointer lock", "orbit camera", "free camera", "take the camera", "pause", "step one step", "slow motion", "hold the effect on", "force the boost", "turn a plugin off", "without the weather", "copy the JSON", "reset to the file", "show errors on the page", "the profiler says no window.__page", "?scene=", "?tab", "network panel", "bad wifi", "cpu driver", "bot", "playtester in the testbed", and on reading what another game's `dev.html` does. It holds the basic page, the stats panel, the profiler hooks, everything changed before the boot, the lil-gui panel wired so it never breaks the game's keys, mouse or dropdowns, live tuning and which copy each change goes into, wrapping a plugin to force or hide what it draws, taking the camera, the page's own mouse and keys, holding time, error capture, readouts, bots, networks and audio taps, each as the game pages already do it.
---

# Using the dev page

`dev.html`, beside `index.html`, is the one page that is the game's own: a testbed where the game is
played to find something out. It is `index.html` with changes, and every change is the page's: made to
its own copy of the scene files in memory and to the plugins its client holds, never written to a
file. `index.html`, `client.html` and `<game>.server.ts` are written as if it did not exist, and
nothing in the game imports it. What it finds out that the game needs is written into the files by
hand.

Everything below is how the game pages already do it, gathered from every `dev.html` in `games/` and
the games repo's branches. Each section names the pages that do it, so
the whole page can be read. When a page needs something, it is copied from here or from the page
named, never invented again.

Related: `starting-a-game` (the game's other pages), `benchmarking-a-game` (the profilers that open
this page), `tuning-feel`, `tuning-particles`, `experimenting-with-features`, `proving-a-game`,
`good-webviews` (looking at it in Chrome).

## 1. The basic page

Every game starts with this one, the game's name in place of `<game>`. It has:

- the scene the address names entered, `dev.html?scene=<scene>`, the game's own entry without one;
- the truths `load` hands back on `window.__scenes` and the page on `window.__page`, which the
  profilers read (section 3);
- the frame rate: the `stats` plugin's panel at the top left (section 2);
- a readout at the bottom left: the scene, the step, and the last five errors the page threw or wrote;
- a lil-gui panel with a scene picker, wired so it never breaks the game's keys or mouse (section 5).

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title><game> dev</title>
    <style>
      body { margin: 0; background: #0b0b0e; display: grid; place-items: center; height: 100vh }
      canvas { grid-area: 1 / 1 }
      .lil-gui.root { max-height: 100vh; overflow-y: auto }
      #readout { position: fixed; left: 8px; bottom: 8px; color: #e8e8e8; font: 13px monospace; white-space: pre; background: #000a; padding: 6px 8px; pointer-events: none }
    </style>
  </head>
  <body>
    <div id="readout"></div>
    <script type="module">
      // The testbed: index.html, the manager truth and the scenes its row names all in this tab, one
      // seat on them over a loopback, stepped on the page's clock. `?scene=<scene>` enters that scene.
      // The truths are kept on `window.__scenes` and the page on `window.__page` for the profilers
      // (benchmarking-a-game). The frame rate is the stats plugin's panel at the top left. The readout
      // shows the scene and the step, and the last five errors the page threw or wrote.
      import { boot } from '#engine/engine.ts'
      import { accept, load, manager, link, view } from '#addons/scenemanager/scenemanager.addon.ts'
      import { loopback } from '#addons/loopback/loopback.addon.ts'
      import GUI from 'lil-gui'
      import { sim } from './<game>.sim.ts'
      import file from './<game>.scene.json'

      // Every error the page throws or writes, the last five, shown under the readout.
      const errors = []
      const caught = e => {
        errors.push(String(e?.message ?? e))
        if (errors.length > 5) errors.shift()
      }
      addEventListener('error', e => caught(e.error ?? e.message))
      addEventListener('unhandledrejection', e => caught(e.reason))
      const written = console.error.bind(console)
      console.error = (...a) => { caught(a.map(x => x?.message ?? x).join(' ')); written(...a) }

      file.prefabs.scenemanager.entry = new URLSearchParams(location.search).get('scene') ?? file.prefabs.scenemanager.entry

      const dt = file.prefabs.engine.dt
      const truth = boot(file, sim)
      window.__scenes = await load(truth, import.meta.url)
      const page = view(link(loopback(accept(manager(truth)))), file, import.meta.url, (me, scene) => {
        for (const surface of [me.plugins.render3d ?? me.plugins.render2d, me.plugins.ui]) {
          if (!surface) continue
          const canvas = document.createElement('canvas')
          canvas.width = scene.prefabs.engine.width
          canvas.height = scene.prefabs.engine.height
          document.body.appendChild(canvas)
          surface.mount(canvas)
        }
        me.plugins.stats?.mount(document.body)
      })
      window.__page = page
      const readout = document.getElementById('readout')

      // The panel. A press on it stops at it, a release never does, and after a click the focus goes
      // back to the page unless it went into a number to type or a list to pick from (section 5).
      const gui = new GUI({ title: '<game> dev' })
      for (const type of ['keydown', 'keyup', 'click', 'mousedown', 'contextmenu', 'wheel'])
        gui.domElement.addEventListener(type, e => e.stopPropagation())
      gui.domElement.addEventListener('pointerup', () => requestAnimationFrame(() => {
        const at = document.activeElement
        if (gui.domElement.contains(at) && at.tagName !== 'SELECT' && !(at.tagName === 'INPUT' && (at.type === 'text' || at.type === 'number'))) at.blur()
      }))
      addEventListener('change', e => { if (gui.domElement.contains(e.target)) e.target.blur() })

      // The scene, chosen from the manager's table, the page loaded again on it.
      const chosen = { scene: file.prefabs.scenemanager.entry }
      const reload = (key, value) => { const url = new URL(location.href); url.searchParams.set(key, value); location.href = url.href }
      gui.add(chosen, 'scene', Object.keys(file.prefabs.scenemanager.scenes)).onChange(s => reload('scene', s))
      const room = () => window.__scenes.get(chosen.scene)

      let last = performance.now(), owed = 0
      const loop = async now => {
        owed += Math.min((now - last) / 1000, 0.25)
        last = now
        // A frame that throws is shown, and the next frame goes on.
        try {
          page.input()
          while (owed >= dt) { truth.step(dt); owed -= dt }
          await page.frame(owed / dt)
        } catch (e) { caught(e) }
        readout.textContent = [`${chosen.scene}  step ${truth.n}`, ...errors].join('\n')
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    </script>
  </body>
</html>
```

The loop is `index.html`'s: the truth stepped on the page's clock in whole steps of `dt`, and the page
drawn between the last two (`page.frame(owed / dt)`). A page that runs ahead (`predict`, section 15)
hands `frame` the clock instead, `page.frame(now)`, and steps the truth only when one is in the tab.

## 2. The frame rate: the `stats` plugin

The frame rate is three.js's own stats panel, the `stats` plugin (`plugins/stats`): frames a second,
milliseconds a frame, the heap in Chrome; a click on it shows the next one. It takes two lines, and
the pages that have it all do it this way (demo_box3d, demo_terrain3d, demo_walker, demo_motion3d,
demo_ocean3d, demo_particle2d, demo_particle3d, demo_skydome3d, demo_box2d, demo_audio,
arcaderacer, vehicles, sunrace, demo_crowd3d):

1. `stats` listed in each scene's `plugins` in its scene file, after the plugins that draw (render2d,
   render3d), so a frame is counted once it is drawn. `yarn new-game` lists it in the scene it
   writes.
2. `me.plugins.stats?.mount(document.body)` in the mount callback, beside the canvases. Each scene's
   client has its own panel, which starts counting afresh; `?.` covers a scene that does not list it
   (a title). Listed and never mounted, it shows nothing (giantslayer's gym).

canyonracer and horde make three's `Stats` themselves (`import Stats from
'three/examples/jsm/libs/stats.module.js'`, `document.body.appendChild(stats.dom)`, `stats.update()`
first in the loop); that is the same panel.

## 3. What the profilers and drivers read

`benchmarking-a-game`'s `testbed.mjs` opens `games/<game>/dev.html?scene=<scene>` in a headless
Chrome and waits on the page in stages, each read off `window`:

- `window.__page = page`, right after `const page = view(...)`: the client is `__page.client`, its
  step `__page.client.n`, its plugins `__page.client.plugins`.
- `window.__scenes = await load(truth, import.meta.url)`: every truth by its scene's name, where the
  CPU profile times each kind's rules.
- `?scene=` read before the boot (section 4), or the page enters the game's own entry whatever the
  address says.

Without the first two the run stops after three minutes on `no window.__page` or `no
window.__scenes`. `scene-profile.mjs` wraps every plugin's `input`, `tick` and `afterTick` and every
kind's `before`, `tick`, `after` and acts to time them; `testbed.mjs` holds a page still by replacing
`page.frame` and the scenemanager plugin's `hand` (its `stop()` and `go()`).

A page that runs ahead against a server opens as `view` when the profiler names a scene, so it is
measured in the tab (mech):

```js
// ?scene= alone, as the profilers open it: no prediction
const page = (scene !== null && query.get('tab') === null ? view : predict)(link(loopback(truth ? accept(manager(truth)) : socket, time, net)), file, import.meta.url, mount)
const s = page.stats ?? { loads: [] }   // a view has no prediction stats
```

Other handles the pages keep for the console and for scripts, each named in the page's header:
`window.__error` (the last error, section 12), `window.__client`, `window.__defs`, `window.__step`
(section 11), `window.__afterFrame` (a probe called after each drawn frame), `window.__measure`
(section 13), `window.drawn`, `window.dev = { page, truth, get client() { return client } }`, and
`window.page` / `window.truth` on the pages that run ahead, "for a driver to reach its plugins".

## 4. Before the boot: the page's copy of the scene files

`load` boots each truth from the scene files as they stand when it is called, its `world` copied and
its actors made into rows, and the page's view reads the same modules again. So a change to a scene
file, a prefab, an actors entry, `world` or a scene's `plugins` is made before `boot` and `load`; made
after, the truth never steps with it and the page draws a number the rules never read.

The objects to change are the ones the scenemanager imports: the manager file the page imports, and
the `scene` each `<scene>.sim.ts` exports. A child scene is reached by importing its sim module at the
url the scenemanager imports it at, so the truth and the page read the one module:

```js
import { imported } from '#engine/browser.ts'
const entry = file.prefabs.scenemanager.scenes[file.prefabs.scenemanager.entry]
const { scene } = await imported(new URL(entry.file.replace(/\.scene\.json$/, '.sim.ts'), import.meta.url).href)
```

(skateboarding; vehicles does the same with a plain `await import` of the same url; zelda, rpg2d and
giantslayer import each child's sim module statically, `import { scene as gym } from './gym.sim.ts'`.)

What the pages change there:

- **The entry**: `file.prefabs.scenemanager.entry = params.get('scene') ?? file.prefabs.scenemanager.entry`.
  A name that is not a scene throws with the list (vehicles):
  `if (!(scene in file.prefabs.scenemanager.scenes)) throw new Error(`<game> has no scene ${scene}: ${Object.keys(file.prefabs.scenemanager.scenes).join(', ')}`)`.
- **The seat as a menu would have left it**: fields on the `player` prefab, the entered scene's own if
  it gives one, else the manager's (zelda, farm2d `?role=`, giantslayer `?body=`, starfighter
  `?side=`). A scene entered directly gets no `arrive` args, so what `arrive` writes is written here.
  rpg2d gives the entered scene a prefab of its own, cloned from the manager's, so every other
  scene's seat still arrives as the game sends it:
  `const p = (scene.prefabs.player = structuredClone(file.prefabs.player)); Object.assign(p, { arrived: true, party, … })`.
- **Where it starts**: the slot's `start` actor moved, `scene.actors.find(a => a.is === 'start' && a.slot === 0).pos = at`
  (zelda `?at=`, vehicles `?spot=`, which throws naming the spots when one is unknown).
- **A scene's world**: `field.world.seed = Number(ask.get('seed'))` (farm2d `?seed=`); a plugin's
  drawing aid, `file.world.melee3d.show = { … }` (paladin); a mission row's `seek` (starfighter).
- **What is fixed when the renderer or a plugin is made**, by an address flag and a reload, since
  changing it live does nothing (demo_box3d, demo_ocean3d, demo_particle3d, demo_walker, demo_crowd3d):

  ```js
  // The AO, the bloom and the shadows on or off load the page again with `?ao=`, `?bloom=` and
  // `?shadows=`, since the renderer's shadow map, its reversed depth and its composer are fixed when
  // it is made.
  const r3 = main.prefabs.render3d
  if (params.has('shadows')) r3.shadows = params.get('shadows')
  if (params.has('ao')) r3.ao.on = params.get('ao') === '1'
  if (params.get('bloom') === '0') delete r3.bloom
  …
  af.add({ on: !!r3.ao.on }, 'on').onChange(v => reload('ao', v ? '1' : '0'))
  ```

  Others: `?fit=` (demo_box2d, read when render2d is made), `?nodither` (arcaderacer), `?rings`
  (canyonracer).
- **A plugin taken out of a scene**, with everything that names it (demo_skydome3d `?weather=0`,
  `?clouds=0`):

  ```js
  const drop = name => {
    main.plugins = main.plugins.filter(p => p !== name)
    main.actors = main.actors.filter(a => a.is !== name)
    delete main.world[name]
    for (const entry of Object.values(main.world)) {
      const mods = entry && typeof entry === 'object' ? entry.mods : undefined
      if (mods) for (const [k, v] of Object.entries(mods)) if (v === name) delete mods[k]
    }
  }
  ```

  vehicles `?off=a,b` checks each name and throws with the scene's list:
  `for (const p of off) if (!child.plugins.includes(p)) throw new Error(`${scene} lists no plugin ${p}: ${child.plugins.join(', ')}`)`,
  then `child.plugins = child.plugins.filter(p => !off.includes(p))`.
- **A plugin put into a scene**: the playtester for a bot (section 14),
  `if (!scene.plugins.includes('playtester')) scene.plugins = [...scene.plugins, 'playtester']`.
- **The definitions read before the boot** with `prepared` (section 7), when the seat is built from
  them (rpg2d's party and bag) or a flag is set on them (giantslayer `?net`).
- **Fonts** the UI draws in, loaded first so none is drawn in the fallback (farm2d):
  `await Promise.all([document.fonts.load('400 10px "Pixelify Sans"'), document.fonts.load('700 10px "Pixelify Sans"')])`.
- **A testbed manager of its own** when the game's manager carries menus the testbed skips: descent
  boots `./dev.scene.json` (a manager of one scene, the gym, with the game's `world` and every prefab)
  with `./dev.sim.ts` (`export const sim: Sim = { scenemanager }`).

Every address parameter a page reads is listed in its header comment, with what it does.

## 5. The panel: lil-gui, wired so the game keeps its keys, mouse and focus

`import GUI from 'lil-gui'`, `const gui = new GUI({ title: '<game> dev' })`. The player plugin listens
on the window, in the bubble phase, for `keydown`, `keyup`, `click`, `mousedown`, `mouseup`,
`mousemove`, `mouseout`, `contextmenu` and `wheel` (`plugins/player/player.plugin.ts`). An event that
bubbles up from the panel is therefore a game key or a game button, and:

- a `click` takes the pointer lock when the seat's bind table has `pointer`;
- a `mousedown` has its default cancelled when the game binds that button, and that default is what
  focuses a number box and opens a `<select>`;
- a `wheel` has its default cancelled when the game binds the wheel, so the panel cannot scroll;
- a `contextmenu` is cancelled when `Mouse2` is bound.

So the panel stops these at itself (castle, npc3d, mech, horde, paladin, starfighter, shooter,
canyonracer):

```js
for (const type of ['keydown', 'keyup', 'click', 'mousedown', 'contextmenu', 'wheel'])
  gui.domElement.addEventListener(type, e => e.stopPropagation())
```

and never `mouseup`, `pointerup`, `mousemove` or `pointermove`: "lil-gui ends a drag by the window's
`mouseup`" (starfighter), and "a button's release is let through, so a held fire let go over the
panel still lets go" (horde). Stopping the release leaves a game button held and a slider dragging.

After a click the focus goes back to the page, or the game's keys go dead the moment a slider is
touched; a number box being typed into keeps it, and so does a list until it is picked from, which
gives it back on its `change` (canyonracer):

```js
gui.domElement.addEventListener('pointerup', () => requestAnimationFrame(() => {
  const at = document.activeElement
  if (gui.domElement.contains(at) && at.tagName !== 'SELECT' && !(at.tagName === 'INPUT' && (at.type === 'text' || at.type === 'number'))) at.blur()
}))
addEventListener('change', e => { if (gui.domElement.contains(e.target)) e.target.blur() })
```

The `at.tagName !== 'SELECT'` is canyonracer's alone. castle, npc3d, mech, horde, paladin and
starfighter blur whatever is focused a frame after the pointer goes up, a `<select>` included, and
shooter blurs everything with no exception at all. A key typed into a focused field is the field's
anyway: the player plugin passes over a key whose target is an INPUT, TEXTAREA or SELECT, or is editable.

The rest of the panel's habits:

- `.lil-gui.root { max-height: 100vh; overflow-y: auto }`, so a long panel scrolls under the stopped
  wheel. demo_box3d lays the scene out beside the panel instead: `body { padding-right: 245px;
  box-sizing: border-box; grid-template-columns: minmax(0, 1fr) }`, `canvas { max-width: 100%;
  max-height: 100vh; width: auto; height: auto }`, "so no part of it is under the panel".
- A button is a function on a throwaway object: `gui.add({ go: () => … }, 'go').name('…')`.
- A readout on the panel is a getter, listened and disabled:
  `g.add({ get shown() { return … } }, 'shown').listen().disable()`; a value a key changes is
  `.listen()`ed so the panel follows it.
- After code sets values (a preset, a reset): `gui.controllersRecursive().forEach(c => c.updateDisplay())`.
- A label says when a change takes effect: `.name('rod radius (m, next load)')`.
- Folders closed at the start: `folder.close()`.
- A folder built again when what it shows changes: `warp?.destroy(); warp = layer.addFolder('warp')`.
  A panel that follows the client is rebuilt on a new client (`if (!client || client === shown)
  return; shown?.folder.destroy(); …`, demo_terrain3d, demo_skydome3d), or on a new renderer or
  composer (`if (!r || (built?.r === r && built?.composer === composer)) return`, arcaderacer,
  vehicles), arcaderacer keeping the folders that were open through lil-gui's `_closed` and `_title`.
- Sliders need the key present: a missing one is given its default first, `l.strength ??= 1`.
- Ranges from the value when there is no table: `[Math.min(0, v), Math.max(1, 4 * Math.abs(v)), 0.01]`
  (canyonracer).
- The scene picker, and any first-read setting, reloads the page with the address changed (section
  1's `reload`); a checkbox that is a flag deletes the parameter when unticked (skateboarding's `bot`).
- **Copy, never write**: the page writes no file. A `copy` button puts the panel's numbers on the
  clipboard as JSON, under the path they go in, to be pasted by hand:
  `gui.add({ copy: () => navigator.clipboard?.writeText(JSON.stringify(own, null, 2)) }, 'copy').name('copy box3d JSON')`
  (starfighter `console.log`s it too). The one page that saves is the cutscene's panel (section 19),
  whose Save the dev server writes.
- **Copy changed values**, the whole panel's copy: one button that copies only the controls moved since
  the page opened, from every folder, each nested to its place under the file it is kept in, with
  nothing else beside it (horde's `dev.html`). `gui.onChange` hears every controller of every folder
  (lil-gui passes each change up to the root), so the moved ones are kept as they are moved, never
  found by comparing against a value from when the page opened, which a listened value such as the time
  of day leaves on its own. Each one's home is found by walking each root the panel edits for the
  controller's `object`. Each root is named with its file and the keys it sits under there: the
  definitions under `assets/<game>.json`, a scene's `world` under `<scene>.scene.json` `world`, a
  plugin's code constant by its file and name. A knob object of getters and setters (a row's field, an
  effect's layer) is not in any root, so it is kept in a `Map` beside its file and keys when it is made.
  A value that is one entry of a list is copied as the whole list as it now stands, since JSON cannot
  hold part of a list. Buttons (a function's value) are skipped, and readouts, being disabled, never
  change. A control in no file goes under `this page only`:

  ```js
  const homes = [[defs, 'games/<game>/assets/<game>.json', []], [main.world, 'games/<game>/main.scene.json', ['world']]]
  const pathTo = (root, target) => { const seen = new Set(); const walk = (o, keys) => { if (o === target) return keys; if (!o || typeof o !== 'object' || seen.has(o)) return undefined; seen.add(o); for (const k of Object.keys(o)) { const f = walk(o[k], [...keys, k]); if (f) return f } }; return walk(root, []) }
  const where = c => {
    if (knobs.has(c.object)) { const [file, keys] = knobs.get(c.object); return [file, [...keys, c.property], c.getValue()] }
    for (const [root, file, base] of homes) {
      const keys = pathTo(root, c.object)
      if (keys) return Array.isArray(c.object) ? [file, [...base, ...keys], [...c.object]] : [file, [...base, ...keys, c.property], c.getValue()]
    }
    return ['this page only', [c._name], c.getValue()]
  }
  const touched = new Set()
  gui.onChange(e => { if (typeof e.value !== 'function') touched.add(e.controller) })
  gui.add({ copy: () => {
    const out = {}
    for (const c of touched) { const [file, keys, value] = where(c); let at = (out[file] ??= {}); for (const k of keys.slice(0, -1)) at = (at[k] ??= {}); at[keys.at(-1)] = value }
    navigator.clipboard.writeText(JSON.stringify(out, null, 2))
  } }, 'copy').name('copy changed values')
  ```
- **Reset to the file**: the file's numbers kept before the boot, `const fileOwn = clone(main.world.box3d)`,
  and written back key by key "so every control keeps its object":

  ```js
  const into = (to, from) => { for (const [k, v] of Object.entries(from)) { if (v && typeof v === 'object' && !Array.isArray(v) && to[k] && typeof to[k] === 'object') into(to[k], v); else to[k] = clone(v) } }
  gui.add({ reset: () => { into(own, fileOwn); for (const c of gui.controllersRecursive()) c.updateDisplay(); apply() } }, 'reset').name('reset to the file')
  ```

## 6. Live tuning: which copy a change goes into

The tab holds several copies of the same numbers, and a change reaches only the readers of the copy
it is written into:

- **The truth's world and the page's world.** The panel keeps its own copy and lays it into both, a
  quarter second after the last change, "so the server's rules and the page's look read the same
  numbers" (demo_box3d, demo_ocean3d, demo_particle2d, demo_particle3d, demo_walker, demo_crowd3d):

  ```js
  const own = clone(fileOwn)
  let timer
  const apply = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      for (const world of [room()?.world, client?.plugins.wire.scene.world]) if (world) Object.assign(world.particle2d, clone(own))
    }, 250)
  }
  ```

  demo_motion3d lays it in at once; demo_walker checks it first with the plugin's own `check` and
  shows the refusal in a disabled controller instead of laying it in.
- **The page's copy alone**, for a look the truth never reads: `world.weather3d.look = structuredClone(look)`
  (demo_skydome3d). A new object each change is what makes a plugin that compares by object build
  again (demo_audio's `look.sound`).
- **A data file the page's loader holds**: `client.plugins.loader.get(name)`, written part by part as
  new objects, "as the loader swaps them when the file is written" (demo_terrain3d's field, vehicles,
  demo_particle3d's effects file).
- **The definitions**, the tab's one decoded copy every rule and look reads:
  `const defs = await prepared(theScene.world, theScene.world.defs)` from `#plugins/loader/loader.sim.ts`,
  and sliders bound straight on it, `body.add(defs.player, 'run', 1, 12, 0.1).name('run (m/s)')`;
  the next step reads them (castle, demo_box2d, demo_box3d, demo_npc3d, demo_walker, canyonracer,
  horde). `jsonAt(name, url)` is the same copy by its url (starfighter, tuning-feel).
- **Both copies of a file, the rules' and the page's**, when the page's client decodes one of its own
  (canyonracer, starfighter):

  ```js
  for (const f of [ruleField, page.client?.plugins.loader.get(fieldName)]) {
    if (!f) continue
    for (const k of ['program', 'canyon', 'ground']) f[k] = structuredClone(canyonFile[k])
  }
  ```

  starfighter writes the client's copy every frame the seat holds a ship (`json(wire, 'fleet')`,
  `def(wire, 'player')`), so a new scene's client takes the sliders' values too.
- **A plugin module's exported numbers**: `PHYSICS.limit` from `#plugins/ragdoll3d/ragdoll3d.sim.ts`,
  read when a ragdoll is made, so a change is the next death's (horde).
- **Three's objects already built**, found by name, alongside the world a new one is built from:
  `page.client.plugins.render3d.scene.traverse(o => { if (o.name === 'box3dvehicle.beam') … })` (horde).
- **The truth's rows**: a field written straight on a row (demo_npc3d, horde, demo_box3d), a row
  spawned or ended (`room().spawn('beacon', { pos })`, `truth.end(row)`), and a getter/setter pair so
  a slider is a row's field, followed as it changes:

  ```js
  const clock = { get t() { return skyRow()?.data.t ?? 0 }, set t(v) { const r = skyRow(); if (r) r.data.t = v } }
  time.add(clock, 't', 0, day).listen()
  ```

  A sleeping box3d body stays asleep under a new gravity, so demo_box3d writes `awake = true` on every
  row that has it. farm lays rows out after `load` and before the first step (`?from=`).

What is read only once is built again three ways, never by hand:

- the page's plugin closed, so the next frame builds it again: `client?.plugins.ocean3d.close()`
  (demo_ocean3d, demo_particle3d, demo_crowd3d), for the numbers the page names `FIRST`;
- the physics row ended and spawned again from its own data, so its first step builds a new world:
  `truthOf.end(row); truthOf.spawn('box3d', clone(row.data))` (demo_box3d);
- the panel's copy kept in `sessionStorage` and the page reloaded on it (demo_box2d):
  `try { sessionStorage.setItem(KEPT, JSON.stringify(own)) } catch {}; location.reload()`, read back
  into `main.world.box2d` before the next boot.

## 7. The game's mouse and keys, and the page's own

The seat's keys are the player plugin's, bound by the seat's look with `player.bind(table)`. The page
changes them by wrapping `bind` on each client in the mount callback, before the look calls it:

- **Replaced** by the testbed's own table, with no `pointer`, "so no click takes the pointer and the
  panel is clicked freely" (demo_box3d, demo_ocean3d, demo_terrain3d):

  ```js
  const player = me.plugins.player
  if (player) { const bind = player.bind.bind(player); player.bind = () => bind(devBinds) }
  ```

- **Laid over** the seat's, so the game's own click still works (demo_crowd3d, where a click kills
  the person clicked): `player.bind = table => bind({ ...table, ...devBinds })`.

A `devBinds` is a bind table: `stick`, `hold`, `press`, `every` (a function of `held` each frame),
`wheel` (demo_box3d's flies an eye with w s, a d, q e, Shift and Control, the wheel its pace).

**The page taking the mouse from the game** (farm's orbit camera): listeners on the window in the
capture phase, which run before the player plugin's bubble-phase ones, and `stopImmediatePropagation`,
since both are on the same target and `stopPropagation` would not stop it; the wheel `passive: false`
so `preventDefault` works; the pointer lock given back first:

```js
if (document.pointerLockElement) document.exitPointerLock()
// While orbiting, the mouse is the orbit's: caught on the way down, before the player plugin's
// listeners on the window hear it.
const keep = e => { if (orbit.on) { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault() } }
addEventListener('mousedown', e => { if (orbit.on) orbit.dragging = true; keep(e) }, true)
addEventListener('mouseup', e => { orbit.dragging = false; keep(e) }, true)
addEventListener('click', keep, true)
addEventListener('contextmenu', keep, true)
addEventListener('mousemove', e => { if (!orbit.on) return; if (orbit.dragging) { … } keep(e) }, true)
addEventListener('wheel', e => { if (!orbit.on) return; …; keep(e) }, { capture: true, passive: false })
```

`mouseup` ends the drag before anything else, so a drag always ends.

**The page's own drag and wheel beside the game's** (vehicles), skipping the panel, the release
listened with no panel check so a drag let go over the panel still ends:

```js
const onPanel = e => gui.domElement.contains(e.target)
addEventListener('pointerdown', e => { if (e.button === 0 && !onPanel(e)) dragging = true })
addEventListener('pointerup', () => { dragging = false })
addEventListener('wheel', e => { if (!orbit || onPanel(e)) return; e.preventDefault(); … }, { passive: false })
```

**The page's own keys**: a listener on the window, on keys the game binds to nothing, so they work
from the game too (paladin's backquote and `n`, zelda's backquote, farm's `o`, vehicles' `o`, `1`–`4`,
`h`); a key with a modifier passed over (`if (e.metaKey || e.ctrlKey || e.altKey) return`) and a held
key's repeats ignored (`if (e.repeat) return`). The panel's stopped `keydown` and `keyup` keep these
from firing while a number is typed.

**A driver that cannot take the pointer lock** over the DevTools protocol (mech's `tune.html`): the
page says it holds the lock, and moves and keys are dispatched on the window as the player plugin
hears them:

```js
const locked = { on: false }
const real = Object.getOwnPropertyDescriptor(Document.prototype, 'pointerLockElement').get
Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => (locked.on ? document.body : real.call(document)) })
globalThis.dev = {
  lock: on => { locked.on = on },
  move: (dx, dy) => dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy })),
  key: (key, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key })),
}
```

A panel toggle can hold a key down the same way:
`move.add({ [name]: false }, name).onChange(on => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { key })))`.

## 8. Wrapping a plugin: forcing, hiding and switching what it draws

A plugin's browser half is an object on `page.client.plugins`; the page reaches it there each frame,
and a new scene makes a new client with new plugins, so whatever the page does to one is done again to
each new one.

**Forced rows for a look** (arcaderacer; `tuning-particles`): the look plugin's `tick` handed a copy
of the frame's rows with the watched row's fields forced, so the effect is held on while the car
drives and the truth runs as they would. The fake goes into a copy, never into the row (the rows are
what the page predicts from, or the truth's own), and each client's plugin is wrapped once:

```js
const forced = rows => {
  const it = holding(rows)
  if (!it) return rows
  const d = { ...it.data }
  if (force.boost) d.boost = Math.max(d.boost, 1)
  if (force.pop) { d.boost += 1; force.pop = false }
  return rows.map(r => (r === it ? { ...r, data: d } : r))
}
const looking = new WeakSet()
const lookThrough = fx => {
  if (!fx || looking.has(fx)) return
  looking.add(fx)
  const tick = fx.tick.bind(fx)
  fx.tick = p => tick({ ...p, wire: { ...p.wire, rows: forced(p.wire.rows) } })
}
// each frame, before page.frame
lookThrough(page.client?.plugins.fx)
```

**A plugin's calls recorded** (farm2d `?listen`), wrapped on each client as it is mounted:
`const attack = s.attack; s.attack = (track, note, vel) => { struck.push([track, note]); return attack(track, note, vel) }`.

**A plugin's own switches set every frame** before `page.frame`, so a new client keeps them:
`const nav = client?.plugins.nav3d; if (nav) Object.assign(nav, shows)` (shooter's graphs, demo_npc3d's
cones and facts); a shader uniform on every ring's material, "so a new material keeps the view"
(demo_terrain3d's `tdDebug`); a store key, `linked.store['spinner.hold'] = v`.

**Pieces hidden or swapped every frame by walking render3d's scene** (canyonracer), "so what a piece
costs, or what it draws, is found by switching it off and measuring or looking again":

```js
const r = page.client?.plugins.render3d
r.scene.traverse(o => {
  if (o.name === 'plume') o.visible = look.plumes
  else if (o.isPointLight) o.visible = look.lights
  if (o.isLight && o.shadow) { o.userData.devShadow ??= o.castShadow; o.castShadow = drawn.shadows && o.userData.devShadow }
})
for (const p of r.composer?.passes ?? []) if (p.constructor.name === 'UnrealBloomPass') p.enabled = look.bloom
```

- A plugin that sets an object's own `visible` every frame is hidden through its material instead,
  `mat.visible = false`: not drawn, casts no shadow, and the plugin's visible goes on as it was.
- A cheap material swapped in, the real one kept on the mesh to come back:
  `flat ??= new r.THREE.MeshBasicMaterial({ color })`, `if (o.material !== flat) o.userData.devLook = o.material`,
  `o.material = on ? flat : o.userData.devLook`. Three is `r.THREE`, render3d's own copy.
- The ui shows its canvas again in its `afterTick`, so the HUD is hidden after each frame:
  `await page.frame(owed / dt); const c = page.client?.plugins.ui?.canvas; if (c?.style && !drawn.HUD) c.style.display = 'none'`.

**render3d's passes and renderer live** (demo_box3d, demo_ocean3d, demo_particle3d, demo_walker,
demo_crowd3d, arcaderacer, vehicles). The page's import of three's passes is another module than
render3d's, "so `instanceof` never matches"; passes are found by what they hold:

```js
const passOf = has => r3d()?.composer?.passes.find(has)
const gtao = passOf(p => 'updateGtaoMaterial' in p)
const bloom = passOf(p => 'strength' in p && 'threshold' in p)
rf.add(look, 'exposure', 0, 4, 0.01).onChange(v => { r3d().renderer.toneMappingExposure = v })
rf.add(look, 'tone', ['neutral', 'none']).onChange(v => { renderer.toneMapping = v === 'neutral' ? three.NeutralToneMapping : three.NoToneMapping })
```

- Each change is also written into `client.plugins.wire.scene.prefabs.render3d.ao` or `.bloom`, so the
  prefab says what is drawn.
- Shadows toggled mark every material to be built again, since three builds a material's shader with
  or without shadows:
  `r3.scene.traverse(o => { for (const m of [o.material ?? []].flat()) m.needsUpdate = true })`.
- The pixel ratio through render3d, `r3.ratio(v)`, read back live through a getter
  (`{ get ratio() { return r.getPixelRatio() }, set ratio(v) { r3.ratio(v) } }`, `.listen()`).
- Every pass and every top-level object as a checkbox, with a refresh:
  `composer.passes.forEach((p, i) => f.add(p, 'enabled').name(`${i} ${p.constructor.name}`).listen())`,
  `r3.scene.children.forEach((o, i) => objects.add(o, 'visible').name(`${i} ${o.name || o.type}`))`.

## 9. Taking the camera

render3d's camera is taken with `claim(owner)` and given back with `release(owner)`; while it is
claimed the seat's own camera stands aside. The page places it each frame before `page.frame`
(arcaderacer `?fly`/`?watch`, giantslayer `?watch=x,y,z`, flight's views, vehicles' and farm's orbits):

```js
const r3 = page.client?.plugins.render3d
if (r3?.camera && r3.claim(OWNER)) {
  r3.camera.position.set(x, y, z)
  r3.camera.up.set(0, 1, 0)
  r3.camera.lookAt(tx, ty, tz)
}
…
page.client?.plugins.render3d.release(OWNER)   // back to the seat's camera
```

A camera that follows a row is placed between the last two steps as render3d draws the row, by the
step's share `owed / dt` (farm):
`if (n !== orbit.n) { orbit.prev = orbit.cur ?? pos; orbit.cur = pos; orbit.n = n }`,
`const t = orbit.prev.map((v, i) => v + (orbit.cur[i] - v) * alpha)`.

## 10. The canvases

The mount callback is called for each new client, which `view` makes when the seat arrives on a scene
and closes when it leaves; it makes the game's canvas and the ui's over it in one grid cell
(`canvas { grid-area: 1 / 1 }`). Some pages take the last scene's canvases off first,
`for (const c of document.querySelectorAll('canvas')) c.remove()` (demo_audio, arcaderacer, mech,
doom, starfighter, flight, vehicles, bullethell, cards, angrycircles). The callback is also where
everything per client goes: `client = me`, `stats` mounted, `player.bind` wrapped, a plugin wrapped
for recording, render3d's `drew` and `drifted` hooked (section 13).

## 11. Time: pausing, stepping, slowing, speeding

paladin, "so a swing can be watched a step at a time":

```js
const clock = { speed: 1, paused: false }
const stepOnce = n => { for (let i = 0; i < n; i++) truth.step(dt) }
window.__step = (n = 1) => { clock.paused = true; stepOnce(n) }
time.add(clock, 'paused').name('paused (`)').listen()
time.add({ step: () => window.__step(1) }, 'step').name('one step (n)')
time.add(clock, 'speed', 0.02, 1, 0.01).name('clock speed (× real time)')
addEventListener('keydown', e => { if (e.key === '`') clock.paused = !clock.paused; else if (e.key === 'n') window.__step(1) })
…
owed = clock.paused ? 0 : owed + Math.min((now - last) / 1000, 0.25) * clock.speed
// Paused, the page draws the newest step where it stands, not between it and the one before.
await page.frame(clock.paused ? 1 : owed / dt)
```

farm runs faster with `?speed=<n>`: `owed += Math.min((now - last) / 1000, 0.25) * speed`. horde
stops the sun with a slider on the skydome3d row's `rate`. `testbed.mjs` holds the page rather than
the truth (section 3).

## 12. Errors on the page

A testbed that freezes silently costs a round of guessing, so every page catches what breaks and
shows it. The basic page keeps the last five in the readout, with `console.error` wrapped so what a
plugin only logs shows too (section 1). The others:

- **The stack over the page, kept on `window.__error`** (castle, demo_wormhole, giantslayer,
  canyonracer, horde, paladin), the owed time dropped so the next frame does not catch up in a burst:

  ```js
  const shown = document.createElement('pre')
  shown.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;color:#ff8a80;font:12px monospace;white-space:pre-wrap;max-width:90vw;z-index:9'
  document.body.appendChild(shown)
  …
  } catch (e) { window.__error = e; shown.textContent = String(e?.stack ?? e); owed = 0 }
  ```

- **From the first line**: a classic `<script>` before the module, which runs before the module's
  imports are fetched, so an error while they load is kept too (rpg2d):

  ```html
  <script>
    window.errors = []
    addEventListener('error', e => window.errors.push(String(e.error?.stack ?? e.message)))
    addEventListener('unhandledrejection', e => window.errors.push(String(e.reason?.stack ?? e.reason)))
  </script>
  ```

- **A failed import shown**: farm imports everything with `await import(...)` inside a `try` whose
  `catch` writes the error over the page, so a module that will not load says so.

## 13. Readouts

- The seat's own row: `possessed(page.client.plugins.wire.rows)` from `#plugins/player/player.plugin.ts`;
  what it holds, `holding(rows)`.
- A scene's truth by name, `window.__scenes.get(name)`, or the scene the seat is on now,
  `scenes.get(page.name ?? chosen.scene)`.
- A plugin's own state: `loader.get(name)`, `plugins.store.get(key)`, `plugins.anim.model(row.id)`.
- A page that runs ahead: `page.stats`, `predicting`, `n`, `behind`, `corrections`, `drifts`,
  `checked`, `taken`, `missed`, `back`, `loads`, `differed`, `drifted` (mech, arcaderacer, doom,
  flight, vehicles, bullethell, cards, angrycircles).
- What a whole frame drew, every render in it, not only the last (arcaderacer):
  `r3.renderer.info.autoReset = false; r3.renderer.info.reset()` before the frame, then
  `window.drawn = { calls: info.calls, triangles: info.triangles }` after.
- What judders: render3d's `drifted`, hooked for each new render3d, logging every object the moment it
  drops off the blend between steps (demo_cutscene, vehicles):
  `stopWatching?.(); stopWatching = me.plugins.render3d?.drifted(d => console.warn(`drifted off the blend, step ${d.step}: ${d.path}`, { was: d.was, now: d.now, object: d.object }))`.
- Every frame's camera: `me.plugins.render3d.drew(d => window.drawn.push({ n: w.n, between: w.between, camera: d.camera }))`
  (demo_wormhole).
- A measure a script awaits (canyonracer): `window.__measure = seconds => new Promise(done => { … })`,
  resolved with the frames a second, the mean, the 95th and the worst frame; `await __measure(10)`.
- A readout that does not catch clicks: `pointer-events: none` on it, or a click on it reaches the
  window and asks for the pointer lock.

## 14. Bots and drivers

**The playtester** (giantslayer, skateboarding, rpg2d): `playtester` put into the scene's `plugins`
before the boot (section 4), and each new client handed the player and a think, the first frame it
holds the seat's own row (and whatever file the think reads), and again on every new client:

```js
if (bot && page.client && page.client !== handed && page.client.plugins.playtester && possessed(page.client.plugins.wire.rows)) {
  page.client.plugins.playtester.play(page.client.plugins.player, think)
  handed = page.client
}
```

A think is `(rows) => [action, ...args] | undefined`, sending one press a frame and only when what it
wants changes; a `stage` getter on it shows on the readout. A seat on a title with no player is moved
on as the title's button would (`c.plugins.scenemanager.go('town', 'new')`, rpg2d). `window.bot`
says where it is and what it has done.

**A cpu driver through the player's controls** (arcaderacer), "so the server takes its presses as this
seat's, and let go hands the car back with every control at 0":
`for (const name of Object.keys(CONTROLS)) if (Math.abs(wants[name] - car.data[name]) > 0.01) plugins.player[name](wants[name])`.

**Scripted presses** through the same controls (demo_audio's recorder):
`player.pedal(1); await wait(rec.throttle * 1000); player.pedal(0); player.brake(1)`.

## 15. Networks, the server and running ahead

A page that plays against the game's server dials it over a socket of its own, and runs the scene
ahead with `predict` in place of `view`; with `?tab` the manager truth is in the tab instead. Between
the page and either stands this seat's network, a `Net` handed to the loopback, both ways (mech,
arcaderacer, doom, flight, vehicles, sunrace, bullethell, cards, angrycircles):

```js
import { dial } from '#addons/socket/socket.addon.ts'
import { predict } from '#addons/predict/predict.addon.ts'
const leg = () => ({ delay: 0, jitter: 0, tail: false, loss: 0, burst: 0, reorder: 0, dup: 0 })
const presets = {
  clean: leg(),
  LAN: { ...leg(), delay: 5, jitter: 4, burst: 0.05 },
  'bad wifi': { ...leg(), delay: 40, jitter: 40, tail: true, loss: 0.01, burst: 0.2 },
  mobile: { ...leg(), delay: 90, jitter: 80, tail: true, loss: 0.03, burst: 0.3, reorder: 0.02 },
  awful: { ...leg(), delay: 150, jitter: 150, tail: true, loss: 0.08, burst: 0.4, reorder: 0.05, dup: 0.02 },
}
const net = { up: leg(), down: leg(), seed: Math.floor(Math.random() * 1e9) }
// This seat's network, both ways, kept in this browser between loads.
const store = '<game>.dev.net'
try { const saved = JSON.parse(localStorage.getItem(store) ?? 'null'); if (saved) { Object.assign(net.up, saved.up); Object.assign(net.down, saved.down) } } catch {}
const keepNet = () => { try { localStorage.setItem(store, JSON.stringify({ up: net.up, down: net.down })) } catch {} }
const time = { now: () => performance.now(), after: (ms, f) => { setTimeout(f, Math.max(0, ms)) } }
const url = `ws://${location.hostname}:${file.prefabs.scenemanager.port}`
const socket = send => { const w = dial(url)(send); return { take: up => w.send(up), close: () => w.close() } }
const truth = query.get('tab') === null ? undefined : boot(file, sim)
if (truth) await load(truth, import.meta.url)
const page = predict(link(loopback(truth ? accept(manager(truth)) : socket, time, net)), file, import.meta.url, mount)
```

The panel: a `presets` folder whose buttons set both ways
(`Object.assign(net.up, p); Object.assign(net.down, p); gui.controllersRecursive().forEach(c => c.updateDisplay()); keepNet()`),
and a folder each way, `down (server → page)` and `up (server ← page)`, with delay 0–400, jitter
0–300, tail, loss 0–0.5, burst 0–0.9, reorder 0–0.5 and dup 0–0.5, each `.onChange(keepNet)`. The
seed is new each load. A game whose server serves its own addon hands that to the loopback in place
of `accept` (arcaderacer's `match(manager(truth))`).

A scene against a server cannot be entered from the address; the page sends `go` to the scene's
scenemanager row once a scene (doom):
`page.client.plugins.wire.send(sm.id, 'go', wanted)`.

Two seats are two windows ("Chrome pauses a tab that is not in front"), one seat a page.

## 16. Audio

- **The last gain before the speakers**, found by wrapping `connect` before the boot, so a recorder
  listens there; the recorder's own sink marked so it is passed over (demo_audio):

  ```js
  let master
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (to, ...rest) {
    if (to instanceof AudioDestinationNode && this instanceof GainNode && !this.ours) master = this
    return connect.call(this, to, ...rest)
  }
  ```

- **The sound captured on the audio thread**, so a stall of the page's thread drops nothing: an
  AudioWorklet loaded from a Blob url, posting every block (demo_audio):
  `registerProcessor('tap', class extends AudioWorkletProcessor { process([input]) { if (input[0]) this.port.postMessage(input[0].slice()); return true } })`,
  `ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' })))`.
- **Every sound started, counted** (farm2d `?listen`): `start` wrapped on `AudioScheduledSourceNode`
  and `AudioBufferSourceNode`, counting a buffer source once ("a buffer source has a `start` of its
  own, over the one every scheduled source shares"), and `decodeAudioData` on `BaseAudioContext`;
  `window.heard()` hands it all back with each context's `state`.
- **Everything else silent while one thing is heard**: the `sound` taken off the others' looks in the
  page's world and put back after (demo_audio's `solo`).
- **A context's latency**, fixed when it is made: the song stopped, a new context made with the
  numbers, the song loaded into it (demo_audiodaw, `Tone.setContext(new Tone.Context({ context: new AudioContext({ latencyHint: v }), lookAhead }))`).

## 17. Persist in the testbed

A game that keeps records attaches its store in the tab as its server does (citybuilder, farm):

```js
const store = await indexeddb(file.prefabs.persist.file)
for (const child of scenes(manager(truth)).values()) if (child.rows.some(r => r.kind === 'persist')) persist(child, store)
```

farm awaits each one's `loaded()` before laying rows out, so what it lays is what is kept.

## 18. Looking at it

`yarn dev`, then `http://localhost:<port>/games/<game>/dev.html?scene=<scene>`, the port the dev
server prints. In Chrome through `good-webviews`: read the state off `window.__scenes`, `window.__page`
and `window.__error` with `eval`, then look at the screenshot. A page behind other windows gets few
frames, so a timed event is waited on by reading the rows until it has happened, and the frame rate is
read from the profilers (`benchmarking-a-game`), never from a page in the background. Motion is never
judged from screenshots: render3d's `drifted` and `drew` say what moved how (section 13).

## 19. Editing a cutscene

A game with a cutscene edits it on its dev page with the cutscene plugin's panel
(`plugins/cutscene/cutscene.panel.ts`; the plugin's README, Editing a cutscene on the dev page). The
page calls `edit` when its address has `?cutscene`, before it boots anything of its own, and does
nothing else then (mech):

```js
import { edit } from '#plugins/cutscene/cutscene.panel.ts'
const query = new URLSearchParams(location.search)
if (query.get('cutscene') !== null) {
  document.getElementById('readout').remove()
  await edit({ file, sim, base: import.meta.url, scene: query.get('cutscene') || file.prefabs.scenemanager.entry })
} else {
  // … the page as it is
}
```

`edit` takes the page over: the game booted behind core's recorder entering the scene, the scene's own
rule starting the cutscene, every skip held off, the game drawn above a panel across the bottom (the
timeline, the cue's form, Look, Undo, Revert and Save). Its Save and the cue file's own check
(`assets/<cue file>.ts`'s `failing`) are the dev server's (`cutscene.serve.ts`, in `vite.config.ts`),
so it is opened from `yarn dev` or `yarn serve <game>`. `window.cutscene` is what the panel holds.
