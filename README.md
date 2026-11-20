# arcaderacer

An arcade racing game for the browser, built on [Patchwork](https://github.com/outsidedata/patchwork).

Play it: https://outsidedata.github.io/patchwork-arcaderacer/

- Three courses: a forest, Tokyo and Paris
- Three laps a race, six cars on the grid, CPU rivals in every seat no player takes
- A car select before each race: pick your car from a line of cars, left and right moving one car along
- Drifting: tap the brake or hold the handbrake into a turn to slide; a clean drift earns boost
- Up to six players together on a server: the first to join hosts and starts each race, the rest
  race in it, wait for the next, or spectate (How a match goes, below)
- Lap times, best lap, a live standings list, a minimap and a speedometer
- Music on every course

## Controls

| action | keyboard | gamepad |
|---|---|---|
| steer | ← → or A D | d-pad or left stick |
| throttle | ↑ or W | A or right trigger |
| brake | ↓ or S | B or left trigger |
| handbrake | Space | X |
| menus | arrows and Enter, Escape back | |

## Playing alone

`index.html` is one player in one tab, with no lobby. Choose a course, pick a car, and the race starts
on that course: the cars stand still until the course has loaded, then the grid hold and the 3-2-1
begin. The results stay up until you press EXIT, which takes you back to the title.

## How a match goes

This is `client.html`, players together on a server. Everyone lands on the title. The roster in its bottom-left corner lists every player, "PLAYER n" in the
order they joined, the host and you marked, and the car each has picked.

1. The host (the first to join) chooses a course. Every player is shown it.
2. Every player picks a car. Each is told what the match waits on: the host's course, another player's
   car, or the host's start.
3. Once every player has picked, the host's START button comes up and the host presses it.
4. Everyone goes to the course. Each page loads it behind a loading screen, then says it is ready. The
   race holds, with every car still, on a "waiting for players" list of who is ready and who is still
   loading, until every racer is ready or 45 seconds have passed. Only then does the grid hold, the
   3-2-1 and the start begin, for everyone at once.
5. A player who finishes is told they are waiting for the others. The results come once every racer
   has finished, or 20 seconds after the first did, and are shown for 15 seconds with the seconds left.
6. Everyone goes back to the title together when they run out, or as soon as any player presses EXIT.
   The next match starts fresh from step 1.

Someone who joins while a match runs waits on the title and can spectate it. If the host leaves
mid-match, everyone goes back to the title and the next player to have joined is the host. A player who
leaves mid-race leaves their car standing where it was.

Every number above is a definition (`assets/arcaderacer.json`: `race.wait`, `race.grace`,
`race.results`, and the `match` words), and the rules are in the headers of `race.sim.ts`,
`plugins/match/match.sim.ts`, `plugins/match/match.plugin.ts` and `addons/match/match.addon.ts`.

## Run it

```
yarn install
yarn vite
```

Open `http://localhost:5173/games/arcaderacer/index.html` to play alone in one tab.

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
