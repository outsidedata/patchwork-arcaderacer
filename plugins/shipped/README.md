# shipped

Loads the plugins a game ships in its own folder. The engine loads a scene's `plugins` from the
top-level `plugins/` folder alone, so a plugin that belongs to one game (its level, its HUD, a system
of its own) lives in `games/<game>/plugins/<name>/` and is loaded by this one.

## Why use it

Use shipped whenever a game has a plugin of its own. A thing used by one game is that game's, however
general it could be described; it moves to the top-level `plugins/` only when a second game needs it.
shipped lets a game's own plugin tick, mod and be used exactly as a top-level one is.

## How it works

shipped has no row. The scene's `world.shipped: { plugins: [...] }` lists the names. Its first tick
imports each `plugins/<name>/<name>.plugin.ts` under the page's own folder, in that order, calls the
function of its name once, and puts the result on `plugins.<name>`, so an actor or a plugin that ticks
after shipped uses it as it uses any other. Every `tick` and `afterTick` of theirs runs at shipped's
place in the scene's `plugins`, in the list's order, and `close` closes them in reverse. A name the
scene's `plugins` already gives throws, and so does a file that does not export a function of its name.

A game's plugin's server half is imported by the game's sim files as they import any plugin's. The
names `world.shipped.plugins` lists are also how a mod of a game's plugin is found, in the game's
folder beside it, so a game's plugin reaches another plugin, and is reached, through a mod as a
top-level one is.

## Using it

1. Put the game's plugin at `games/<game>/plugins/<name>/<name>.plugin.ts`, exporting `<name>()`.
2. List `shipped` in the scene's `plugins` where the game's plugins should tick, and give
   `world.shipped: { plugins: ['<name>', …] }`.
3. Use it as `plugins.<name>` from actors and plugins listed after shipped.

## Plugins it works with

- The **scenemanager** addon's mods: a game's plugin's mods are found by the names shipped lists.
- Any top-level plugin a game's plugin is built on, handed to it through `plugins`, never imported.

## Keywords

game plugins, local plugins, per-game plugins, plugin loader, dynamic import, game folder, own
plugin, mods, `world.shipped`
