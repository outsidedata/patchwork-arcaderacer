// The games extension: the games of `games/` listed, another opened, and a new one made. A game is
// the editor's project: the page is on one game, and opening another, or the one just made, is going
// to its page (`Editor.openGame`). A new game is what the scenemanager's header says a game is,
// blank: a manager naming one scene, which every connection enters; that scene, on render2d with no
// world of its own yet, holding the scenemanager's row alone; their sims; the game's pages, its
// server and a test that boots it (`games.route.ts`). It is made by a plain request (`routeOf`),
// outside any change, and no undo takes it back: the page goes to the new game's own page, whose
// history starts empty. New scene, New kind and Place make it a game.
//
// The Games panel (`games.components.tsx`): every game there is, the one open marked, another opened
// by Open (`Editor.openGame`); and New game, a form of its name, its scene's name and the size
// of its canvas. File › New Game… shows it.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`):
//   games.list  the games, each whether it is on the scenemanager pattern, which the editor opens;
//   games.new   a game made, blank, and opened.
import { z } from 'zod'
import { routeOf, type Editor } from '#editor/editor.ts'
import { GamesPanel } from './games.components.tsx'

export type Made = { files: string[]; port: number }

// Game `name` made blank, its scene `scene` of `width` by `height` pixels, and opened: once the call
// that made it has had its answer, the page goes to it.
export async function makeGame(ed: Editor, name: string, scene: string, width: number, height: number): Promise<Made> {
  if ((await ed.files.games()).some(g => g.name === name)) throw new Error(`there is a game ${name} already`)
  const made = await routeOf<Made>('games', 'make', { name, scene, width, height })
  await ed.openGame(name)
  return made
}

export function games(ed: Editor) {
  ed.panel({ id: 'games', title: 'Games', area: 'left', component: GamesPanel })
  ed.command({ id: 'file.newGame', title: 'New Game…', menu: 'File', run: () => ed.reveal('games') })
  ed.command({
    id: 'games.list',
    title: 'Games: list',
    input: z.object({}).describe('The games of games/, each by its name, whether the editor opens it (it is on the scenemanager pattern), and which is open.'),
    run: async () => ({ games: (await ed.files.games()).map(g => ({ name: g.name, opens: g.opens, open: ed.game?.name === g.name })) }),
  })
  ed.command({
    id: 'games.new',
    title: 'Games: new',
    input: z.object({
      name: z.string().describe('the game\'s name, its folder\'s: a lower-case letter, then lower-case letters and digits'),
      scene: z.string().default('main').describe('its one scene\'s name: lower-case letters, digits and dashes, not the game\'s'),
      width: z.number().int().default(960).describe('its canvas\'s width in pixels'),
      height: z.number().int().default(600).describe('its canvas\'s height in pixels'),
    }).describe('Makes a blank game, a manager naming one scene on render2d with nothing in it but its scenemanager row, its sims, pages, server and test, on a port no other game uses, and opens it: the page goes to it once this call has its answer. Not undone: it is a game of its own. Answers its files and port.'),
    run: ({ name, scene, width, height }) => makeGame(ed, name, scene, width, height),
  })
}
