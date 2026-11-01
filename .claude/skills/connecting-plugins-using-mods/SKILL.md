---
name: connecting-plugins-using-mods
description: Use in core, or any clone of it, whenever one plugin's things should act on another plugin's things (a car runs over a body, a round hits a limb, gore lands on the ground, a ragdoll lies on scatter, a shot stops at a wall), whenever a plugin must handle a new kind of thing or handle one it has differently (behaviors, `world.<p>.mods.behaviors`, "has no behavior for"), whenever Bill says "like it works in <game>", "this already works", "isn't this just a mod", and before proposing any new code, new act, new field or new file to join two plugins. The join almost always exists already as a mod file and a few lines of a scene's `world.<p>.mods`; the job is to find it and switch it on.
---

# Connecting plugins using mods

Two plugins in core never import each other. Plugin `a` hands plugin `p` what it knows through a
mod file, `plugins/<a>/<a>.<p>.ts`, and a scene switches it on with `world.<p>.mods: { <key>: '<a>' }`.
The whole mechanism is the Mods header of `addons/scenemanager/scenemanager.addon.ts`.

So when Bill asks for "X to do to Y what it does to Z", the answer is nearly always that the mod
already exists and only the scene is missing it. Claude keeps missing this. It looks at the kinds and
the rules and proposes new code in a game's actor or a new plugin file, when the join is already
sitting in `plugins/`, and the scene that already does it is right there to copy.

## The order the work is done in

1. **Find the scene where it already works.** Bill usually names it ("like the pedestrian in
   drive"). If not: `grep -rln "<plugin>" games/*/*.scene.json`.
2. **Read that scene's `world.<p>.mods` for every plugin involved**, plus each plugin's switch
   (`hit`, `kinds`, `physics`, …). Write down each key and the plugin it names.
3. **List the mod files that exist**: `ls plugins/<a>/` shows every `<a>.<p>.ts`. A game's own
   plugin's mod sits beside it, `games/<game>/plugins/<a>/<a>.<p>.ts`, or beside `p` when only `p`
   is the game's, `games/<game>/plugins/<p>/<a>.<p>.ts`. Each file's header says which keys it gives
   and what they hand back.
4. **Follow the chain.** A mod often hands on what *its own* mods name. For example,
   `hitscan3d.box3dvehicle.ts`'s `bodies` is whatever `world.hitscan3d.mods.bodies` names, so a car
   meets whatever bodies a shot meets. Follow every key to the plugin at its end.
5. **Diff the two scenes** on those keys. The missing lines are the change.
6. **Make only that change**, in the scene. Say it in one line.

A key may name several plugins, `{ <key>: ['<a>', '<b>'] }`, when `p` takes that key from every one
of them, as box3d's `props` takes the fixed things each of several plugins stands on the land. A
mod named for a key it does not export throws when the scene is prepared, before the first step.

New code is on the table only when step 4 ends at a key no plugin provides. Then it is a new
`<a>.<p>.ts` mod, asked of Bill in planning (prime-directive), never an `if` in a game's actor.

## Mods deliver behaviors

Every function a mod exports is behavior the plugin that asks for it does not have: one named one
(the ground's `height`, the sky's `light`), or a table of them by word, `behaviors`. A plugin that does
one job over many kinds of thing (a shot meeting shapes, a body walking round obstacles, a bot hiding
behind them) never knows what those things are: a thing names its word by the key its numbers sit
under, `{ box: { pos, size, yaw } }`, and the plugin runs that word's behavior from its table. The whole
of it is the Behaviors section of `building-a-plugin`.

So when `p` must handle a new kind of thing, the join is still a mod, not code in `p`:

- **Whoever brings a word brings its behavior, in the same mod file.** The plugin that hands `p`
  things of a word exports `behaviors()`, `{ <word>: <function> }`, beside what it hands, in
  `<a>.<p>.ts`, and the scene names it in `world.<p>.mods.behaviors` as well as in the key it hands
  through. shapes3d hands hitscan3d its walls and boxes through `solids` and delivers `box` through
  `behaviors` (`shapes3d.hitscan3d.ts`); the same for walker (`fixed`, `behaviors`) and cover3d
  (`solids`, `behaviors`).
- **A delivered word overrides.** A behavior a mod delivers takes the place of `p`'s own of that word,
  a built-in included, and a later mod's takes the place of an earlier one's. To change how `p` does
  its job for a word it already has, a scene names a plugin that does it otherwise; `p` is never
  edited for it.
- **A game's own words in a plugin's data.** The same table takes a game's words, not only another
  plugin's: a cue file's `{ "do": "open", "who": "gate" }` is played by the step the game's plugin
  delivers for `open` in `<a>.cutscene.ts`, named in `world.cutscene.mods.behaviors`
  (`games/demo_cutscene/plugins/stagehand/stagehand.cutscene.ts`). A word nothing delivers is
  refused when the file is read: `open is not a cue: no plugin world.cutscene.mods.behaviors names
  delivers it`, fixed by that one line of the scene.
- **`<p> has no behavior for a … of the word <w>`** means the scene hands `p` things of that word
  through one key and does not name their plugin in `world.<p>.mods.behaviors`. The fix is that one
  line of the scene.

Add to step 2: read each plugin's `world.<p>.mods.behaviors` beside its other keys. Add to step 4:
follow each word a provider hands to the plugin that delivers its behavior.

## What not to do

| Wrong | Why |
|---|---|
| New code in a game's kind to react to another plugin (`if (h.speed) die(...)`) | The kind's act already receives the call through the mod; the plugin behind the act decides what happens. |
| A new `<a>.<p>.ts` before listing the ones there | The one needed is usually there, under the other plugin's folder. |
| Reading the kinds and rules first | The join is in the scene's `world.<p>.mods` and the mod files, not in the actors. |
| Explaining the mechanism, then proposing something else | If it works in one scene, the change is the lines that scene has and this one lacks. |
| An `if` or a `switch` in `p` on what a thing is, to handle a new kind of thing | The plugin that brings the thing delivers `p` a behavior for its word through `world.<p>.mods.behaviors`. |
| Editing `p` to change how it handles a word it already has | A mod delivering that word's behavior takes the place of `p`'s own, for the scene that names it. |

## Example: running over horde's farmers (2026-10-19)

Bill: drive's jeep runs over the pedestrian (a box3d ragdoll); make dismember3d's farmers able to
be run over the same way. "This is something I know works."

What it took, found by steps 1-5:

- drive's `world.box3dvehicle` has `hit: { speed, damage }` and `mods: { bodies: 'hitscan3d',
  strike: 'hitscan3d' }` (`plugins/hitscan3d/hitscan3d.box3dvehicle.ts`).
- That mod's `bodies` is whatever `world.hitscan3d.mods.bodies` names. In horde's main scene that is
  already `dismember3d` (its joint spheres), and its `strike` calls the farmer's `hit` act, which
  is already dismember3d's `hit`.
- horde's `world.box3dvehicle` lacked the `hit` and the two mods. Adding those three lines was the
  whole change.

What Claude did instead: proposed new code in `farmer.sim.ts` to check for a car and call
ragdoll3d's `die`, then a new `dismember3d.box3dvehicle.ts` file, while `hitscan3d.box3dvehicle.ts`
and drive's scene, the whole answer, were already open in front of it.
