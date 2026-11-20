import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { looks } from './engine/browser.ts'
import { bundler } from './scripts/bundle.ts'
import { home } from './scripts/home.ts'
import { instanced } from './scripts/instance.ts'
import { cutsceneServe } from './plugins/cutscene/cutscene.serve.ts'
import { simulatorServe } from './addons/simulator/simulator.serve.ts'
import { isMounted, where } from './scripts/mounts.ts'

// `<folder>/looks.json`, the kinds with a look in that folder of the repo, read off the folder each
// time it is asked, so it is never behind the files: a page's client reads it before it imports any
// row's look (`engine/browser.ts`).
const looksJson: Plugin = {
  name: 'looks-json',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost')
      if (!pathname.endsWith('/looks.json')) return next()
      const root = path.resolve(server.config.root)
      const rel = path.posix.normalize(decodeURIComponent(pathname.slice(1, -'looks.json'.length)))
      if (rel.startsWith('..')) return next()
      const folder = where(root, rel)
      let names: string[]
      try {
        if (!statSync(folder).isDirectory()) return next()
        names = readdirSync(folder)
      } catch {
        return next()
      }
      res.setHeader('content-type', 'application/json')
      res.setHeader('cache-control', 'no-cache')
      res.end(JSON.stringify(looks(names)))
    })
  },
}

// `<kind>.client.ts?instance`, the drawing file made to hand out a fresh copy of itself for each row
// (`scripts/instance.ts`), for a page served file by file and for the tests, so the file is fetched
// once whatever the number of rows. It runs after the types are stripped and before Vite writes the
// file's imports as urls.
const instance: Plugin = {
  name: 'client-instance',
  enforce: 'post',
  transform(code, id) {
    if (!id.endsWith('.client.ts?instance')) return
    return { code: instanced(code), map: null }
  },
}

// A game's page, `/games/<game>/<page>.html` (or the folder, for its `index.html`), served as a
// bundle (`scripts/bundle.ts`): built again each time it is asked for, reading only the files that
// changed since, with its files under `/@bundle/<page's path>/`, kept until the page is built again.
// A build that fails is answered with what esbuild said.
const bundles: Plugin = (() => {
  const made = new Map<string, ReturnType<typeof bundler>>()
  const served = new Map<string, Uint8Array>()
  const PREFIX = '/@bundle/'
  return {
    name: 'game-bundle',
    configureServer(server) {
      const root = path.resolve(server.config.root)
      server.middlewares.use(async (req, res, next) => {
        const { pathname } = new URL(req.url ?? '/', 'http://localhost')
        if (pathname.startsWith(PREFIX)) {
          const file = served.get(pathname)
          if (!file) return next()
          res.setHeader('content-type', pathname.endsWith('.map') ? 'application/json' : 'text/javascript')
          res.setHeader('cache-control', 'no-cache')
          return void res.end(file)
        }
        const page = decodeURIComponent(pathname.slice(1)) + (pathname.endsWith('/') ? 'index.html' : '')
        if (!/^games\/[^/]+\/[^/]+\.html$/.test(page) || !existsSync(where(root, page))) return next()
        let b = made.get(page)
        if (!b) made.set(page, b = bundler({ root, page, url: r => `/${r}`, out: `${PREFIX}${page}/` }))
        try {
          const built = await b.build()
          for (const k of [...served.keys()]) if (k.startsWith(`${PREFIX}${page}/`)) served.delete(k)
          for (const [f, bytes] of built.files) served.set(`${PREFIX}${page}/${f}`, bytes)
          res.setHeader('content-type', 'text/html')
          res.setHeader('cache-control', 'no-cache')
          res.end(built.html)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          const errors = (e as { errors?: { text: string; location?: { file: string; line: number } }[] }).errors
          res.end(errors ? errors.map(x => `${x.location ? `${x.location.file}:${x.location.line}: ` : ''}${x.text}`).join('\n') : (e as Error).stack)
        }
      })
    },
    async buildEnd() {
      await Promise.all([...made.values()].map(b => b.dispose()))
      made.clear()
      served.clear()
    },
  }
})()

// A file of a mounted game's folder (`scripts/mounts.ts`), `/games/<a mounted game>/<file>`, which Vite's own serving
// cannot reach, its folder being out of the repo: sent as it is, links followed, with its type by its extension. A
// page is the bundle's (above); a file the bundle reads (a module, a scene file a module imports) is never asked for.
// The files Vite keeps out of the repo's (`server.fs.deny`) are kept out of a mounted folder too.
const TYPES: Record<string, string> = {
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
}
const KEPT_OUT = /(^|\/)(\.env(\..*)?|\.git)(\/|$)|\.(pem|key)$/
const mountedFiles: Plugin = {
  name: 'mounted-files',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost')
      const m = /^\/games\/([^/]+)\/(.+)$/.exec(decodeURIComponent(pathname))
      if (!m || !isMounted(m[1])) return next()
      const rel = path.posix.normalize(m[2])
      if (rel.startsWith('..') || KEPT_OUT.test(rel)) return next()
      const file = where(path.resolve(server.config.root), `games/${m[1]}/${rel}`)
      let size: number
      try {
        const s = statSync(file)
        if (!s.isFile()) return next()
        size = s.size
      } catch {
        return next()
      }
      res.setHeader('content-type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
      res.setHeader('content-length', String(size))
      res.setHeader('cache-control', 'no-cache')
      createReadStream(file).pipe(res)
    })
  },
}

// `/favicon.ico`, which every page's browser asks for, answered with a small square drawn inline, so
// no page logs a 404 for it.
const favicon: Plugin = {
  name: 'favicon',
  configureServer(server) {
    const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#2961b3"/><rect x="4" y="4" width="8" height="8" rx="1" fill="#fff2db"/></svg>'
    server.middlewares.use((req, res, next) => {
      if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/favicon.ico') return next()
      res.setHeader('content-type', 'image/svg+xml')
      res.setHeader('cache-control', 'max-age=86400')
      res.end(icon)
    })
  },
}

export default defineConfig({
  plugins: [looksJson, instance, bundles, mountedFiles, favicon, home(), cutsceneServe(), simulatorServe()],
  server: {
    fs: {
      // Vite's own list but for `*.crt`, which it keeps out as a TLS certificate: a `.crt` here is a
      // Commodore 64 cartridge a game reads (games/emulatorc64). A key stays out, as `.pem` or `.key`.
      deny: ['.env', '.env.*', '*.pem', '*.key', '**/.git/**'],
    },
  },
})
