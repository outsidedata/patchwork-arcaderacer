import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { looks } from './engine/browser.ts'
import { bundler } from './scripts/bundle.ts'
import { instanced } from './scripts/instance.ts'

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
      const folder = path.join(root, decodeURIComponent(pathname.slice(0, -'looks.json'.length)))
      if (!folder.startsWith(root + path.sep) && folder !== root + path.sep) return next()
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
        if (!/^games\/[^/]+\/[^/]+\.html$/.test(page) || !existsSync(path.join(root, page))) return next()
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

export default defineConfig({
  plugins: [react(), looksJson, instance, bundles],
  server: {
    fs: {
      // Vite's own list but for `*.crt`, which it keeps out as a TLS certificate: a `.crt` here is a
      // Commodore 64 cartridge a game reads (games/emulatorc64). A key stays out, as `.pem` or `.key`.
      deny: ['.env', '.env.*', '*.pem', '*.key', '**/.git/**'],
    },
  },
})
