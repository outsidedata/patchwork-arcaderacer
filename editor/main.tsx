// The editor's page, on the one game its url names, `/editor/?game=<name>`. It loads the extensions
// the server lists (`/api/extensions`): the editor's own, every plugin's and addon's, which it turns
// on as the game names them (`Editor.fit`), and the game's; puts back the session of this game a
// reload interrupted, or opens the game, and saves the session whenever the page goes (`keep`). A
// page with no game, or a game there is not, shows the games to open.
//
// It dials the editor pages' socket (`editor/server/pages.ts`) before anything else and sends every
// change it makes to the files on it (`files.ts`). On it, it says which page it is and its game, and
// answers the editor's MCP server (`mcp.ts`), so an LLM calls every command of the page the user is
// in; takes in what the server tells it of the changes other pages made, of the disk and of Vite
// (`hear`); and hands it to the extensions as `Editor.server`, on which the Node panel hears the games
// on node. When the socket closes, the server has gone, stopped or starting again on its own new code
// under `node --watch`: the page says so, waits for it and reloads (`awaitServer`).
import { createRoot } from 'react-dom/client'
import 'dockview-react/dist/styles/dockview.css'
import './ui/ui.css'
import './themes/dark.css'
import './themes/light.css'
import { App } from './App.tsx'
import { channel } from './channel.ts'
import { Editor, fetched, type Loader } from './editor.ts'
import { http, PAGE } from './files.ts'
import { readGame, type Game } from './games.ts'
import { drawn } from './drawn.ts'
import { gate } from './gate.ts'
import { mcp } from './mcp.ts'
import { awaitServer, hear, keep } from './page.ts'
import type { Extensions } from './server/listing.ts'
import { dial } from '#addons/socket/socket.addon.ts'

const THEME = 'editor.theme'

declare global {
  interface Window { editor: Editor }
}

gate('.game-stage')
drawn()

const name = new URLSearchParams(location.search).get('game') ?? undefined

// Said in the editor's console once there is an editor, and in the browser's before it: a request
// the page boots with may find no server.
let ed: Editor | undefined
const back = awaitServer(m => (ed ? ed.info(m) : console.info(m)), () => location.reload())
const reach = <T,>(asked: Promise<T>): Promise<T> => asked.catch(e => {
  if (!(e instanceof TypeError)) throw e
  void back()
  return new Promise<T>(() => {})
})

// The socket is dialled first: the page's changes to the files are sent on it (`files.ts`), and it is
// joined before an extension is imported, since importing one can make Vite bundle a dependency anew,
// and every module the page has then must be read again.
const socket = channel(dial(`ws://${location.host}/api/page`, () => void back()))
const files = http(socket)

// The game the url names, when it is one the editor opens and its manager scene reads.
let game: Game | undefined
let missing: string | undefined
if (name !== undefined) {
  const games = await reach(files.games())
  const it = games.find(g => g.name === name)
  if (!it) missing = `no game ${name}: the games are ${games.filter(g => g.opens).map(g => g.name).join(', ')}`
  else if (!it.opens) missing = `${name} is not on the scenemanager pattern`
  else game = await reach(readGame(files, name)).catch(e => { missing = `${name} could not be read: ${(e as Error).message}`; return undefined })
}
const listed = await reach(fetched<Extensions>(`/api/extensions${game ? `?game=${encodeURIComponent(game.name)}` : ''}`))
const loaders = (urls: string[]): Record<string, Loader> => Object.fromEntries(urls.map(u => [u, () => import(/* @vite-ignore */ u)]))

const editor = ed = new Editor(files, game, loaders(listed.game), loaders(listed.named))
// For the browser's console, and for a script driving the page.
window.editor = editor

editor.server = socket
hear(editor, socket, { id: PAGE, name, opened: game !== undefined, since: performance.timeOrigin })

await editor.load(loaders(listed.own))
await editor.fit()
if (missing) editor.error(missing)
mcp(editor, socket)

editor.setTheme(editor.themes.has(localStorage.getItem(THEME) ?? '') ? localStorage.getItem(THEME)! : 'dark')
editor.subscribe(() => localStorage.setItem(THEME, editor.theme), ['theme'])

// Each game's session is kept by itself, so going to another game's page in this tab, and back, puts
// back each one's.
await keep(editor, sessionStorage, `editor.session.${name ?? ''}`, game !== undefined)

createRoot(document.getElementById('root')!).render(<App editor={editor} />)
