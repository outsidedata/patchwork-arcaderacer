# vision

Fog of war over a render2d map, the page's half of team vision: what the seat's team sees now is
clear, what it has seen before is dimmed, and what it has never seen is dark. The server half is the
vision addon (`addons/vision/vision.addon.ts`), which sends each seat only the rows its team sees.

## Why use it

Use vision for an RTS, a MOBA, a tactics game or a stealth game with fog of war. Because the addon
never sends a seat the rows its team cannot see, a hacked client cannot reveal the map; the plugin
draws the matching fog from the same arithmetic on the rows the seat was sent, so the two agree.

## How it works

vision has a browser half only and no row. Its numbers are `world.vision`, the block the addon reads:
`cell` (world units across a cell), `size` ([across, down] cells), `at` (the field holding a row's
place), `slot` (the field holding the seat slot a row belongs to), `teams` (each slot's team),
`sight` (cells each seeing kind sees round its own), `always` (kinds sent to every seat), and the
plugin's own `layer` (the render2d layer the fog is drawn on, over what it covers), `unexplored` and
`explored` (the fog's opacity, 0 to 1, over cells never seen and seen before).

Each `afterTick` it finds the seat's team from its own `player` row's `seat`, works out what that
team's seers see now with the addon's `sight`, adds that to what the page remembers having seen (the
page's own memory, for as long as this client lives), and writes one texture a pixel a cell, drawn
across the map through render2d's ground so it follows the camera, smooth so each cell's edge fades
over a cell. Before the seat's `player` row arrives the whole map is dark.

- `cells()`: what the fog was last drawn from, a byte a cell (`c = y × across + x`): 0 never seen, 1
  seen before, 2 seen now; for a minimap of the page's own.
- `shade(plugins, state)`: the fog's opacity over a cell in that state.

## Using it

1. List `vision` before `render2d`, give render2d a layer for the fog over the things it covers, and
   give `world.vision` its block.
2. The player addon attaches the vision addon to the truth when the first seat joins a scene that
   names the player plugin and has `world.vision`.
3. In a rule that must act only on what a team sees, ask the addon's `sees(w.world, slot, row)`.

## Plugins it works with

- The **vision** addon: sends each seat only the rows its team sees, and owns `sight`, `teamOf` and
  `sees`.
- The **player** addon: each seat's slot (`seat`), and `possessed`, the seat's own row.
- **render2d**: the layer the fog is drawn on, and the ground it is laid across.

## Keywords

fog of war, vision, line of sight, team vision, visibility, explored, unexplored, shroud, RTS, MOBA,
tactics, stealth, minimap, anti-cheat, interest management, map hack, `cells`, `shade`,
`world.vision`
