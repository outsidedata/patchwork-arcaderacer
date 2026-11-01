# scenemanager

The plugin half of every game's scene manager: the `scenemanager` row that carries the table of
scenes, the step size and the entry scene, its open act `go` that moves a seat to another scene with
arguments, and the page's one door onto the seat's link. The stepping, the truths, the mods and the
transports are the scenemanager addon's (`addons/scenemanager/scenemanager.addon.ts`).

## Why use it

Every game uses it, a game of one scene too: it is how a page's client reaches its scene, and how a
seat goes from a title screen to a level, from a level to the next, into a dungeon and back, or to the
results screen. The page that changes scene only names the scene; the engine checks the message like
any other and the addon moves the seat once the step is over.

## How it works

**Server half (`scenemanager.sim.ts`).** The `scenemanager` row is how a scene file carries the table
of scenes, the step size and the entry scene's name. A child scene carries the row too, with `out`
(seat number to `{ scene, args }`) and `names` (the manager's table, written into the child's prefab
by the addon as it loads it).

`go(name, ...args)` is `open`, so a seat sends it at the row. It refuses a name that is not one of
`names`, writing nothing. Otherwise it writes `out[seat]`; once the child's step is over the addon
reads it, moves the seat, and hands the arguments to the new scene's `player` row as its `arrive` act,
or, where every seat of that scene is taken, clears the slot and leaves the seat where it is.

A rule sends a seat on with `w.call(w.find('scenemanager'), 'go', seat, name, ...args)`. `seat` is
the seat's number on this truth (a hook has none, so a `player` row keeps the number its `arrive` act
was handed).

**Browser half (`scenemanager.plugin.ts`).** A page makes one link (one seat), and the addon's `view`
holds one client on it for the scene the seat is on. This plugin is the one plugin that mounts a pipe:
`mount(link, name, seat)` makes the client's door onto the link, every message sent carrying the
scene's name and the seat, and `hand(packet)` puts a packet of this scene in its inbox. `here` turns
false the moment the link carries another scene's packet, so a key pressed before the page has closed
this client sends nothing to a scene the seat has left. When the seat moves, the client is closed and
a new one made for the next scene. `plugins.scenemanager.go(name, ...args)` sends `go` from the page.

## Using it

1. The manager scene file, `<game>.scene.json`, lists `scenemanager` in `plugins` and holds the
   `scenemanager` row with the table of scenes; each child `<scene>.scene.json` gets its row from the
   addon.
2. From a menu button: `plugins.scenemanager.go('level1')`. From a rule when a level is won:
   `w.call(w.find('scenemanager'), 'go', seat, 'level2', score)`.
3. Give the `player` kind an `arrive` act that reads the arguments.

## Plugins it works with

- The **scenemanager** addon: the truths, the stepping, the seats, mods (`world.<p>.mods`, `mod`,
  `provided`, `ahead`) and the hand-off to a transport (`accept`, `link`).
- The **loopback** and **socket** transports: what the link is.
- **player**: a seat's `player` row takes the `arrive` act.
- **cutscene**: sends every seat on with `go` at a scene's end.
- **shipped**: loads a game's own plugins beside the top-level ones.

## Keywords

scene manager, scenes, levels, change scene, scene transition, level select, title screen, menu,
next level, results screen, hub, dungeon instance, seat, move seat, arrive, go, pipe, link, client,
packets, `go`, `mount`, `hand`, `here`, `scenemanager` row
