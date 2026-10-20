// A library for the tests of `cc0.ts` and `bake.ts`: a `cc0-textures/cc0-textures.mjs` of the real one's
// shape (`read`, `resolve`, `download`), whose `download` copies a set from `fixtures/<zip>/` instead of
// fetching it and logs each call to `downloads.log`, and a list of sets in `textures/cc0-textures.json`.
import fs from 'node:fs'
import path from 'node:path'

const MODULE = `
import fs from 'node:fs'
import path from 'node:path'
export const read = (library) => JSON.parse(fs.readFileSync(path.join(library, 'textures', 'cc0-textures.json'), 'utf8'))
export const resolve = (directory, name) => {
  if (directory[name]) return name
  throw new Error(\`no cc0-textures set \${name} (yarn cc0-textures:search <words>)\`)
}
export const download = async (directory, zip, { library }) => {
  fs.appendFileSync(path.join(library, 'downloads.log'), zip + '\\n')
  const dir = path.join(library, 'textures', 'cc0-textures', zip)
  if (!fs.existsSync(dir)) fs.cpSync(path.join(library, 'fixtures', zip), dir, { recursive: true })
  return { dir, fetched: true }
}
`

// A library at `library`, its list empty.
export const fakeLibrary = (library: string) => {
  fs.mkdirSync(path.join(library, 'cc0-textures'), { recursive: true })
  fs.mkdirSync(path.join(library, 'textures'), { recursive: true })
  fs.writeFileSync(path.join(library, 'cc0-textures', 'cc0-textures.mjs'), MODULE)
  fs.writeFileSync(path.join(library, 'textures', 'cc0-textures.json'), '{}')
}

// A set `zip` in the library's list, its zip holding the files named, each holding its own name.
export const fakeSet = (library: string, zip: string, files: string[]) => {
  const list = path.join(library, 'textures', 'cc0-textures.json')
  const directory = JSON.parse(fs.readFileSync(list, 'utf8'))
  directory[zip] = { zip: `cc0t/${zip}.zip`, tags: [], maps: files }
  fs.writeFileSync(list, JSON.stringify(directory))
  fs.mkdirSync(path.join(library, 'fixtures', zip), { recursive: true })
  for (const f of files) fs.writeFileSync(path.join(library, 'fixtures', zip, f), f)
}

// The sets downloaded, in order.
export const downloads = (library: string) => {
  const log = path.join(library, 'downloads.log')
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []
}
