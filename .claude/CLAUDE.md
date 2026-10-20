# CLAUDE.md

Load the `prime-directive` skill (`.claude/skills/prime-directive/`) before writing or changing any
code. It says the engine is frozen, where every new thing goes, and what never to ask. Where it
disagrees with any doc, it wins. It names the phase skill for each kind of work (a kind, a level,
the HUD, a plugin, an extension, proving it, going multiplayer, shipping); load that one too.

## Commands

```
yarn health                           # does this machine have what core needs: node, packages, and for baking Blender, the library, a WebP gltfpack, a WebP magick
yarn new-game <name>                  # games/<name>/: a game of one scene and a seat, as the editor's File → New Game writes it
yarn test                             # vitest run — the whole suite but the view tests
yarn vitest run <path>                # one file
yarn vitest run -t "<name>"           # one test by name
yarn test:view                        # the view tests (`.view.test.tsx`) only
yarn test:view <path>                 # one view test file
yarn tsc                              # typecheck, no emit
yarn lint                             # eslint
yarn editor [game] [--port <port>]    # localhost:5173/editor/?game=<game>, one game a page; games/<game>/index.html or client.html
                                      # 5173 busy (another clone's editor)? `yarn editor --port 5174`, or `--port 0` for any free one; it prints its url
                                      # and the editor's MCP server at /api/mcp (.mcp.json): every command of the open page is a tool
                                      # no HMR: a page takes in or reloads for every change to the files of its game or of none, its own, another page's or the disk's; the server restarts on its own code
node --experimental-strip-types games/<game>/<game>.server.ts
```

Baking art reads `BLENDER`, `PATCHWORK_LIBRARY`, `GLTFPACK` and `MAGICK` from the shell, else from
`.env` at the root (copied from `.env.example`, which lists them and their defaults; `.env` is not
committed). `yarn health` runs each one.

A `.test.ts` runs in node; a `.test.tsx` runs in jsdom with Testing Library. A test that attaches a
game view (`session.attach`, directly or through the Game panel), so the game's client is made and
draws frames in jsdom, goes in `<name>.view.test.tsx` beside `<name>.test.tsx`, never in the
`.test.tsx`: `yarn test` leaves those out, and `yarn test:view` runs them. A test outside `games/`
never uses a game in `games/`: a clone of core has none.

## Where facts live

- The engine: `engine/engine.ts`, `engine/browser.ts` and their tests.
- An addon, plugin, game or extension: the header of its own file and the tests beside it. A game
  starts from the header of `addons/scenemanager/scenemanager.addon.ts`, and from what
  `yarn new-game` writes (`extensions/games/games.route.ts`).
- The editor: the headers of `editor/editor.ts`, `editor/session.ts`, `editor/server/server.ts`,
  and of `editor/server/changes.ts`, every change to the files and its undo.
- How core is cloned, made into a game and updated: `README.md`.

Work on a branch.
