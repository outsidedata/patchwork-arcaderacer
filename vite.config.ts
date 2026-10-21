import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { looks } from './engine/browser.ts'

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

export default defineConfig({
  plugins: [react(), looksJson],
  server: {
    fs: {
      // Vite's own list but for `*.crt`, which it keeps out as a TLS certificate: a `.crt` here is a
      // Commodore 64 cartridge a game reads (games/emulatorc64). A key stays out, as `.pem` or `.key`.
      deny: ['.env', '.env.*', '*.pem', '*.key', '**/.git/**'],
    },
  },
})
