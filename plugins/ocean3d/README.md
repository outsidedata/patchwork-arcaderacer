# ocean3d

A spectral FFT ocean that is the same on every machine: JONSWAP wind sea and swell in several
cascades, Gerstner-style horizontal chop, foam from the surface's folding, shoaling over the seabed,
a sea that swells and calms with the sky's wind, and `waveAt` / `floatAt` so the server floats boats,
buoys and bodies on exactly the waves every seat draws.

## Why use it

Use ocean3d for open water in a 3D game: a sailing or boating game, an island, a coastline, a naval
battle, a flight game over the sea. The server and every page build the same spectrum from the same
numbers and evolve it on the same clock, so a boat bobbing on the server bobs on the wave the player
sees, and the sea repeats exactly every `repeat` seconds.

## How it works

**Server half (`ocean3d.sim.ts`).** One `ocean3d` row per scene carries `t` alone, the sea's clock,
`t += dt` each step wrapped into `[0, repeat)`. Every other number is `world.ocean3d`.

- The spectrum: two JONSWAP lobes (wind at `windSpeed`, `windDeg`, `fetchKm`; swell at `swellScale`,
  `swellDeg`) with TMA depth correction and directional spreading. Each cascade is a 256 × 256 grid
  over a tile of `patches[c]` metres, keeping its own band of wavelengths (`bands`), seeded from
  `seed` so moving a band edge never reshuffles the sea. Every frequency is put on a whole multiple of
  2π/`repeat`, so the sea repeats exactly.
- Cascade 0's 96 strongest ± pairs (`KEPT`) are the waves the server sums: `waveAt(w, x, z, ground)`
  is the height of the drawn surface over a point, inverting the chop with three fixed-point steps;
  `floatAt(w, x, z, span, ground)` is `{ y, normal }` from four corners of a `span` square, so a float
  does not bob on ripples shorter than itself.
- `shoal(sea, depth)` grows the sea from `shoalFloor` to full over `shoalDepth` metres of water, so
  waves flatten toward the shore.
- `ampAt(w)`: every wave is scaled by `amp·(floor + (1 − floor)·min(1, wind/windRef))` with the wind
  the `wind` mod hands, so the sea follows the weather without remaking the spectrum.
- `spectrumOf(w)` is memoised per truth by the numbers the spectrum reads.

**Browser half (`ocean3d.plugin.ts`).** The same spectrum made again in this client, evolved per
cascade per frame on the GPU (evolve, inverse FFT with radix-2×2 butterflies, assemble displacement,
derivatives and a foam history from the Jacobian), mipmapped so far water calms instead of crawling.
It is drawn on an exponential polar disc recentred on the camera snapped to its innermost ring, with a
depth pre-pass (so render3d's `ao` sees the waves) and a transparent colour pass: Fresnel sky
reflection, a deep and scatter body with sun glow, a Blinn glint, foam with bubble noise, and alpha
that shows the seabed in shallows and fades at the shore, then three's tone mapping and the scene's
fog. A seabed depth tile around the camera is baked from the land and re-baked in slices as the
camera moves or the land is edited. Nothing interpolates: the waves are at the row's `t`.

## Using it

1. List `ocean3d` before `render3d`, and after the plugins its `light` and `land` mods come from. Add
   one `ocean3d` row (prefab `{ "t": 0 }`).
2. Give `world.ocean3d` the sea's numbers (`windSpeed`, `windDeg`, `fetchKm`, `swellScale`,
   `swellDeg`, `amp`, `chop`, `foamRecovery`, `seed`, `patches`, `shoalDepth`, `shoalFloor`, `repeat`,
   `weather`), the look's (`deep`, `scatter`, `glow`, `glowPower`, `glint`, `glintPower`,
   `foamColour`, `foamJ`, `bubbles`, `bubbleEdge`, `alpha`, `clearDepth`, `rings`, `segs`, `far`,
   `depthHalf`, `depthMax`, `depthRes`, `depthRows`), a fixed `light` when no light mod is named, and
   `mods: { wind, land, light }`.
3. In a boat's rule: `const { y, normal } = floatAt(w, x, z, span, { depth: (x, z) => depthAt(w, x, z) })`.

## Plugins it works with

- **skydome3d**: the mods `skydome3d.ocean3d.ts` (`mods: { light: 'skydome3d', wind: 'skydome3d' }`)
  draw the sea in the sky's sun and sky colours and raise it with the sky's wind.
- **terrain3d**: the mod `terrain3d.ocean3d.ts` (`mods: { land: 'terrain3d' }`) is the seabed the sea
  shoals over, and its edits trigger a re-bake; terrain3d's `depthAt` is the server's ground.
- **render3d**: the scene, the camera, the reversed depth and `ao` it draws for.
- **math**: deterministic maths, so the server's waves are the GPU's.

## Keywords

ocean, sea, water, waves, FFT ocean, Tessendorf, spectral ocean, JONSWAP, TMA, swell, wind waves,
cascades, choppy waves, Gerstner, displacement, foam, whitecaps, Jacobian, shoaling, shoreline,
shallow water, seabed, Fresnel, reflection, sun glint, buoyancy, floating, boat, ship, buoy,
deterministic waves, weather, storm, calm, three.js, `waveAt`, `floatAt`, `world.ocean3d`
