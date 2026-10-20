// The Tiles panel's backend (`tilemap.extension.tsx`): the machine's compressors, which a page has
// none of for zstd. `POST compress` is handed `{ compression, level, data }`, a tile layer's cells as
// base64, and answers `{ data }`, them compressed as a Tiled map stores them: `zlib`, `gzip` or
// `zstd`, at the map's `compressionlevel`, -1 being each one's own default, as it is in Tiled.
import { constants, deflateSync, gzipSync, zstdCompressSync } from 'node:zlib'
import type { Router } from '#editor/server/routes.ts'

export function tilemap(r: Router) {
  r.post('compress', ({ body }) => {
    const { compression, level, data } = (body ?? {}) as { compression?: unknown; level?: unknown; data?: unknown }
    if (typeof data !== 'string' || typeof level !== 'number' || !Number.isInteger(level) || level < -1) throw new Error('compress takes base64 data and a whole level of -1 or more')
    const raw = Buffer.from(data, 'base64')
    const packed = compression === 'zlib' ? deflateSync(raw, { level })
      : compression === 'gzip' ? gzipSync(raw, { level })
      : compression === 'zstd' ? zstdCompressSync(raw, { params: { [constants.ZSTD_c_compressionLevel]: level < 0 ? 0 : level } })
      : undefined
    if (!packed) throw new Error(`compress knows zlib, gzip and zstd, and not ${String(compression)}`)
    return { data: packed.toString('base64') }
  })
}
