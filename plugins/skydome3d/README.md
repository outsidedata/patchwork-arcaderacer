# skydome3d

The one sky for a 3D scene, the same on every seat: a day clock with a real sun path for any latitude
and day of the year, a moon with phases, weathers that blend (cloud deck, cirrus, rain, snow, fog,
haze, wind, gusts, thunder, dust), lightning, ground wetness and snow cover that lag the sky, and on
the page the dome with stars, sun and moon discs, clouds, god rays, the key and hemisphere lights,
fog, exposure, the scene's environment map, a camera-centred shadow box, cloud shadows, wet and snow
on every dressed surface, falling rain, snow and dust, and splashes.

## Why use it

Use skydome3d for any outdoor 3D game: a day–night cycle, a storm rolling in, snow settling on the
ground, a sunset race, a foggy morning. One row drives it, so every seat sees the same sun, the same
clouds in the same place and the same lightning strike, and the sea, the sound and the HUD can read
the same weather off it.

## How it works

**Server half (`skydome3d.sim.ts`).** One `skydome3d` row per scene. Its prefab holds everything that
changes: `t` and `rate` (the sky clock), `doy` and `lat`, the moon's `phase`, `to`, `from`, `blend`,
`fade` and `mix` (the weather standing now), `wet` and `pack`, `windDeg`, `drift` (the wind's
integral, which places the clouds, their shadows and the falling things), `flash` and `strike`.

Each step: the clock moves at dt·rate; the sun from declination and hour angle; the moon on the sun's
path, lit by its phase; the weather blends toward `to` over `fade`; `wet` follows rain and fog and
`pack` lays under snow and melts faster in sun; the wind gusts by three sines that meet themselves at
midnight and `drift` integrates it; while `mix.thunder` is above 0 lightning is rolled from the
scene's `seed`. Helpers include `sun`, `moon`, `moonLit`, `gust`, `windSpeed`, `wind`.

A Weather is 13 numbers: `cloud`, `cirrus`, `base`, `top`, `dense`, `rain`, `snow`, `fog`, `haze`,
`wind`, `gust`, `thunder`, `dust`, kept in a weathers file. `biomes` makes the weather differ by
terrain3d's biomes, drawn as the camera crosses them.

The acts, all closed (a game forwards them with `w.call`): `weather(name, fade)`, `time(hours)`,
`rate(x)`, `moon(phase)`, `place(lat, doy)`.

**Browser half (`skydome3d.plugin.ts`).** Draws from the row as it stands, nothing interpolated:

- the dome (gradient by sun elevation with sunset tints, stars turned by the hour and twinkling, the
  moon lit toward the sun, the sun disc, glow and halo, cirrus, a cloud deck with parallax and silver
  lining, god rays, flash), drawn first with no depth write;
- the key light (sun or moon, whichever is brighter) with a shadow box centred on the camera snapped
  to texels, the hemisphere light, FogExp2 whose colour is the dome's horizon, render3d's exposure
  opening at night;
- the scene's `environment` from the dome through PMREM, remade only when the sky has moved enough;
- a splice on every dressed material: wet darkens and smooths, snow whitens up-facing faces, and the
  cloud deck's shadow falls on every direct light;
- instanced rain streaks along the wind, snow and dust that sway, and rain splashes on the land, all
  hashed and wrapped round the camera so two clients draw the same drops.

`light()` hands out `{ sun, sunColor, zenith, horizon, fog, key, keyColor, sky, ground, … }` for the
sea and for what render3d's overlay draws.

## Using it

1. List `skydome3d` after anything that places the camera in its `afterTick` and after the land's
   plugin, and before `render3d`. Add one `skydome3d` row with its prefab.
2. Give `world.skydome3d`: `day`, `weathers` (a loader `json` entry), `soak`, `dry`, `lay`, `melt`,
   `gusts`, `bolt`, `biomes?`, `look` (the palette, lights, clouds, stars, sun and moon, fog,
   environment), `precip` (rain, snow, dust and splashes), `shadow`, and `mods: { land: 'terrain3d' }`.
3. Give the scene a `seed` if its weathers thunder.
4. Change the weather from a rule: `w.call(w.find('skydome3d'), 'weather', -1, 'storm', 30)`.
5. To measure what a part of the sky costs, name it in `world.skydome3d.off` and it is not drawn:
   `dome`, `gradient`, `stars`, `moon`, `sun`, `flash`, `fog`, `environment`, `shadow`.

## Plugins it works with

- **render3d**: its scene, exposure, renderer (for PMREM), splice and reversed-depth shadows.
- **terrain3d**: the mod `terrain3d.skydome3d.ts` (`mods: { land: 'terrain3d' }`) is the ground the
  splashes stand on and the biomes the weather follows.
- **ocean3d**: skydome3d's mods `skydome3d.ocean3d.ts` (`world.ocean3d.mods: { light: 'skydome3d',
  wind: 'skydome3d' }`) draw the sea in the sky's light and raise it with the wind.
- **audio**: loops can follow `mix` fields (`"mix.rain"`) for rain and wind beds.
- **cel3d**: keeps skydome3d's cloud shadow when listed after it.
- **loader**: the weathers file.
- **math**: deterministic maths.

## Keywords

sky, skybox, skydome, atmosphere, day night cycle, time of day, sun, sun path, latitude, season, moon,
moon phases, stars, clouds, cloud shadows, cirrus, god rays, weather, weather system, rain, snow,
dust storm, fog, haze, wind, gusts, thunder, lightning, storm, wet surfaces, snow cover, puddles,
environment map, PMREM, image based lighting, IBL, sun shadow, hemisphere light, exposure, three.js,
`weather`, `time`, `rate`, `light`, `world.skydome3d`
