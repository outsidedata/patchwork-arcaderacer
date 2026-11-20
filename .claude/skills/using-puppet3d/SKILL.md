---
name: using-puppet3d
description: Use when a body is posed by procedure through puppet3d - an animal on four legs, a body walking upright, any rigged body (AWOL, Mixamo or other) turned by cues - when writing a kind's puppet3d definition, a body's sheet, a cue sheet (`<name>.cues.json`, the library's `cues/`), a solver a game delivers to puppet3d (`<a>.puppet3d.ts`), the land it stands on (`world.puppet3d.mods.land`), its capsules for hair and particles to meet (`world.puppet3d.capsules`), cues made from clips with `puppet3d.cues.py`, or clips made from a body with `puppet3d.clips.ts` for crowd3d, and when puppet3d throws about a word, a bone, a cue or a sense.
---

# Using puppet3d

The facts are the header of `plugins/puppet3d/puppet3d.plugin.ts` and of each file beside it. This says
how the pieces fit.

## The definition is the body

`world.puppet3d.kinds` lists the kinds puppet3d draws. Each kind's definition says how:

- `senses`: each sense its cues read, named to its source (`clock`, `velocity`, a row's own field:
  `rowSpeed`, `rowStride`, `rowFlight`, `rowJump`, `rowUpright`; or a source a solver gives off, such as
  `sprawlStride`).
- `layouts`: its bone layouts, each with its `layout` name, what it hangs `on`, its `skeleton` and
  `skin` entries, and its `drivers`.
- each driver is a `solver` (with `gait`, the body's sheet, `cues`, the cue sheet of the bones it
  does not stand, and `leap: { count, height }`, two fields of the row, for a solver that leaps) or a
  cue sheet alone (`cues`), and every driver has a `weight`, cues on the senses, from 0 to 1.
- a layout hangs `on` the `world` (exactly one of a kind's) or on a bone of a layout written before it
  (`<layout>:<bone>`, with `along`, `offset` and `turn`): demo_puppet3d's rider on its horse.

## What the body stands on, wears and is met as

- **The land.** `world.puppet3d.mods.land: 'terrain3d'` (`plugins/terrain3d/terrain3d.puppet3d.ts`)
  stands the bodies on terrain3d's land, their feet put down on it. terrain3d is listed before
  puppet3d. With none, a body stands at its row's own height.
- **Hair.** A mane, a tail or a coat is hair3d's: `world.hair3d.mods: { skins: ['puppet3d'],
  behaviors: ['render3d'] }` (`plugins/puppet3d/puppet3d.hair3d.ts`). A wearer's kind is its row's kind,
  its skins the skinned mesh of each of its layouts, named as its glb's mesh is. A hair's `on.bones`
  name its bones as the skeleton file does (`neck`, `tail 5`). demo_puppet3d's horse wears `horseMane`
  and `horseTail`, its lion `lionMane` (`using-hair3d`).
- **Capsules.** `world.puppet3d.capsules`, which a scene may leave out, is `{ <kind>: [{ from, to,
  radius }, { bone, at, radius }] }`: a capsule between two bones, or a ball a bone carries, each bone
  named by the end of its name. With `"gpgpu3d": { "reach": 60, "mods": { "things": ["puppet3d"],
  "behaviors": ["anim"] } }` gpgpu3d holds them: hair lies on the body once `world.hair3d.mods` names
  `solids: 'gpgpu3d'`, as the demo's does, and gpuparticle3d's particles bounce off it
  (`plugins/puppet3d/puppet3d.gpgpu3d.ts`). A capsule is anim's word, so `anim` is named
  under `behaviors`; anim itself is not listed. demo_puppet3d's horse is three balls, on `neck`,
  `chest` and `pelvis` (`using-gpgpu3d`).
- **A crowd.** crowd3d's people made from a body's clips (Clips from a body, below) wear hair through
  crowd3d's own mods, `{ skins: ['crowd3d'], behaviors: ['crowd3d'] }`, and hand gpgpu3d nothing.

## Cue sheets are files

A cue sheet is `<name>.cues.json`, a loader `json` entry the driver names in `cues`:
`{ <bone>: { bend, swing, twist } }`, each angle a list of cues, for the bones it names and no others.
Sheets are kept as clips are, in the library's `cues/` (`$PATCHWORK_LIBRARY/cues/README.md` lists them:
roar, graze, wag, ears and look for AWOL animals, nod and wave for Mixamo bodies). Every armature of one
family has the same bone names, so a sheet plays on any body that has its bones; a bone it names that
the body has not got is not played. A game copies the sheets it plays into `assets/cues/` in its bake
(`games/demo_puppet3d/assets/demo_puppet3d.bake.ts`) and lists each in its catalogue. A sheet two
drivers name is one file.

## Drivers are layers

A layout starts at its rest pose, and its drivers are laid over it in the order written. Each driver
poses only the bones it names (a solver names every bone of the layout it stands; a cues driver, the
bones its sheet lists), and turns each from where the drivers before it left it toward its own pose, by
its weight. The turn is each bone's from the bone it hangs on, so a neck a roar moves stays on the spine
the walk under it moves.

- A driver at 1 takes its bones over; at 0.33 alone it poses them a third of the way from rest.
- A crossfade is two drivers, the second laid over the first by its weight.
- A roar or a head turn is a cues driver naming only its bones, written after the walk, its weight
  fading it in and out: demo_puppet3d's lion roars every ten seconds over its walk (`weight` keyed by
  `clock` with a `period`), its cheetah grazes when it stands (`weight` keyed by `speed`).

A body's sheet holds its solvers' numbers, one block per solver: `walk` for the
`pureQuadrupedDriver`, `upright` for paddock's `upright`.

## A solver is a mod

A solver is a word in puppet3d's table, `world.puppet3d.mods.behaviors`. Each plugin named there
exports `behaviors()` from `<a>.puppet3d.ts`, returning `{ <word>: Solver }` (`block`, `make`, `step`,
`leap`, `senses`, `bones`, typed in puppet3d's header). puppet3d's own `pureQuadrupedDriver` comes
from its own mod, `plugins/puppet3d/puppet3d.puppet3d.ts`, listed as `puppet3d`. A word nothing
delivers throws.

A game delivers a solver of its own the same way: `games/demo_puppet3d/plugins/paddock/paddock.puppet3d.ts`
delivers `upright`, a body walking on its hind legs, and the scene names it:
`"behaviors": ["puppet3d", "paddock"]`, with `paddock` in `world.shipped.plugins`. Its animals carry
both drivers, weighed by `rowUpright`.

## Cues from clips

A body with no solver is posed by cues drivers alone. A Blender program beside the plugin writes their
sheets from clips:

```
Blender -b --factory-startup --python plugins/puppet3d/puppet3d.cues.py -- <body.fbx> <layout> <skeleton entry> <skin entry> <out.json> stride=<walk.fbx>,<sheet entry>,<walk.cues.json> clock=<idle.fbx>,<sheet entry>,<idle.cues.json>
```

It writes two sheets, a walk keyed by `stride` over one cycle and an idle keyed by `clock`, and a
definition whose two drivers play them, weighed against each other by `speed`, with `stride`, the walk's
metres per cycle. The X Bot in `games/demo_puppet3d` is posed this way.

## Motions made on the animal: the workshop

`yarn workshop puppet3d <game>` opens `/puppet3d?game=<game>` (`&kind=<kind>` one animal straight away):
a kind of the game moved over flat ground by the plugin's own `stand`, `stepped`, `sensed` and `stood`,
with the solvers its scene's mods deliver, so it is what the game draws. Cue content is made here, never
by typing angles into a sheet:

- set what the animal is doing (standing, each of its paces, turning, on its hind legs, a leap);
- pick one of its motions (its drivers), leave one out, take one off, or **Give it another**: a sheet of
  the library's `cues/` that moves one of its bones, copied into the game's `assets/cues/`, listed in
  the scene's catalogue and added as a driver;
- set when the motion plays (its `weight`): all the time, every so often, while standing, while moving;
- pick a part (a dot on the animal) and turn it by its three rings, or set each angle's **held at**,
  **sways** and **every**; **Stop moving** takes the part out of the sheet;
- a solver's motion shows its block of the body's sheet, each number read on its next step;
- **Save** writes the timing into the definitions file, the parts into the `<name>.cues.json`, a
  solver's number into its sheet; **Send to the library** copies a saved sheet over the library's.

`tools/workshop/README.md` says every control.

## Feet, measured

A node program beside the plugin poses a kind with the plugin's own code from a stand up to a speed,
holds it there and brings it back to a stand, on flat ground, and prints what its feet and body did:

```
node --experimental-strip-types plugins/puppet3d/puppet3d.feet.ts <scene.json> <kind> feet=<bone>,… body=<bone>,… speed=<m/s> accel=<m/s²> stand=<s> hold=<s> steady=<s> down=<m> mods=<a.puppet3d.ts>,… [row=<field>:<number>,…] [try=<entry>:<path>:<number>,…] [out=<file.json>]
```

demo_puppet3d's horse, from a stand to its walk and back:

```
node --experimental-strip-types plugins/puppet3d/puppet3d.feet.ts games/demo_puppet3d/main.scene.json horse "feet=left hind paw,left front paw,right hind paw,right front paw" body=pelvis,chest speed=1.5 accel=4 stand=3 hold=6 steady=3 down=0.005 mods=plugins/puppet3d/puppet3d.puppet3d.ts,games/demo_puppet3d/plugins/paddock/paddock.puppet3d.ts
```

It reads the bones as drawn, so it reads any solver (`row=upright:1` measures paddock's `upright`, its
`feet=` the two hind paws). For each phase and each foot: how far a foot slid while down, how far behind
and ahead of its place it got, how long it stayed down and up, its steps, its top speed, its jumps, the
most a bone stretched, and how far the body dipped. Its header says what each number is.

This is how a solver's numbers are judged, never by eye alone:

- The last table, "past the steady stride", is the one to read: the start and the stop against the
  steady stride, 0 where they went no further than a steady stride goes. `behind` is a foot left
  behind, `snap` and `fastest` a foot that jumps, `stretch` a leg that could not reach its foot.
- `try=` runs it with a number of a sheet changed and the file left alone
  (`try=horse_1:walk.gait.hurry:3`), so a number is tried, the table read, and only the number that
  reads best is written into the sheet.
- A change is checked at every pace of the sheet (`speed=` each pace's `speed`), on its feet and
  upright: a number that cures the walk can spoil the gallop.
- Give `stand=` three seconds, so the feet have finished coming to rest when the run ends.
- `out=` keeps every step's sample and every footfall, for finding the step a foot jumped on.

A gait's `hurry` is the number it was built to set: how much faster than its pace's `cycle` a stride may
go round to lift a foot before the body leaves it behind, as it does setting off from a stand.

## Clips from a body, for crowd3d

The reverse: a node program beside the plugin poses a kind with the plugin's own code, walking one
stride and standing, and writes both into a copy of its glb as ordinary animations, `walk` and `idle`:

```
node --experimental-strip-types plugins/puppet3d/puppet3d.clips.ts <scene.json> <kind> <out.glb> rate=<fps> walk=<m/s>,<sense>,<settle s> idle=<seconds> mods=<a.puppet3d.ts>,…
```

crowd3d bakes and plays that glb like any Mixamo character's, and its `travel(body, 'walk')` is the walk
speed given, so a row walking at it keeps its feet planted. Only the layout on the world is written. In
one crowd3d scene every body is on the first body's skeleton, so animals of one skeleton make their own
crowd: demo_puppet3d's `herd` scene (`dev.html?scene=herd`) is its four AWOL animals, the horse's clips
played on every body.
