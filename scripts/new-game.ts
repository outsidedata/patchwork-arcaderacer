// Makes a new game: `node --experimental-strip-types scripts/new-game.ts <name>` (`yarn new-game
// <name>`) writes `games/<name>/` under the working directory, `games/` too when there is none. It is
// the editor's New game (`extensions/games/games.route.ts`'s `make`, whose header lists the files), on
// the disk: a game of one scene, `main` (`play` for a game named `main`, whose manager is
// `main.scene.json`), 960 by 540, serving on the port after the highest the games there use, or 9001.
// It refuses, writing nothing, a name that is no lower-case letter then letters, digits and underscores, one of
// the new game's kinds', a plugin's or an addon's, and a game's that is there.
import { fileURLToPath } from 'node:url'
import { Files } from '#editor/server/files.ts'
import { make } from '#extensions/games/games.route.ts'

export const newGame = (name: string, root: string) =>
  make({ name, scene: name === 'main' ? 'play' : 'main', width: 960, height: 540 }, new Files(root))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { files, port } = await newGame(process.argv[2] ?? '', process.cwd())
    console.log(`${files.join('\n')}\nserving on ${port}`)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
