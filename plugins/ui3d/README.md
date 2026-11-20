# ui3d

Things in 3D over the game, in render3d's overlay: a menu of models hanging in front of the camera, a
held card, a choice of fighters turning in the air. The game makes each thing; ui3d puts it in the
overlay, stands it in the camera's frame every frame, moves and lights it by its words, hit-tests it
under the pointer, and lets the pointer and the keys select and press it.

## Why use it

Use ui3d when what the player reads or presses is a model rather than a flat panel: a weapon wheel of
the weapons themselves, a title screen whose buttons are objects, an inventory of things that turn
when picked. Actors write plain three.js; ui3d adds the show-every-frame lifecycle the `ui` plugin
has (a thing nobody shows is taken out, so nothing needs tearing down), placing in the camera's frame,
a menu with a selection the pointer and the keys share, and words that make a selected thing grow,
glow or dim the rest without the game touching a material.

## How it works

ui3d has a browser half only and no row; no packet carries any of it. `world.ui3d` holds:

- `overlay`: `[near, far]`, the overlay camera's own, in metres.
- `keys`: `next`, `previous`, `press`, each a key or a list of them as the player plugin names keys
  (`keyOf`).
- `looks`: the name of a `json` entry of the scene's loader catalogue, a file of looks by name (below).
- `mods`: `{ behaviors: ['<a>', …] }`, the plugins that deliver words of their own.

**Looks by name.** A scene's looks file is `{ "<name>": look, … }`; a look of it may give `model`, a
`model` entry of the catalogue. `show(key, name)` shows the file's look of that name, its thing a copy of
the model with materials of its own, from the first frame the file and the model have landed;
`show(key, make, name)` shows it on a thing the game makes. A name the file has none of throws, and so
does `show(key, name)` of a look with no `model`. The file written while the game runs is shown as it
now is from the next frame. The particle workshop finds every looks file of a game's scenes and shows
its looks on its stage (its ui3d mode, `tools/workshop/README.md`). Never name the file `looks.json`:
the dev server answers that name with the engine's list of kinds that have a look.

**Showing.** `show(key, make, look)` in an actor's `tick`, every frame it wants the thing: `make`
runs the first frame and hands back the THREE object (or undefined while it cannot yet, a model still
coming, and is asked again the next frame); the same object comes back every frame after. A key shown
twice in one frame throws. A frame nobody shows a key takes its thing out of the overlay; the object
stays the game's to let go. A thing shown again after that is new, its clock started again.

**Where a thing stands.** Each thing hangs in a holder of ui3d's, which every frame stands in the
camera's frame: `look.at` is metres right, up and ahead (−z) of render3d's camera, turned as the
camera is so it faces it, and `look.scale` its size (1 when left out). The object is put back each
frame where it stood in its holder when it was made; its words move it from there.

**Words.** Every field of a look but `at`, `scale` and `select` is a word, its value that word's
numbers. Each frame, for each thing, ui3d runs each of its words in the order the look gives them,
handed the numbers and `{ key, holder, object, selected, chosen, age, camera, T, plugins }`: whether
it is the selected thing, whether any thing is, the seconds since it was first shown, the camera's
place `p` and turn `q`, and THREE. A word that moves the holder moves the thing and its hit box (a
sway, a fly-in); one that moves the object moves the thing alone (a grow whose box stays its size).
ui3d's own words:

- `grow { scale }`: the selected thing's object `scale` times its size.
- `glow { colour, power, materials? }`: the selected thing's materials give off `colour` × `power`.
- `dim { by, materials? }`: while a thing is selected, every other thing's materials' colour `by` times
  itself.

`materials` names the materials touched by their `name`; left out, every material of the object. Each
material's `color`, `emissive`, `emissiveIntensity` and `opacity` are put back at the start of the next
frame, so a word changes them for one frame and the game's own setting stands. Every other word comes
from a mod, `<a>.ui3d.ts` exporting `behaviors()`, `{ <word>: Behavior }`, named in
`world.ui3d.mods.behaviors`; a delivered word takes the place of ui3d's own of that name, and a later
mod's the place of an earlier one's. A look giving a word nothing delivers throws, naming the thing and
the word.

**Selecting.** A look with `select: true` can be selected; those shown in a frame, in the order they
were shown, are the menu. One is selected whenever there is one: the first, until the pointer or a key
moves it, and the first again when the selected thing is no longer shown. Each has an invisible box made
from its object the first frame it has geometry, hanging in its holder, so it moves, turns and sways
with the thing and is never sized by a word on the object. Each frame a ray from the pointer through the
overlay's camera finds the first box of a thing shown and visible: the thing under the pointer. When
that becomes another thing, it is selected; when it becomes none, the selection stays. A press and a
release over one thing press it and select it. `next` and `previous` move the selection, stopping at
either end, and `press` presses it. While the menu has things its keys' defaults are cancelled; while
the player plugin listens for a key to rebind, ui3d takes none. Over a thing, the cursor is the
pointer's.

**What it hands back.** `show`, `look(name)` (the looks file's look of that name, or undefined until the
file has landed), `selected()` (the selected thing's key or undefined), `pressed()` (the
key pressed this frame or undefined), `select(key)` (selects a thing of the menu, and throws for any
other), `environment(texture)` (what the overlay's things reflect, a PMREM texture or null).

One per client; `close` takes every thing out of the overlay, disposes the boxes, lets go of the
listeners and the cursor, and clears the overlay's environment.

## Using it

1. List `ui3d` in `plugins` before `render3d`: its `afterTick` places what render3d draws that frame,
   and it throws when listed after. Give `world.ui3d: { overlay: [0.05, 20], keys: { next:
   'ArrowDown', previous: 'ArrowUp', press: ['Enter', 'Space'] } }`.
2. In a kind's `<kind>.client.ts` tick:

   ```ts
   const sword = plugins.ui3d.show('sword', () => plugins.loader.model('sword'), {
     at: [-0.3, 0, -1], select: true, grow: { scale: 1.2 }, glow: { colour: '#ffcc66', power: 2 }, dim: { by: 0.4 },
   })
   if (plugins.ui3d.pressed() === 'sword') /* the seat chose the sword */
   ```

3. A word of the game's own: a plugin of the game's writes `<a>.ui3d.ts` exporting `behaviors()`, and the
   scene names it in `world.ui3d.mods.behaviors`.
4. Particles on a thing: name `particle3d` in `world.ui3d.mods.behaviors`, and give the look `particles`,
   a list of `{ effect, at, drivers? }`: each effect of the effects file kept running at `at` in the
   thing's frame while it is shown, its drivers held at the thing's `selected`, `chosen` or `age`
   (`plugins/particle3d/particle3d.ui3d.ts`). List `ui3d` before `particle3d`.
5. A game's logo title, a look by name with its word and its particles: the `using-ui3d` skill.

ui3d ticks before the actors, so a press and a selection are read the frame they happen; its words run
in its `afterTick`, after every actor, so a game sets a thing's finish in its `tick` and a word changes
it for the draw.

## Plugins it works with

- **render3d**: ui3d places every thing in its overlay, sets the overlay camera's `near` and `far`, and
  reads its camera and canvas.
- **player**: the keys named as it names them (`keyOf`), and none taken while it listens to rebind.
- **loader**: the looks file and the models of the looks it shows by name, and the models a game
  shows through it.
- **particle3d**: delivers `particles`, effects on a thing driven by its state.
- **ui**: the flat HUD beside it; ui3d's `show` works as ui's does.

## Keywords

3D UI, 3D menu, diegetic UI, overlay, model menu, weapon wheel, character select, title screen in 3D,
inventory, selection, hover, pick, raycast, hit box, pointer, keyboard navigation, highlight, grow,
glow, dim, emissive, behaviors, words, `show`, `look`, `selected`, `pressed`, `select`, `environment`,
`world.ui3d`, `world.ui3d.looks`, `world.ui3d.mods`, looks file, logo, title, attract mode, particles,
drivers
