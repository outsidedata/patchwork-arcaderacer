// A game's scenes as the game loads them, for the workshop's server, run as
//
//   node --experimental-strip-types tools/workshop/loaded.ts <manager scene file>
//
// and printed as JSON: `[{ name, file, partial?, scene }]`, each scene the manager names loaded by
// scenemanager's own `child` (the manager's world and prefabs under it, its partial between, when it
// `extends` one), with its file and its partial's file as absolute paths; or the manager alone, read
// as it is, when it names no scenes. A process of its own each time, since `child` imports a scene by
// its sim, and node keeps an import for the life of a process: a server that loaded a scene once
// would show it as it was before every save.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { child } from '../../addons/scenemanager/scenemanager.addon.ts'

const manager = path.resolve(process.argv[2])
const top = JSON.parse(fs.readFileSync(manager, 'utf8'))
const base = pathToFileURL(manager).href
const named = top.prefabs?.scenemanager?.scenes as Record<string, { file: string; suspend: boolean }> | undefined
const out = []
if (!named) out.push({ name: path.basename(manager, '.scene.json'), file: manager, scene: top })
else for (const [name, e] of Object.entries(named)) {
  const file = path.resolve(path.dirname(manager), e.file)
  if (!fs.existsSync(file)) continue
  const own = JSON.parse(fs.readFileSync(file, 'utf8'))
  const partial = typeof own.extends === 'string' ? path.resolve(path.dirname(file), own.extends) : undefined
  out.push({ name, file, ...(partial ? { partial } : {}), scene: (await child(top, name, e, base)).scene })
}
process.stdout.write(JSON.stringify(out))
