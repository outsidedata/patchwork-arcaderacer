// Images a component draws from, loaded once each is asked for; their pixels, read as the files hold
// them, are `pixels.ts`'s. A url is a plain path, as a loader catalogue and a sheet write it, so it
// is encoded once, with `encodeURI`, where it is loaded.
import { useEffect, useState } from 'react'

// The images at `urls`, in order, once every one has loaded; undefined until then.
export function useImages(urls: string[]): HTMLImageElement[] | undefined {
  const key = urls.join('\n')
  const [loaded, setLoaded] = useState<{ key: string; images: HTMLImageElement[] }>()
  useEffect(() => {
    let gone = false
    Promise.all(key.split('\n').filter(Boolean).map(url => {
      const img = new Image()
      img.src = encodeURI(url)
      return img.decode().then(() => img)
    })).then(images => { if (!gone) setLoaded({ key, images }) }, () => {})
    return () => { gone = true }
  }, [key])
  return loaded?.key === key ? loaded.images : undefined
}

// Draws a sheet's frame (`plugins/loader/loader.sim.ts`) from its page with the top left of its whole
// picture at [x, y], `k` surface pixels to a frame pixel: its kept pixels, `trim`, where they lie in
// the whole picture, and a frame stored turned a quarter clockwise on its page turned back, its
// box's height across and its width down.
export function drawFrame(ctx: CanvasRenderingContext2D, img: CanvasImageSource, f: { box: number[]; rotated: boolean; trim: number[] }, x: number, y: number, k: number) {
  const [bx, by, bw, bh] = f.box, kx = x + f.trim[0] * k, ky = y + f.trim[1] * k
  if (!f.rotated) return ctx.drawImage(img, bx, by, bw, bh, kx, ky, bw * k, bh * k)
  ctx.save()
  ctx.translate(kx, ky + bw * k)
  ctx.rotate(-Math.PI / 2)
  ctx.drawImage(img, bx, by, bw, bh, 0, 0, bw * k, bh * k)
  ctx.restore()
}
