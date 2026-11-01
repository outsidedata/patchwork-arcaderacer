# store

The page's table of values the server never reads: the volume, mute, brightness, a theme, the keys a
player rebound, any setting only this page uses. It lives on the page's link, so every scene of the
page reads and writes one table, and it never crosses the wire.

## Why use it

Use store for settings and anything else only this page feels that must outlive a scene: a settings
menu's sliders, a rebinding screen, a colour-blind mode, a remembered camera distance. Putting such
a value on a row would send it to every seat every step and let rules read it; the store keeps it on
the page.

## How it works

store has a browser half only. On its tick it takes the table the scenemanager plugin's link holds
(`plugins.scenemanager.link.store`) and fills in every key of the scene's `store` prefab that the
table does not hold yet, so a value set in one scene is still there in the next. A value is any JSON
value: a number, a string, a list, a table.

- `get(key)`: the value; a key the table lacks throws.
- `has(key)`: whether the table holds it.
- `set(key, value)`: replaces it.

A call before the first tick throws `store has not ticked yet`; a scene that lists store with no
`store` prefab throws.

## Using it

1. List `store` in the scene's `plugins`, before the plugins that read it on their tick (`player`,
   for its actions).
2. Give the scene a `store` prefab with each key's starting value: `{ "volume": 0.8, "muted": false }`.
3. Read and write it from the page: `plugins.store.set('volume', 0.5)`.

## Plugins it works with

- **scenemanager**: the link the table lives on, the page's, which outlives every scene's client.
- **audio**: reads its volume and mute from the keys `world.audio.volume` names.
- **player**: keeps rebound keys, toggles, dead zone and repeat in `player.keys`, `player.toggle`,
  `player.deadzone` and `player.repeat`.
- **ui**: the settings and controls screens that write it.

## Keywords

settings, options, preferences, volume, mute, brightness, key bindings, rebinding, local state,
page state, client-side, not networked, persistent across scenes, config, `get`, `set`, `has`,
`store` prefab
