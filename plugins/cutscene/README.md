# cutscene

In-engine cutscenes played from a cue file: camera shots and dollies, a cast of the scene's own rows
walking, facing, playing clips and speaking lines, fades, letterbox bars, camera shake, sound,
music, waits that hold the timeline, skip for every seat, and a scene change at the end. The same on
every seat, including one that joins mid-scene.

## Why use it

Use cutscene for an intro, a story beat, a boss entrance, a mission briefing, a level fly-over or an
ending, played with the game's own characters in the game's own world rather than a video. One row
drives it, so every seat sees the same shot on the same frame, and a cue file is plain data a
designer edits.

## How it works

**Server half (`cutscene.sim.ts`).** `cutscene(height)` is the `cutscene` kind, built from the
ground's height (`height(w, x, z)`, terrain3d's `heightAt`, or `() => 0` for flat ground). The scene
holds one `cutscene` row (its prefab is `{}`) and any `mark` rows, named spots `{ name, at }`.

- The row keeps two clocks: `e` always advances (shots, fades, bars, shakes and lines run on it, so a
  dolly keeps moving through a wait) and `t`, the cue clock, which a `wait` holds. A cue fires on the
  first step `t` reaches its `at`.
- When the scene starts, each cast member (`cast: { name: { kind, name } }`) is matched to the first
  row of that kind with that `name`. The cutscene directs a member by writing `direct { walk, face,
  play, gesture }` on its row, which the member's own `tick` obeys; while `direct` is set the member
  ignores its player's stick.
- Points are `[x, z]` on the ground or `[x, up, z]` above it, so raised ground raises the mark and the
  camera with it. A target is a cast name, a mark's name, or a point.
- `start` (closed: only the game's rule calls it) or `auto` starts it; `reset` puts it back to before
  it started; `skip` is open, so any seat skips for every seat, and the row plays the rest through
  inside one step, leaping quiet stretches, so the cast ends where a played scene would leave them.
- At the end `direct` is null on the cast (control returns) and, with `go`, every row of the kinds
  `kinds` names is sent `go(go, ...arrive)`, moving the seats to the next scene.

`check(name, file)` throws a sentence naming the file and cue for anything it cannot play, and every
misspelt name throws at the start. `pose(d, rows, height)` is the camera a shot draws; `shaken` the
shake; `level` a fade or bar ramp; `longest(file)` the most seconds a file can play.

**Browser half (`cutscene.plugin.ts`).** While a shot runs it claims render3d's camera
(`render3d.claim`) and places it from `pose` plus `shaken`, read off the rows every frame (nothing
eases on the page), and gives the camera and its fov back when the scene ends. It draws the bars
(`cutscene.top`, `cutscene.bottom`), the fade veil (`cutscene.veil`) and the spoken line
(`cutscene.line`, `who: text`) on ui's panels. On a frame a shot runs and its camera cannot be placed
yet (the land's ground not there, or a member the shot names not among the rows), the world is
covered in black in render3d's overlay, so no bare frame shows; `plugins.cutscene.waiting()` is true
while it is, so a game can show a spinner on the ui over it. A delivered step's page half is ticked
each frame after the camera is placed. A `prepare` cue hands the land a point to make ready
ahead of a cut there.

## The cue file

A loader `json` entry with `end`, `go?`, `arrive?`, `auto?`, `reach`, `stop`, `head`, `fov`, `pace`,
`limit`, `cast` and `cues`, each cue `{ at, do, ... }`:

| do | fields | what it does |
| --- | --- | --- |
| `play` | who, clip, holds, rate | a whole-body clip on the member |
| `gesture` | who, clip | an upper-body clip |
| `walk` | who, to, gear, limit? | walks to `to`, at a gear clip's speed or `pace` |
| `face` | who, to \| null | turns toward `to` while not walking; null lets go |
| `say` | who, text, for, voice? | the line for `for` seconds, with an optional voice cue |
| `wait` | who \| "line" \| on | holds the cue clock until the walk is done or the line has gone, or, with `on` a delivered step's word, while that step says it holds |
| `shot` | name, pos, look, fov?, over, follows?, frame? | a cut (`over` 0) or a dolly; `follows` a member, `frame: "body"` in its own axes |
| `fade` | to, over | to black (1) or clear (0) |
| `bars` | on, over | letterbox in (1) or out (0) |
| `shake` | over, amp | camera jitter decaying to nothing |
| `sound` | cue, where? \| who? | a sound at a place or from a member |
| `music` | name \| "" | the row's `music` |
| `prepare` | where | the land made ready ahead of a cut there |

## Steps a game brings

The steps above are cutscene's own. A game puts steps in its own words in the same cue file, its
`open`, `spawn` or `rain`, as behaviors: a plugin of the game's writes `<a>.cutscene.ts` beside itself,
exporting `behaviors()`, `{ <word>: <step> }`, and the scene names it in
`world.cutscene.mods.behaviors: ['<a>', …]` (with `<a>` in `world.shipped.plugins` for a game's own
plugin). The cue is written as any other, `{ "at": 3, "do": "open", "who": "gate", "over": 2 }`.

A step (`Step` in `cutscene.sim.ts`) is

- `fields`: its fields and their rules, each one of `RULES` (`who`, `target`, `positive`, `text`, …),
  so the file is checked against them when it is read, and a place it names is looked for among the
  cast and the marks at the start;
- `fire(f)`: what it does when its `at` is reached, handed the row, the truth `w`, the cue, the cast
  member its `who` names, `where(t)` and `on(t)` (a target's point, and its ground point), `state`
  (what it keeps on the row under its word, `steps.<word>`), and `loud`, false while a skip plays the
  scene through, so it still acts on a skip and stays quiet where it should;
- `wait?`: `{ holds(d, w), longest(file) }`, so `{ "do": "wait", "on": "<word>" }` holds the cue clock
  until the step is done, and at most `longest` seconds;
- `page?`: `{ tick(plugins, d), close?() }`, its browser half, ticked every frame after the camera is
  placed, for a step that draws something.

Delivered words are looked up first: a later plugin's word takes the place of an earlier one's, and a
delivered word takes the place of cutscene's own of that name, only in a scene that names its plugin.
A word nothing has is refused when the file is read, `open is not a cue: no plugin
world.cutscene.mods.behaviors names delivers it`. `games/demo_cutscene` brings `open` and `spawn`
this way (`plugins/stagehand/stagehand.cutscene.ts`).

## Using it

1. In the game's sim, add `cutscene(heightAt)` (or `cutscene(() => 0)`) and `mark` to its kinds.
2. List `cutscene` after `render3d` and before `chasecamera3d` and `ui` in `plugins` (otherwise its
   tick throws), add a `cutscene` row, and give `world.cutscene: { script, kinds, settle, tremor,
   mods }`: the cue file, the kinds a cast member may be, the seconds of each quiet stretch a skip
   steps through, the shake's `[weight, rate]` per axis, and the mods.
3. List the audio ledger's actor ahead of the cutscene row, so its sounds are stamped with their own
   step.
4. Make each cast kind obey `direct` in its `tick` (walk with walker's `seek`, face, play and gesture
   through anim), and give it the acts `advance(dt)` and `go(scene, ...arrive)`.
5. Give `world.ui` the `cutscene.top`, `cutscene.bottom`, `cutscene.veil` and `cutscene.line`
   panels and styles, if the file uses bars, fades or lines.
6. Call the row's `start` act from the game's rule, or set `auto`.
7. For steps in the game's own words, write `<a>.cutscene.ts` beside the game's plugin and name it in
   `world.cutscene.mods.behaviors` (Steps a game brings).

## Editing a cutscene on the dev page

The plugin ships a panel for editing a scene's cutscene on the game itself, `cutscene.panel.ts`. A
game's `dev.html` turns it on with one call, before it boots anything of its own:

```js
import { edit } from '#plugins/cutscene/cutscene.panel.ts'
const query = new URLSearchParams(location.search)
if (query.get('cutscene') !== null) await edit({ file, sim, base: import.meta.url, scene: query.get('cutscene') || file.prefabs.scenemanager.entry })
```

Then `yarn dev` and `games/<game>/dev.html?cutscene` (or `?cutscene=<scene>`). What you get:

- **The real game, scrubbable.** The game is booted behind core's recorder (`addons/recorder`) and
  enters the scene. The scene's own rule starts the cutscene, as it does in the game (mech's curtain
  once the art has loaded). Any skip sent to the cutscene is held off, so a click or a key while
  editing never skips it. Drag the ruler to scrub; letting go replays the game to that moment.
- **A panel across the bottom**: ⏮ Start, ◀ Frame, ▶ Play (from the playhead), ⏸ Pause, Frame ▶,
  End ⏭ and ⏹ Stop (Space, `,`, `.`, Home and End too), the playhead, the problems,
  Help (a short guide to the panel, shown where the form is until pressed again), Undo (also ⌘Z),
  Revert and Save; the timeline, a lane per cast member then camera, say, sound and
  screen, each with `+`; and the form of the cue selected, with a field for every field of every cue,
  the game's own steps included.
- **The shots in 3D.** With Look off the view is an orbit camera, each shot's camera drawn as a small
  frustum with its name, marks as rings and the cast's paths. Click a camera to select its shot, then
  drag it with the gizmo. **Look** on the camera lane shows the real shot, with its bars and fades.
- **Every change plays at once**: the scene is replayed with the changed file. Save writes the cue file
  into the game, after the dev server has checked it the same way.
- **The game's own check.** When a script of the cue file's name stands beside it (`assets/intro.ts`
  beside `assets/intro.json`) exporting `failing(script)`, the dev server runs it a second after each
  change and every frame it hands back, `{ shot, e, text }`, is drawn red on the camera lane and listed
  among the problems.

The pieces: `cutscene.cues.ts`, the cue logic (the model, every edit, the check before a change, the
measure pass); `cutscene.timeline.ts`, the timeline;
`cutscene.serve.ts`, the dev server's half, a Vite plugin in the repo's `vite.config.ts` answering
`/@cutscene/save` and `/@cutscene/check`; `cutscene.cued.ts`, the node process each of those runs.

## Plugins it works with

- **render3d**: the camera it claims and places.
- **chasecamera3d**: listed after cutscene, it takes the camera back the frame the cutscene lets go.
- **ui**: the bars, veil and line are drawn on its panels.
- **audio**: the mod `audio.cutscene.ts` (`world.cutscene.mods: { play: 'audio' }`) sounds sound and
  voice cues on the ledger.
- **terrain3d**: the mod `terrain3d.cutscene.ts` (`mods: { land: 'terrain3d' }`) stands the page's
  points on the land, and `prepare` readies the land ahead of a cut; the server half is built on
  terrain3d's `heightAt`.
- **anim** and **walker**: a cast member plays its clips through anim and walks by walker's `seek`.
- **loader**: the cue file is a `json` entry.
- **scenemanager**: `go` at the end moves every seat to the next scene.

## Keywords

cutscene, cinematic, in-engine cinematic, intro, story, dialogue, subtitles, lines, camera shot, cut,
dolly, camera path, follow shot, letterbox, black bars, fade to black, fade in, camera shake,
screen shake, cast, actors, director, timeline, sequencer, cue file, script, wait, skip cutscene,
music, voice over, scene transition, boss intro, fly-over, `start`, `skip`, `reset`, `direct`,
`world.cutscene`, behaviors, custom cue, game's own step, `world.cutscene.mods.behaviors`, `Step`,
cutscene editor, edit a cutscene, dev page, `dev.html?cutscene`, scrub, panel, save the cue file,
failing frames, `failing`
