---
name: patchwork-game-design-flowchart
description: Use in core, or any clone of it, before proposing, planning or explaining any design to Bill in which one thing interacts with or connects to another - a plugin that must see, hit, stand on, walk round, route over, draw or hear a thing of the game's; two of the game's kinds acting on each other; a system the game has; a part that rides on another; data read from something the game made - and before saying a plugin "can't see", "doesn't know", "has no way to", "needs a change in core", "needs a bake" or "needs IK". The holistic chart of how anything in a Patchwork game connects to anything else. Every path ends in "in a plugin you write" or "with a mod you write".
---

# Patchwork game design flowchart

How anything in a Patchwork game connects to anything else. Every path down this chart ends in one
of two places:

- **in a plugin you write**: `games/<game>/plugins/<p>/`, its server half `<p>.sim.ts` and its
  browser half `<p>.plugin.ts`, loaded by `shipped` (`world.shipped.plugins`);
- **with a mod you write**: `games/<game>/plugins/<p>/<a>.<p>.ts`, switched on by one line of the
  scene, `world.<p>.mods: { <key>: '<a>' }`.

There is no third ending. Never the engine. Never an `if` in an actor about another plugin's thing.
Never one actor importing another. Never a plugin naming another plugin or reading its `world`. The
rules behind each ending are `prime-directive`, `building-a-plugin` and
`connecting-plugins-using-mods`; this chart is how a design gets to them.

## The chart

```
                     two things must interact or connect
                                     │
 ┌───────────────────────────────────┼─────────────────────────────────────┐
 │                                   │                                     │
 A. a plugin of core's must          B. a plugin you write must            C. your game's own things
    know or do something with           know something a plugin               act on each other, share
    a thing of your game's              of core's knows                       code, or make a system
 │                                   │                                     │
 │  A1. it must see, hear, hit,      │  the ground's height, the           │  C1. two of your kinds
 │      shoot, crush, collide        │  sky's light, a route, a            │      touch, hit, pick up,
 │      with, walk round, stand      │  body's pose                        │      count each other
 │      on, route over, draw it      │  ──> MOD YOU WRITE,                 │      ──> PLUGIN YOU WRITE:
 │      ──> hand it the thing in     │      beside your plugin             │          a function handed
 │          the shape its key asks   │                                     │          both rows; the change
 │          ──> MOD YOU WRITE        │                                     │          is the other kind's
 │                                   │                                     │          act, by w.call
 │  A2. it must do its job its       │                                     │
 │      own way for your thing       │                                     │  C2. several kinds share
 │      ──> deliver the behavior     │                                     │      a rule or a look
 │          ──> MOD YOU WRITE        │                                     │      ──> PLUGIN YOU WRITE
 │              (its behaviors)      │                                     │
 │                                   │                                     │  C3. a system of the game's
 │  A3. its slot already takes       │                                     │      ──> PLUGIN YOU WRITE,
 │      another plugin's answer      │                                     │          handing core's
 │      ──> chain: yours, plus       │                                     │          plugins your things
 │          what your own mod        │                                     │          through their mods
 │          names                    │                                     │
 │          ──> MOD YOU WRITE        │                                     │  C4. a part rides on a
 │                                   │                                     │      part that moves
 │  A4. it is not built around       │                                     │      ──> hung on the moving
 │      mods and behaviors           │                                     │          node, in the PLUGIN
 │      ──> make it mod-compliant,   │                                     │          YOU WRITE that draws
 │          then                     │                                     │          it
 │          ──> MOD YOU WRITE        │                                     │
 │                                   │                                     │  C5. data read off
 │                                   │                                     │      something your game
 │                                   │                                     │      made
 │                                   │                                     │      ──> written from that
 │                                   │                                     │          layout by the
 │                                   │                                     │          PLUGIN YOU WRITE
 │                                   │                                     │          that owns it
 └───────────────────────────────────┴─────────────────────────────────────┘
                                     │
                hand each thing only what its job needs
```

## A. A plugin of core's must know about a thing of your game's

Core's plugins never know your game. What one needs of your thing, you hand it, through the key it
asks its mods for. The mod is a file of your plugin's, named for the plugin it serves:
`games/<game>/plugins/<yours>/<yours>.<core>.ts`, and the scene names it, `world.<core>.mods`. The
Mods header of `addons/scenemanager/scenemanager.addon.ts` is the whole mechanism.

First look whether the mod is already written: the join often exists in core
(`plugins/<a>/<a>.<p>.ts`) and the scene is only missing the line (`connecting-plugins-using-mods`).
A join core has not written is a mod you write.

- **A1. It must see it, hit it, stand on it, walk round it, route over it, draw it.** Each plugin
  reads its world through its mod keys (the table in `using-3d-physics`): an NPC's sight, a shot's
  `bodies`, `solids` and `ground`, a walker's `height`, `fixed` and `solids`, box3d's `fixed`,
  `props` and `ground`, nav3d's graphs, solids' `models`. Hand your thing in the shape that key
  wants, and the plugin does its job on it like anything else.
- **A2. It must do its job its own way for your thing.** A plugin keeps a table from a word to the
  function that does its job for things of that word: its behaviors. Your mod's `behaviors()`
  delivers the word, `world.<p>.mods.behaviors`, and a delivered word takes the place of the
  plugin's own. Everything else the plugin does stays the plugin's.
- **A3. The slot already takes another plugin's answer.** A key read with `mod` takes one plugin.
  Your mod takes the slot, answers with yours, and hands everything else to the plugin its own
  `world.<yours>.mods` names (One slot, several sources: chain, in `using-3d-physics`).
- **A4. It is not built around mods and behaviors.** It asks no key that fits, keeps a fixed table
  where a mod should deliver, or branches on what a thing is (`if (kind === …)`, a `switch` over
  types). Then making it mod-compliant is part of the job: it is turned to ask a mod for what it
  needs and to take its words as behaviors (`building-a-plugin`, Mods and Behaviors), with its
  header, its tests and every game that uses it left working as before. Then the mod you write fills
  it.

## B. A plugin you write must know what a plugin of core's knows

The other way round. Your plugin never imports core's plugin for what it knows and never reads its
`world`. The mod sits beside your plugin, `games/<game>/plugins/<yours>/<core>.<yours>.ts`, since a
core plugin names no game's, and the scene names it, `world.<yours>.mods`. A pure function that
holds nothing of the other plugin's state (the loader's `json` and `def`, the player's `keyOf`) is
imported; a plugin yours draws or loads through (render3d, the loader, the ui) is handed to it as
`plugins.<a>`.

## C. Your game's own things act on each other, share code, or make a system

- **C1. Two of your kinds touch, hit, pick up or count each other.** One kind never imports
  another's file and never reads another's definition. The check is a function of a plugin you
  write, handed the other row and reading its definition; the change to the other row is that
  kind's own act, `w.call(row, act, -1, ...)` (`designing-a-kind`, Kinds acting on each other).
- **C2. Several kinds share a rule or a look.** A plugin you write: the rule a `Kind` it exports,
  each kind's file one line handing it out; the look its browser half, drawing every row of those
  kinds by its own definition.
- **C3. A system of the game's.** Its level, its brains, its weapons, its HUD: a plugin you write,
  reading every number off the definitions of the kinds it is handed. Where core already has a
  plugin that does the job (choosing and acting, routing, walking, driving), the plugin you write
  hands that plugin your things and your words through its mods (A), and never rebuilds the job
  beside it.
- **C4. A part rides on a part that moves.** It is hung on the moving node and moves with it. No
  IK, no solver, nothing working out each frame where it should be.
- **C5. Data read off something your game made.** The game laid it out, so it already knows it: a
  graph, a list of places, a set of outlines is written straight from that layout by the plugin
  that owns it, never rediscovered by a bake.

## Hand each thing only what its job needs

At every ending, what is handed is what the job reads and nothing more: a sight lists the kinds it
looks for, a plugin is handed the kinds it acts on, a body the shapes a shot can meet.

## Saying a design to Bill

Walk the chart, then say where each connection ends, a sentence each, in his words. A snag, a
"can't", a "core would need", a "no way to" is a branch not walked. Walk it.
