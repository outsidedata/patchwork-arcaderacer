// node's resolving for a mounted game's server (`mounts.ts`): handed to node with `--import` by `servers.ts`, which
// names the mounted games in PATCHWORK_MOUNTS (`{ "<name>": "<folder>" }`). It registers `resolve`, below, so a file of
// a mounted folder imports the engine as a file of the repo does: the repo's names (`#engine/*` and the rest) are the
// repo's folders, and a package (`three`) is the repo's, found from the repo's root. Everything else is node's own.
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mount, named, repoName } from './mounts.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
for (const folder of Object.values(JSON.parse(process.env.PATCHWORK_MOUNTS ?? '{}') as Record<string, string>)) mount(root, folder)

// a bare package name: not relative, not absolute, not a url, not one of the repo's names
const bare = (s: string) => !/^(\.{0,2}\/|#|[a-z][a-z0-9+.-]*:)/i.test(s)

registerHooks({
  resolve(specifier, context, next) {
    const named_ = repoName(root, specifier)
    if (named_ !== undefined) return { url: pathToFileURL(named_).href, shortCircuit: true }
    const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : undefined
    // a file of a mounted folder: one the repo names, which is not under the repo's root
    const mine = parent !== undefined && path.relative(root, parent).startsWith('..') && named(root, parent) !== undefined
    if (mine && bare(specifier)) return next(specifier, { ...context, parentURL: pathToFileURL(path.join(root, 'package.json')).href })
    return next(specifier, context)
  },
})
