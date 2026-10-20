# arcaderacer

An arcade racing game for the browser, built on [Patchwork](https://github.com/outsidedata/patchwork).

Play it: https://outsidedata.github.io/patchwork-arcaderacer/

- Three courses: a forest, Tokyo and Paris
- Three laps a race, eight cars on the grid, CPU rivals in every seat no player takes
- Drifting: tap the brake or hold the handbrake into a turn to slide; a clean drift earns boost
- Up to eight players together on a server: the first to join leads and starts each race, the rest
  race in it, wait for the next, or spectate
- Lap times, best lap, a minimap and a speedometer
- Music on every course

## Controls

| action | keyboard | gamepad |
|---|---|---|
| steer | ← → or A D | d-pad or left stick |
| throttle | ↑ or W | A or right trigger |
| brake | ↓ or S | B or left trigger |
| handbrake | Space | X |
| menus | arrows and Enter, Escape back | |

## Run it

```
yarn install
yarn vite
```

Open `http://localhost:5173/games/arcaderacer/index.html` to play in one tab.

For players together, run the server from the repo's root:

```
node --experimental-strip-types games/arcaderacer/arcaderacer.server.ts
```

and open `http://<your address>:5173/games/arcaderacer/client.html`, one window a player.

## Build the static site

```
yarn produce_static_site arcaderacer --base /patchwork-arcaderacer/
```

writes the playable site to `dist/`. Every push to `master` runs it on GitHub Actions and publishes
`dist/` to GitHub Pages.

## Licence

MIT, Copyright (c) 2026 Outside Data.
