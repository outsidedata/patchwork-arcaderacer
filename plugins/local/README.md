# local

Actors that live only on this page: they set up, tick and are removed like every actor, but have
no row on the truth and nothing on the wire.

## Why use it

Use local for anything only this page feels and no other seat needs, that is still best written as
an actor with its own look: a menu's cursor, a title screen's spinning logo, a toast, a damage
number floating up, a decal, a camera rig, a hover marker, a page-only effect. It keeps that out of
the rows, so no seat is sent it and no rule reads it.

## How it works

local has a browser half only. `spawn(name, data?)` is `w.spawn` for the page: the row comes back at
once with a negative id no truth row has, and its `data` is a copy of the scene's `prefabs[name]`
with `data` written over it (a name with no prefab throws `no prefab for <name>`). The actor,
`<name>.client.ts` beside the page, is imported and set up in local's `afterTick`, so a spawn from
anywhere (a row actor's `setup`, an actor's `tick`, a click between frames) is set up by the next
`afterTick`, before the plugins listed after local draw it, and ticked from the next frame.

Each frame local ticks every local actor and removes the one whose `tick` returns false (calling its
`remove`). `rows` is every live local actor's row. There is one local per client, so a local actor
a menu scene makes stops ticking the moment the menu's client stops framing; closing the client
removes every one. Every spawn imports a module instance of its own, as every truth row does.

## Using it

1. List `local` in `plugins`, before the plugins that draw what local actors make.
2. Give each local kind a prefab in the scene and a `<kind>.client.ts` with `setup`, `tick` and
   `remove`.
3. `plugins.local.spawn('popup', { text: '+10', pos })`; return false from its `tick` to remove it.

## Plugins it works with

Any page plugin a local actor draws through: **render2d**, **render3d**, **ui**, **audio**,
**particle2d**, **particle3d**. **store** is where a value only the page uses lives when it must
outlive a scene.

## Keywords

local actor, client-only, page-only, cosmetic, effects, popup, damage numbers, floating text, toast,
menu, cursor, title screen, decal, no network, not replicated, client-side spawn, negative id,
`spawn`, `rows`
