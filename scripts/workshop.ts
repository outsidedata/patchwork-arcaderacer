// Starts the workshop's server (`tools/workshop/workshop.server.ts`) and opens one of its pages in
// the browser:
//
//   yarn workshop <game>                         the asset workshop, /?game=<game>
//   yarn workshop ui <game>                      the UI workshop, /ui?game=<game>
//   yarn workshop particles <game>               the particle workshop, /particles?game=<game>
//   yarn workshop particles --effects <path>     the particle workshop on one effects file anywhere on
//                [--sheet <key>=<path>]…         disk, with each sheet it draws from that no game catalogues
//   yarn workshop poses                          the pose lab, /poses
//   yarn workshop puppet3d <game>                the puppet3d workshop, /puppet3d?game=<game>
//   yarn workshop hair3d <game>                  the hair workshop, /hair3d?game=<game>
//   yarn workshop grass3d <game>                 the grass workshop, /grass3d?game=<game>
//   yarn workshop item3d <game>                  the item3d workshop, /item3d?game=<game>
//   yarn workshop                                the asset workshop with no game picked
//
// The particle workshop also takes `--effect <name>`, the effect it opens on, and `--file <repo path>`,
// which of a game's effects files it opens. `WORKSHOP_PORT` serves it on another port than 5180. The
// page is opened at 127.0.0.1, not localhost, so another program listening on the port's localhost is
// never the one reached. Ctrl-C stops the server.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { start } from '../tools/workshop/workshop.server.ts'

const pages = ['ui', 'particles', 'poses', 'puppet3d', 'hair3d', 'grass3d', 'item3d'] as const
type Page = typeof pages[number]
const isPage = (word: string | undefined): word is Page => pages.includes(word as Page)

export type Asked = { url: string, effects?: string, sheets: Record<string, string> }

// What the command line asks for: the page's address, and the effects file and sheets the server is
// started on.
export function asked(port: number, args: string[]): Asked {
  const words: string[] = []
  const flags: Record<'effects' | 'effect' | 'file', string | undefined> = { effects: undefined, effect: undefined, file: undefined }
  const sheets: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--effects' || a === '--effect' || a === '--file') {
      const v = args[++i]
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`)
      flags[a.slice(2) as 'effects' | 'effect' | 'file'] = v
    } else if (a === '--sheet') {
      const v = args[++i] ?? ''
      if (!/^[^=]+=.+$/.test(v)) throw new Error('--sheet is --sheet <key>=<path>')
      const [k, ...rest] = v.split('=')
      sheets[k] = rest.join('=')
    } else if (a.startsWith('--')) throw new Error(`${a} is not --effects, --sheet, --effect or --file`)
    else words.push(a)
  }
  const [first, second, extra] = words
  if (extra) throw new Error(`${extra} is one word too many`)
  const page = isPage(first) ? first : ''
  const game = isPage(first) ? second : first
  if (!isPage(first) && second) throw new Error(`${second} is one word too many`)
  const particles = page === 'particles'
  if (!particles && (flags.effects || flags.effect || flags.file || Object.keys(sheets).length))
    throw new Error('--effects, --sheet, --effect and --file are the particle workshop\'s: yarn workshop particles …')
  if (page === 'poses' && game) throw new Error('the pose lab takes no game: yarn workshop poses')
  if (page === 'ui' && !game) throw new Error('the ui workshop needs a game: yarn workshop ui <game>')
  if (page === 'puppet3d' && !game) throw new Error('the puppet3d workshop needs a game: yarn workshop puppet3d <game>')
  if (page === 'hair3d' && !game) throw new Error('the hair workshop needs a game: yarn workshop hair3d <game>')
  if (page === 'grass3d' && !game) throw new Error('the grass workshop needs a game: yarn workshop grass3d <game>')
  if (page === 'item3d' && !game) throw new Error('the item3d workshop needs a game: yarn workshop item3d <game>')
  if (particles && game && flags.effects) throw new Error('the particle workshop opens a game or an effects file, not both')
  if (particles && !game && !flags.effects)
    throw new Error('the particle workshop needs a game or an effects file: yarn workshop particles <game>, or yarn workshop particles --effects <path>')
  if (Object.keys(sheets).length && !flags.effects) throw new Error('--sheet is a sheet of the effects file given by --effects, and none was given')
  if (flags.file && !game) throw new Error('--file picks one of a game\'s effects files, and no game was given')
  const query = new URLSearchParams()
  if (game) query.set('game', game)
  if (flags.file) query.set('file', flags.file)
  if (flags.effect) query.set('effect', flags.effect)
  const q = query.toString()
  return { url: `http://127.0.0.1:${port}/${page}${q ? `?${q}` : ''}`, effects: flags.effects, sheets }
}

function open(url: string) {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]]
  spawn(command, args, { stdio: 'ignore', detached: true }).unref()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.WORKSHOP_PORT ?? 5180)
  const { url, effects, sheets } = asked(port, process.argv.slice(2))
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  await start({ port, root, effects, sheets })
  console.log(effects ? `particle workshop on ${effects} at ${url}` : `workshop at ${url}`)
  open(url)
}
