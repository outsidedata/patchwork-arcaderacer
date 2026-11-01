# CLAUDE.md

Load the `prime-directive` skill (`.claude/skills/prime-directive/`) before writing or changing any
code. It says the engine is frozen, where every new thing goes, and what never to ask. Where it
disagrees with any doc, it wins. It names the phase skill for each kind of work (a kind, a level,
the HUD, a plugin, proving it, going multiplayer, shipping); load that one too.

## Commands

```
yarn health                           # does this machine have what core needs: node, packages, and for baking Blender, the library, a WebP gltfpack, a WebP magick
yarn new-game <name>                  # games/<name>/: a game of one scene and a seat
yarn dev                              # serves the repo: localhost:5173/games/<game>/index.html, dev.html or client.html; localhost:5173 lists every game and its pages
yarn serve <game>                     # yarn dev, and games/<game>/<game>.server.ts on node, which client.html dials; started again on every change to a file it runs
yarn test                             # vitest run, but the game tests (`.game.test.ts`, `.predict.test.ts`)
yarn test:game                        # the game tests only
yarn vitest run <path>                # one file
yarn vitest run -t "<name>"           # one test by name
yarn tsc                              # typecheck, no emit
```

Baking art reads `BLENDER`, `PATCHWORK_LIBRARY`, `GLTFPACK` and `MAGICK` from the shell, else from
`.env` at the root (copied from `.env.example`, which lists them and their defaults; `.env` is not
committed). `yarn health` runs each one.

A `.test.ts` runs in node; a `.test.tsx` runs in jsdom with Testing Library. A test outside `games/`
never uses a game in `games/`: a clone of core has none.

## Where facts live

- The engine: `engine/engine.ts`, `engine/browser.ts` and their tests.
- An addon, plugin or game: the header of its own file and the tests beside it. A game starts from
  the header of `addons/scenemanager/scenemanager.addon.ts`, and from what `yarn new-game` writes
  (`scripts/new-game.ts`).
- How core is cloned, made into a game and updated: `README.md`.

Work on a branch.
