# cover3d

Cover for AI in 3D: every place near a body where a solid standing on the ground (a tree trunk, a
boulder, a pillar) hides it from a threat, nearest first.

## Why use it

Use cover3d when an enemy, a bot or a squad member should take cover: run behind the nearest tree
away from the player who is shooting at it, pick a spot behind a rock, hide from a turret. It only
answers a rule's question; nothing is drawn.

## How it works

cover3d has a server half only, no row and no numbers of its own: a rule hands every number with
the question. The solids come from other plugins through mods, the ones `world.cover3d.mods.solids`
names (one or a list): `(w, x, z, r) → shape[]`, every solid that may reach within `r` of (x, z).

**Solids and their behaviors.** cover3d never knows what a solid is. A solid names its word by the key
its numbers sit under, and cover3d asks that word's behavior for the spot behind it. Its own word is
`cylinder` (`{ pos, radius, height? }`, without end with no `height`): the spot is on the line from
`threat` through its middle, past it by its radius plus `radius` (the body's), so the body stands
against its far side. A plugin that hands cover3d solids of another word delivers that word's behavior
through `world.cover3d.mods.behaviors` (shapes3d's `box`, whose spot is where that line leaves the box
grown by the body's radius); a delivered word takes the place of cover3d's own of that word, and a
later plugin's the place of an earlier one's. A solid of a word nothing delivered throws, naming it. A
solid handed bare, `{ x, z, radius, tall? }`, as older providers hand them, is read as the cylinder it
always was (`fromBare`, the one fallback).

`spots(w, at, threat, { reach, radius, low })` takes each solid at least `low` metres tall whose
middle is within `reach` of `at`, and its behavior's spot. The line from the threat to the spot passes
through the solid, so a shot from the threat at any height under its top meets the solid first. The
ground between is not asked.

Each spot is `{ at: [x, z], tall, far }`: where to stand, how tall the cover is, and the metres from
`at`. `at` and `threat` are [x, z]. With no `solids` mod named, asking throws.

## Using it

1. Name the solids' plugin: `world.cover3d.mods: { solids: 'scatter3d' }`.
2. In a kind's rule: `const [best] = spots(w, [me.data.pos[0], me.data.pos[2]], [enemy.pos[0],
   enemy.pos[2]], { reach, radius, low })`, then walk there (walker's `seek`, or the kind's own
   steering). Give `reach`, `radius` and `low` from the kind's definition.

## Plugins it works with

- **scatter3d**: the mod `scatter3d.cover3d.ts` hands scatter3d's solid instances (trunks, boulders),
  standing on the ground `world.scatter3d.mods.ground` names, each as tall as its `tall` times its
  size.
- **shapes3d**: the mod `shapes3d.cover3d.ts` (`mods: { solids: 'shapes3d', behaviors: 'shapes3d' }`)
  hands its cylinders and boxes, delivering `box`.
- **math**: the deterministic maths it measures with.

## Keywords

cover, take cover, hide, AI, enemy AI, bot, tactical, cover point, hiding spot, line of sight,
behind a tree, behind a rock, squad, shooter AI, threat, flee, `spots`, `world.cover3d`
