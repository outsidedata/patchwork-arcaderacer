---
name: connecting-plugins-using-mods
description: Use in core, or any clone of it, whenever one plugin's things should act on another plugin's things (a car runs over a body, a round hits a limb, gore lands on the ground, a ragdoll lies on scatter), whenever Bill says "like it works in <game>", "this already works", "isn't this just a mod", and before proposing any new code, new act, new field or new file to join two plugins. The join almost always exists already as a mod file and a few lines of a scene's `world.<p>.mods`; the job is to find it and switch it on.
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
3. **List the mod files that exist**: `ls plugins/<a>/` shows every `<a>.<p>.ts`. Each file's
   header says which keys it gives and what they hand back.
4. **Follow the chain.** A mod often hands on what *its own* mods name. For example,
   `hitscan3d.box3dvehicle.ts`'s `bodies` is whatever `world.hitscan3d.mods.bodies` names, so a car
   meets whatever bodies a shot meets. Follow every key to the plugin at its end.
5. **Diff the two scenes** on those keys. The missing lines are the change.
6. **Make only that change**, in the scene. Say it in one line.

New code is on the table only when step 4 ends at a key no plugin provides. Then it is a new
`<a>.<p>.ts` mod, asked of Bill in planning (prime-directive), never an `if` in a game's actor.

## What not to do

| Wrong | Why |
|---|---|
| New code in a game's kind to react to another plugin (`if (h.speed) die(...)`) | The kind's act already receives the call through the mod; the plugin behind the act decides what happens. |
| A new `<a>.<p>.ts` before listing the ones there | The one needed is usually there, under the other plugin's folder. |
| Reading the kinds and rules first | The join is in the scene's `world.<p>.mods` and the mod files, not in the actors. |
| Explaining the mechanism, then proposing something else | If it works in one scene, the change is the lines that scene has and this one lacks. |

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
