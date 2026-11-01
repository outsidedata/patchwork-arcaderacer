---
name: experimenting-with-features
description: Use in core, or any clone of it, whenever Bill says "I want to experiment with", "let's try", "can we see if", "build me a demo of", or asks for a feature whose behaviour nobody knows yet (a new kind of physics, a new way of drawing, an effect, a mechanic). Covers getting both repos healthy first, the chain of "can I" questions, building each step in a scene of its own reached from the game's dev.html, the dev.html testbed (scene from the address, live definitions, the lil-gui panel wired so it never breaks the game's keys or mouse, the error overlay, the console readout), checking each step in Chrome before handing over a link, committing as each step works, and pinning tests only once the behaviour is known.
---

# Experimenting with features

An experiment is building something whose behaviour nobody knows yet, one small visible step at a
time, with Bill checking each step in his own browser before the next starts. It is how horde's
dismemberment and its box3d ragdoll were found: every step a question with a yes or no that a page
shows, and nothing built on a step he has not seen.

It is not a shortcut around the prime directive. Everything still goes in its home; an experiment's
home is the game it is run in, and it stays there (`prime-directive`, Core is not touched).

## 1. Healthy before anything

Check, in this order, and fix what is wrong before the first line of the experiment:

- **Both repos on the same branch.** `git -C <core> branch --show-current` and
  `git -C <core>/games branch --show-current`. `games/` is its own repo. Work on the branch Bill
  names, or the game's branch; never a branch per step.
- **Nothing half done.** `git status --short` in both. Uncommitted work that is not this experiment's
  is asked about, never stashed and never reset.
- **The pages are served.** `yarn dev --port <port>` in the background (any free port), which serves
  `games/<game>/*.html`. Read its first lines for the port. Leave it running.
- **The game's own test passes** before anything changes (`yarn vitest run games/<game>/<game>.sim.test.ts`),
  so a failure later is the experiment's.
- **Never run `open <url>`** on Bill's machine: it brings up macOS's emoji keyboard there. Give him the
  link to load himself.

## 2. The chain of "can I"

Before building, write the experiment as a chain of questions, each answered by something Bill can see
or a number read off the rows, each one standing on the one before:

1. Can I make the thing exist, still (bodies spawned where the bones are, drawn as wireframes)?
2. Can it do the simplest thing (fall apart with no joints)?
3. Can the next piece hold (one joint; then all of them)?
4. Can the drawn model follow it?
5. Can the real trigger cause it (an explosion, a shot)?
… and so on, one visible step each.

Show Bill the chain and agree it. When there is an issue for the work, the chain and the decisions go
into the issue's description as a checklist (`gh issue edit`), and the description is rewritten as the
settled design once the experiment answers its questions: no leftover open choices.

## 3. Where an experiment lives

- **A scene of its own** in the game, beside the game's main scene: a `<name>.scene.json` and
  `<name>.sim.ts`, listed in the manager's `scenemanager.scenes`. It holds only what the experiment
  needs (a body, a charge, a floor), so nothing else in the game moves when it changes.
- **The game's own plugins** for anything shared (`games/<game>/plugins/<name>/`, its server half
  imported by the kinds, its page half and its mods listed through `"shipped"` and
  `world.shipped.plugins`). Core's plugins are used as they are.
- **Numbers in the files**: the kinds' definitions in `assets/<game>.json`, plugin numbers on the
  scene's `world`. Nothing is written in code.
- Once the chain is answered, Bill decides what moves to core; that is planned, asked and built as
  `building-a-plugin` says.

## 4. The testbed, `dev.html`

Every experiment is reached through the game's `dev.html` (`using-the-dev-page`, where every part of
the testbed below is gathered with the rest of what the game pages do): never
`index.html` or `client.html`. It is `index.html` with these added, each before the boot unless
said:

```js
import GUI from 'lil-gui'
import { prepared } from '#plugins/loader/loader.sim.ts'
import { scene as theScene } from './<scene>.sim.ts'

// The scene the address names: dev.html?scene=<scene>
file.prefabs.scenemanager.entry = new URLSearchParams(location.search).get('scene') ?? '<main>'
// The tab's one copy of the definitions: every rule and look reads this object, so the panel's edits
// reach the next step.
const defs = await prepared(theScene.world, theScene.world.defs)
```

After `load`, the truths for the console, so a step's state is read off the rows, not guessed from a
picture:

```js
const scenes = await load(truth, import.meta.url)
window.__scenes = scenes   // __scenes.get('<scene>').rows
```

**The panel**, exactly as below. The player plugin listens on the window, so a press
on the panel must stop at it, but a release must not, or a button held in the game and let go over the
panel never lets go; and the focus must come back to the page after a click, or the game's keys go
dead the moment a slider is touched:

```js
const gui = new GUI({ title: '<game> dev' })
for (const type of ['keydown', 'keyup', 'click', 'mousedown', 'contextmenu', 'wheel'])
  gui.domElement.addEventListener(type, e => e.stopPropagation())
gui.domElement.addEventListener('pointerup', () => requestAnimationFrame(() => {
  const at = document.activeElement
  if (gui.domElement.contains(at) && !(at.tagName === 'INPUT' && (at.type === 'text' || at.type === 'number'))) at.blur()
}))
addEventListener('change', e => { if (gui.domElement.contains(e.target)) e.target.blur() })
```

Never `mouseup` or `pointerup` in the stopped list. Controls edit `defs` (or a scene's `world`) in place,
`folder.add(defs.<kind>, '<field>', min, max, step).name('<what> (<unit>)')`, read by the rule at the
moment it uses them; an action is a button, `folder.add({ go: () => … }, 'go').name('…')`, writing the
row it acts on through `scenes.get('<scene>').rows`.

**The error overlay**: the loop wrapped so an error in a step or a frame is shown over the page and kept
on `window.__error`, and the loop goes on. A testbed that freezes silently costs a round of guessing:

```js
const shown = document.createElement('pre')
shown.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;color:#ff8a80;font:12px monospace;white-space:pre-wrap;max-width:90vw;z-index:9'
document.body.appendChild(shown)
const loop = async now => {
  try { /* index.html's loop body */ } catch (e) { window.__error = e; shown.textContent = String(e?.stack ?? e); owed = 0 }
  requestAnimationFrame(loop)
}
```

## 5. Each step

1. Build the step: the smallest change that answers its question.
2. Check it yourself in Chrome (`good-webviews`): load `dev.html?scene=<scene>`, read the state off
   `window.__scenes` and `window.__error` with `eval`, then take the screenshot and look at it. The test
   Chrome's tab runs behind Bill's windows, where `requestAnimationFrame` is slowed: a timed event (a
   fuse) is reached by reading the rows until it has happened, never by a longer wait. When the page
   shows nothing, run the scene on node with a throwaway probe (boot, step, print the rows), delete it,
   and say which side broke.
3. Hand Bill the link and what to press, in a line or two. Say what the numbers showed and what was not
   checked. A screenshot is never evidence of how something looks or behaves: it is read wrong (an arm
   foreshortened from behind the gun was taken for an arm sticking up). Claims come from numbers read
   off the rows; whether it looks right is Bill's to judge.
4. Stop. He looks. When he says it works, commit it (`git -C <repo> commit`, both repos where both
   changed) with a message saying what now works, and go to the next step. When he says it is wrong,
   fix it; do not stack a new step on it.

Keep each reply short. Bill reads the page, not the report.

## 6. Tests come last

An experiment's behaviour is not known until Bill has seen it, so no test is written to pin it while it
is being found: a test written first pins a guess. When a step is settled, a happy-path test for it goes
beside the file it proves (`proving-a-game`), reading what it checks off the scene and the definitions.
A throwaway probe is not a test: it is deleted the moment it has answered.

## What went wrong before, and why

| What happened | Why | Now |
|---|---|---|
| Bill's machine showed the emoji keyboard | `open <url>` was run on it | Give him the link |
| The game's keys died after a slider was touched | the panel kept the focus and stopped key events | The panel block above, with its blur |
| Fire stuck on after letting go over the panel | `mouseup` was stopped on the panel | Never stop a release |
| A skinned body's hair and shirt blinked out mid-crawl | three culls a mesh by its rest-pose bounds | `frustumCulled = false` on a body whose animation leaves its rest bounds |
| The reticle and the tracer disagreed | rounds left the muzzle, the camera sat above it | A round runs on the line under the reticle, from the eye |
| A severed arm fell through the floor | its capsule came from a fixed guess, the mesh from the real pose | Every body is placed from the pose it is cut from |
| A demo "froze" | the test tab's frames were slowed, the fuse had not run out | Read the rows before deciding |
