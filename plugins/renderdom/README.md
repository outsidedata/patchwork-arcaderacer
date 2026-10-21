# renderdom

The page's DOM layer, a peer of render2d and render3d: plain HTML elements drawn over the game (or as
the whole game) in the game's own units, scaled with the canvas. Panels, shown elements, 2D canvases,
pointer surfaces with capture, cursors, keyboard handlers that leave fields alone, scoped
stylesheets and web fonts; and `controls.ts`, a hardware-style controls kit of knobs, switches,
buttons, LEDs, LCDs, faders, meters and modules.

## Why use it

Use renderdom for anything better made of HTML than of sprites: a game drawn entirely in the DOM (a
card game, a word game, a board game, a synth or a sequencer), text-heavy panels, forms, a mixer
faceplate, or overlays that need real text layout and CSS. Everything is in the game's units, so it
lines up with the game's canvas at any window size.

## How it works

renderdom has a browser half only, no row and no `world.renderdom`. One root `div` per client is fixed
over the game's canvas (render3d's, else render2d's), or centred in the window at the largest size
that fits when there is no game renderer. Its size is the game renderer's `size`, else the `engine`
prefab's `width` × `height`, and a CSS transform scales it to the canvas every tick. It takes no
pointer event itself, so the canvas under it is clicked wherever no panel lies.

Everything follows one contract, as ui's `show` does: asked for every frame it stays, made the first
time, taken away the first frame it is not asked for.

- `panel(name, box)`: a `div` at `[x, y, width, height]`, taking the pointer over its box.
- `show(panel, key, make)`: the element for `key` on the panel, the caller's to place and fill each
  frame; each carries `data-key` and its panel's `data-panel`, so a test finds it.
- `canvas(panel, key, box)`: a `canvas` sized to device pixels, cleared each frame, its 2D context
  handed back drawing in the box's own units.
- `surface(panel, key, box, hands)`: pointer input over a box, in its own units, with `{ shift, alt,
  mod }`: `down` (with pointer capture, so `move` and `up` follow outside the box), `move`, `up`,
  `hover`, `leave`, `wheel` (the page does not scroll), `menu` (right button, no context menu).
  `cursor(panel, key, css)` sets its cursor.
- `keys(handler)` and `keyups(handler)`: every key down or up on the page while asked for each frame;
  a handler that returns true cancels the page's own action. A key typed into a field is no key.
- `style(css)`: rules scoped under the root's `data-renderdom` (`&` is the root); `fonts(urls)`:
  stylesheet links put in the head once, each face loaded.

It needs a page: a client with no `document` throws on its first tick. `close` removes every listener,
the root and every stylesheet it added.

**The controls kit (`controls.ts`).** `controls(dom)` hands back parts built on `show` and `surface`,
on a silver chassis with Michroma, Silkscreen and Share Tech Mono fonts. A part shows what it is
handed and hands edits to `onChange` / `onPick`; every editing part takes `gesture: { begin, end }`,
so one drag is one step of undo.

- `knob`: a dial with label, value and lit arc; drag up and down (Shift for fine), `log` ranges,
  `step`, double-click `reset`, wheel steps, right-click `onMenu`.
- `switch`: a segmented row of options with an LED.
- `button`: a key-cap, optionally with an LED.
- `led`, `lcd` (green text screen), `fader` (vertical), `meter` (dBFS bar with held peak), `module`
  (the bevelled box with a title).

## Using it

1. List `renderdom` in `plugins` (after render2d or render3d when the game has one).
2. Each frame in an actor's `tick`: `const p = plugins.renderdom.panel('hud', [0, 0, 320, 40])`,
   `plugins.renderdom.show('hud', 'score', () => document.createElement('div')).textContent = ...`.
3. For a faceplate: `const kit = controls(plugins.renderdom)`, then `kit.knob('rack', 'cutoff', {...})`
   every frame.

## Plugins it works with

- **render2d** / **render3d**: the canvas it lies over and the size it takes.
- **audiodaw**: the controls kit is shaped for a synth, a rack and a mixer (knobs, faders, meters).
- **loader**: hands back an `<img>` for a scene with no renderer.
- **ui** is the PixiJS HUD drawn on a canvas of its own.

## Keywords

DOM, HTML, CSS, overlay, HUD, UI, panels, text, DOM game, card game, board game, word game, canvas 2D,
pointer events, pointer capture, drag, hover, wheel, context menu, keyboard handler, scoped styles,
web fonts, controls, knob, dial, fader, slider, switch, toggle, button, LED, LCD, VU meter, level
meter, synth UI, mixer, rack, faceplate, undo gesture, `panel`, `show`, `canvas`, `surface`, `keys`,
`style`, `fonts`, `controls`
