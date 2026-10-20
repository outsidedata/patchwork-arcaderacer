// The dom every React test runs in (`setup.ts`): an image of an object url is read as a browser reads
// it. A picture's bytes, whatever its type, or an SVG typed as one, load it, a PNG with its size, once
// they are read, which `decode` waits for; bytes that are no picture, whatever their type, a PNG that
// does not decode, or a blob let go fail it, and `decode` refuses; it is complete either way; and a
// blob read after the image was given another is nobody's.
import { expect, test } from 'vitest'
import { encodePng } from '#plugins/loader/loader.sim.ts'

const png = (width: number, height: number) => encodePng({ width, height, data: new Uint8ClampedArray(width * height * 4), text: {} })
// An image given an object url of `bytes`, and every event it is told.
const image = (bytes: Uint8Array | string, type?: string) => {
  const img = new Image()
  const heard: string[] = []
  img.addEventListener('load', () => heard.push('load'))
  img.addEventListener('error', () => heard.push('error'))
  img.src = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  return { img, heard }
}

test('a PNG\'s bytes load it with its size, and decode answers once they are read', async () => {
  const { img, heard } = image(png(3, 2))
  expect([img.complete, img.naturalWidth]).toEqual([false, 0])
  await img.decode()
  expect([img.naturalWidth, img.naturalHeight, img.complete, heard]).toEqual([3, 2, true, ['load']])
})

test('a JPEG\'s bytes load it, with no pixels, as jsdom decodes none', async () => {
  const { img, heard } = image(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))
  await img.decode()
  expect([img.naturalWidth, heard]).toEqual([0, ['load']])
})

test('bytes that are no picture, a PNG that does not decode, and a blob let go fail it, and decode refuses', async () => {
  for (const bytes of ['{"not": "a picture"}', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])]) {
    const { img, heard } = image(bytes)
    await expect(img.decode()).rejects.toThrow('The source image cannot be decoded.')
    // Broken, which is complete too, as a browser has it.
    expect([img.complete, heard]).toEqual([true, ['error']])
  }
  const url = URL.createObjectURL(new Blob([png(1, 1) as BlobPart]))
  URL.revokeObjectURL(url)
  const img = new Image()
  img.src = url
  await expect(img.decode()).rejects.toThrow('The source image cannot be decoded.')
})

test('a blob read after the image was given another url is told of nothing: the image is the second\'s', async () => {
  const { img, heard } = image(png(5, 5))
  img.src = URL.createObjectURL(new Blob([png(2, 7) as BlobPart]))
  await img.decode()
  await new Promise(r => setTimeout(r, 20))
  expect([img.naturalWidth, img.naturalHeight, heard]).toEqual([2, 7, ['load']])
})

test('a picture is judged by its bytes whatever its type, an SVG by its type: an AVIF, a HEIF, an icon and a cursor load with no pixels; bytes of no picture fail, typed as one or not', async () => {
  const box = (brand: string) => new Uint8Array([0, 0, 0, 0x18, ...[...`ftyp${brand}`].map(c => c.charCodeAt(0))])
  for (const [bytes, type] of [
    [box('avif'), 'image/avif'], [box('heic'), ''], [new Uint8Array([0, 0, 1, 0, 1, 0]), 'image/x-icon'], [new Uint8Array([0, 0, 2, 0, 1, 0]), ''],
    ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'],
  ] as const) {
    const { img, heard } = image(bytes, type)
    await img.decode()
    expect([img.naturalWidth, img.complete, heard]).toEqual([0, true, ['load']])
  }
  // An SVG's text of any other type, and bytes of no picture typed as a PNG, fail.
  for (const [bytes, type] of [['<svg xmlns="http://www.w3.org/2000/svg"/>', 'text/plain'], ['{"not": "a picture"}', 'image/png'], [box('isom'), 'image/avif']] as const) {
    const { img, heard } = image(bytes, type)
    await expect(img.decode()).rejects.toThrow('The source image cannot be decoded.')
    expect([img.complete, heard]).toEqual([true, ['error']])
  }
})
