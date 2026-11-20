// Checks that a plugin is built on the model: a host that keeps a table of words, each word's function
// delivered by the plugin that owns the word, switched on by the scene. Run from the repo root:
//
//   node .claude/skills/connecting-plugins-using-mods/check.mjs plugins/<p>
//   node .claude/skills/connecting-plugins-using-mods/check.mjs games/<game>/plugins/<p>
//
// It reads the plugin's own halves (`<p>.sim.ts`, `<p>.plugin.ts`) and every `<a>.<p>.ts` mod file in
// plugins/ and games/*/plugins/ that delivers to it. It reports, one line each:
//   table      the mods keys the plugin reads (`mod`, `modsOf`, `named`), and whether `behaviors` is one
//   contract   the exported types its tables are keyed to (`Record<string, X>`), what a word's owner writes
//   refusal    whether it throws naming the word and world.<p>.mods.behaviors when nothing delivers a word
//   dispatch   every `switch` on a thing's field and every `=== '<literal>'` on a field that names what a
//              thing is (do, word, type, what, is, shape, make, op): words it handles itself instead of
//              looking up. Finding a row by its kind is not one.
//   coupling   every plugin it imports for real (not `import type`), other than math and loader
//   delivered  every mod file that delivers to it, the keys each exports, and the words each `behaviors()`
//              hands back, by running it
// It exits 1 when the plugin dispatches on words but keeps no table, or imports another plugin for real;
// and 0 otherwise. Everything else is reported for reading, not judged.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Plugins every other plugin may import as a library: arithmetic, and the loader's readers of an asset.
const LIBRARY = new Set(['math', 'loader'])

const [, , dirArg] = process.argv
if (!dirArg) {
  console.error('usage: node check.mjs plugins/<p>  |  games/<game>/plugins/<p>')
  process.exit(2)
}
const root = process.cwd()
const dir = resolve(root, dirArg)
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`${dirArg} is not a folder`)
  process.exit(2)
}
const p = basename(dir)
const halves = [`${p}.sim.ts`, `${p}.plugin.ts`].map(f => join(dir, f)).filter(existsSync)
if (!halves.length) {
  // A folder of nothing but mod files is a plugin that only delivers: it hosts no table of its own.
  const delivers = readdirSync(dir).filter(f => f.startsWith(`${p}.`) && f.endsWith('.ts') && !f.includes('.test.'))
  if (!delivers.length) {
    console.error(`${dirArg} holds no ${p}.sim.ts, no ${p}.plugin.ts and no ${p}.<host>.ts`)
    process.exit(2)
  }
  console.log(`${p}: no sim half and no browser half; it only delivers, to ${delivers.map(f => f.slice(p.length + 1, -3)).join(', ')}`)
  for (const f of delivers) {
    const file = join(dir, f)
    const t = readFileSync(file, 'utf8')
    const exportsHere = [...t.matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/gm)].map(m => m[1])
    let words = ''
    if (exportsHere.includes('behaviors')) {
      try { const m = await import(pathToFileURL(file).href); words = `; behaviors delivers ${Object.keys(m.behaviors()).join(', ')}` }
      catch (e) { words = `; behaviors could not be run here (${String(e.message ?? e).split('\n')[0]})` }
    }
    console.log(`  ${relative(root, file)} exports ${exportsHere.join(', ') || 'nothing'}${words}`)
  }
  console.log(`\n${p} is on the model: a plugin that only delivers keeps no table`)
  process.exit(0)
}
const text = halves.map(f => readFileSync(f, 'utf8')).join('\n')
const lines = (f) => readFileSync(f, 'utf8').split('\n')
const show = f => relative(root, f)

const findings = []
const say = (s) => console.log(s)
let failed = false

say(`${p}: ${halves.map(show).join(', ')}`)

// table: the mods keys read
// `mod(world, '<p>', '<key>')`, `modsOf<...>(world, '<p>', '<key>')`, with any generic between the name
// and the bracket; a key held in a variable is listed as `<name>`, and the string keys that variable is
// handed are read off the file's own string literals beside it.
const keys = new Set()
let variable = false
for (const m of text.matchAll(/\b(?:mod|modsOf)\b[^\n]*?\(\s*[^,\n]+,\s*'([^']+)'\s*,\s*(?:'([^']+)'|(\w+))\s*\)/g)) {
  if (m[1] !== p) continue
  if (m[2]) keys.add(m[2])
  else { keys.add(`<${m[3]}>`); variable = true }
}
if (variable) for (const m of text.matchAll(/\b\w+\b[^\n]*?\(\s*[^,\n]+,\s*'(surfaces|seen|behaviors|solids|bodies|fixed|ground|height)'\s*\)/g)) keys.add(m[1])
const hasTable = keys.has('behaviors')
say(`\ntable      ${keys.size ? `reads world.${p}.mods: ${[...keys].join(', ')}` : `reads no world.${p}.mods at all`}`)
say(`           ${hasTable ? `keeps a table of words from behaviors` : `keeps no table of words: no modsOf(world, '${p}', 'behaviors')`}`)

// contract: types the tables are keyed to
const contract = new Set()
for (const m of text.matchAll(/Record<string,\s*([A-Z]\w*)(?:\s*\|\s*([A-Z]\w*))?\s*>/g)) { contract.add(m[1]); if (m[2]) contract.add(m[2]) }
const exported = new Set([...text.matchAll(/^export type (\w+)/gm)].map(m => m[1]))
const named = [...contract].filter(c => exported.has(c))
say(`\ncontract   ${named.length ? `a word's owner writes a ${named.join(' or ')} (exported from ${p})` : contract.size ? `tables keyed to ${[...contract].join(', ')}, none exported: a word's owner cannot import the type` : 'no Record<string, X> table in the plugin'}`)

// refusal
const refusal = text.match(/no behavior for|names delivers|delivers it|is not a \w+: no plugin/)
say(`\nrefusal    ${refusal ? `throws when nothing delivers a word ("${refusal[0]}")` : 'no throw found naming an undelivered word'}`)

// dispatch
const dispatch = []
for (const f of halves) {
  lines(f).forEach((l, n) => {
    if (/^\s*\/\//.test(l)) return
    // A switch on a thing's field, or a field that names what a thing is compared to a literal. Finding
    // a row by its kind or a node by its name is not deciding by a word.
    if (/\bswitch\s*\(\s*\w+(?:\.\w+|\?\.\w+)+\s*\)/.test(l)) dispatch.push(`${show(f)}:${n + 1}  ${l.trim()}`)
    else if (/\.(do|word|type|what|is|shape|make|op)\s*===?\s*'[^']+'/.test(l)) dispatch.push(`${show(f)}:${n + 1}  ${l.trim()}`)
  })
}
say(`\ndispatch   ${dispatch.length ? `${dispatch.length} place(s) ${p} decides by a word itself:` : `no switch and no === '<word>' on a word-like field`}`)
for (const d of dispatch) say(`           ${d}`)
if (dispatch.length && !hasTable) { failed = true; say(`           FAIL: it dispatches on words and keeps no table; each word belongs in a table a mod can deliver to`) }
else if (dispatch.length) say(`           each is a built-in word; it is fine while a delivered word of the same name takes its place`)

// coupling
const coupling = []
for (const f of halves) {
  lines(f).forEach((l, n) => {
    const m = l.match(/^import\s+(?!type\b)[^'"]*from\s+'#plugins\/([^/']+)\//)
    if (m && m[1] !== p && !LIBRARY.has(m[1])) coupling.push(`${show(f)}:${n + 1}  ${l.trim()}`)
  })
}
say(`\ncoupling   ${coupling.length ? `imports another plugin for real:` : 'imports no other plugin for real (type imports, math and loader aside)'}`)
for (const c of coupling) say(`           ${c}`)
if (coupling.length) { failed = true; say(`           FAIL: two plugins never import each other; what ${p} needs of that plugin comes through a mod the scene names`) }

// delivered
const modFiles = []
const scan = (folder) => {
  if (!existsSync(folder)) return
  for (const a of readdirSync(folder)) {
    const sub = join(folder, a)
    if (!statSync(sub).isDirectory()) continue
    const f = join(sub, `${a}.${p}.ts`)
    if (existsSync(f)) modFiles.push(f)
  }
}
scan(resolve(root, 'plugins'))
const games = resolve(root, 'games')
if (existsSync(games)) for (const g of readdirSync(games)) { const d = join(games, g); if (statSync(d).isDirectory()) scan(join(d, 'plugins')) }
// a game's own host: mods beside it, <a>.<p>.ts in its own folder
for (const f of readdirSync(dir)) if (f.endsWith(`.${p}.ts`) && !f.startsWith(`${p}.`) && !f.includes('.test.')) modFiles.push(join(dir, f))

say(`\ndelivered  ${modFiles.length ? `${modFiles.length} mod file(s) deliver to ${p}:` : `no <a>.${p}.ts anywhere delivers to ${p}`}`)
for (const f of modFiles) {
  const t = readFileSync(f, 'utf8')
  const exportsHere = [...t.matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/gm)].map(m => m[1])
  let words = ''
  if (exportsHere.includes('behaviors')) {
    try {
      const m = await import(pathToFileURL(f).href)
      words = `; behaviors delivers ${Object.keys(m.behaviors()).join(', ')}`
    } catch (e) {
      words = `; behaviors could not be run here (${String(e.message ?? e).split('\n')[0]})`
    }
  }
  say(`           ${show(f)} exports ${exportsHere.join(', ') || 'nothing'}${words}`)
}

say(failed ? `\nFAIL: ${p} is not on the model` : `\n${p} is on the model`)
process.exit(failed ? 1 : 0)
