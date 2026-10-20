// The Tiles panel's backend compresses a layer's cells as Tiled does, so what it hands back is read
// by the same decompressors the loader reads a map with.
import { expect, test } from 'vitest'
import { gunzipSync, unzlibSync } from 'fflate'
import { decompress } from 'fzstd'
import type { Route } from '#editor/server/routes.ts'
import { routeFiles } from '#editor/test/editor.ts'
import { tilemap } from './tilemap.route.ts'

const routes = new Map<string, Route>()
tilemap({ get: (r, f) => routes.set(`GET ${r}`, f), post: (r, f) => routes.set(`POST ${r}`, f) })
const compress = (body: unknown) => routes.get('POST compress')!({ query: new URLSearchParams(), body, files: routeFiles() }) as { data: string }

const raw = Uint8Array.from({ length: 4 * 320 * 27 }, (_, i) => (i % 4 === 0 ? (i >> 5) % 7 : 0))
const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'))

test('zlib, gzip and zstd, at the map\'s level or each one\'s own default, unpack to the cells packed', () => {
  const data = Buffer.from(raw).toString('base64')
  expect(unzlibSync(bytes(compress({ compression: 'zlib', level: -1, data }).data))).toEqual(raw)
  expect(unzlibSync(bytes(compress({ compression: 'zlib', level: 9, data }).data))).toEqual(raw)
  expect(gunzipSync(bytes(compress({ compression: 'gzip', level: -1, data }).data))).toEqual(raw)
  expect(decompress(bytes(compress({ compression: 'zstd', level: -1, data }).data))).toEqual(raw)
  expect(decompress(bytes(compress({ compression: 'zstd', level: 19, data }).data))).toEqual(raw)
  expect(bytes(compress({ compression: 'zstd', level: -1, data }).data).length).toBeLessThan(raw.length / 4)
})

test('anything else is refused, saying what it takes', () => {
  expect(() => compress({ compression: 'lz4', level: -1, data: '' })).toThrow('compress knows zlib, gzip and zstd, and not lz4')
  expect(() => compress({ compression: 'zlib', level: 1.5, data: '' })).toThrow('compress takes base64 data and a whole level of -1 or more')
  expect(() => compress(undefined)).toThrow('compress takes base64 data')
})
