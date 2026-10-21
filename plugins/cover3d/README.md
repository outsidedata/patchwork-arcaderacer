# cover3d

Cover for AI in 3D: every place near a body where a solid standing on the ground (a tree trunk, a
boulder, a pillar) hides it from a threat, nearest first.

## Why use it

Use cover3d when an enemy, a bot or a squad member should take cover: run behind the nearest tree
away from the player who is shooting at it, pick a spot behind a rock, hide from a turret. It only
answers a rule's question; nothing is drawn.

## How it works

cover3d has a server half only, no row and no numbers of its own: a rule hands every number with
the question. The solids come from another plugin through a mod, the one `world.cover3d.mods.solids`
names: `(w, x, z, r) → { x, z, radius, tall? }[]`, every solid whose circle reaches within `r` of
(x, z), `tall` its height over the ground (without end when it has none).

`spots(w, at, threat, { reach, radius, low })` takes each solid at least `low` metres tall whose
centre is within `reach` of `at`, and puts a spot on the line from `threat` through the solid's
centre, past it by the solid's radius plus `radius` (the body's), so the body stands against the
solid's far side. The line from the threat to the spot passes through the solid's middle, so a shot
from the threat at any height under `tall` meets the solid first. The ground between is not asked.

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
- **math**: the deterministic maths it measures with.

## Keywords

cover, take cover, hide, AI, enemy AI, bot, tactical, cover point, hiding spot, line of sight,
behind a tree, behind a rock, squad, shooter AI, threat, flee, `spots`, `world.cover3d`
