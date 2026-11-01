// The kinds extension's backend (`kinds.extension.tsx`): a new kind of a game made in every file it is
// made of, as one change (`editor/server/changes.ts`), whole or not at all, which one undo takes back.
// A kind's rule is `games/<game>/<kind>.sim.ts`, exporting a `Kind` named after it; its look, when it
// has one, `<kind>.client.ts` beside it, which the page loads by the kind's name; and a scene hands the
// kind out only when the module that defines the scene's `sim` imports the rule and lists it there:
// `export const sim: Sim = { …, kind }`, or another scene's through `export { sim } from
// './<scene>.sim.ts'`. TypeScript reads the modules, so the import goes in among the scene's imports of
// its kinds' rules, in order, and the kind at the end of its `sim`, and nothing else of the file moves.
// Its prefab, its definitions and its places are JSON values, each set as the editor sets one
// (`files.edit`), so each file's diff is that value.
//
//   GET  game  ?game=<game>: each scene's sim, by its path, and the module that defines it, with the
//              kinds it lists, or why a kind cannot be added there; and the kinds whose rule, and whose
//              look, the game's folder holds. Answers { scenes, modules, rules, looks }.
//   POST make  { game, name, like, sims, prefab, definitions, places }: kind `name` made, in this
//              order: its rule, a copy of kind `like`'s with `like`'s name made `name`'s throughout its
//              code, or a rule that does nothing yet (`export const <name>: Kind = {}`) when `like` is
//              null; its look, a copy of `like`'s the same way, when `like` has one; the import and the
//              entry in the module that defines the sim of each scene sim of `sims`; its prefab,
//              `prefabs.<name>` of the scene file `prefab`, a copy of `like`'s there, or empty when
//              `like` is null or has none there; its definition in each data file of `definitions`
//              that holds one of `like`'s, a copy of it; and each place of `places`, `{ file, at,
//              table }`: a table keyed by kinds at `at` of `file`, which gets `name` keyed to a copy of
//              its value of `like`, or a list of kinds there, which gets `name` on its end. Every value
//              copied is read from its file as the change comes to it. Refused, with nothing written,
//              for a name that is no lower-case identifier, a word of the language, the game's own
//              name, a plugin's (a row of that plugin's kind would load that plugin's file as its look),
//              a kind's whose rule or look is there, a kind a sim lists already, one `prefab` has a
//              prefab of or a file of `definitions` a definition of; for a file that is not one of the
//              game's folder; and for a place that is not a table, or a list, holding `like`, or a
//              table that has `name`. Answers { files }: the code files written, the rule first.
import ts from 'typescript'
import { valueAt, type At } from '#editor/server/files.ts'
import type { RouteFiles, Router } from '#editor/server/routes.ts'

const NAME = /^[a-z][a-zA-Z0-9]*$/
// A game's name: its folder's, a lower-case letter then lower-case letters, digits and underscores
// (`scripts/new-game.ts`).
const GAME = /^[a-z][a-z0-9_]*$/
// The words a kind's name cannot be, since the name is an identifier of its rule's module.
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'as', 'implements', 'interface', 'let', 'package', 'private',
  'protected', 'public', 'static', 'yield', 'any', 'boolean', 'constructor', 'declare', 'get', 'module', 'require', 'number', 'set',
  'string', 'symbol', 'type', 'from', 'of', 'await', 'async', 'undefined', 'never', 'unknown', 'object',
])

const textOf = (files: RouteFiles, p: string) => files.read(p).then(t => t as string | null, () => null)
const parse = (path: string, text: string) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

// The module that defines a scene sim's `sim`, following `export { sim } from './<x>.sim.ts'` in the
// game's folder, with its object literal; or why none can be had.
type Definer = { path: string; text: string; object: ts.ObjectLiteralExpression; source: ts.SourceFile } | { path: string; why: string }
async function definer(files: RouteFiles, folder: string, path: string, seen: string[] = []): Promise<Definer> {
  if (seen.includes(path)) return { path, why: `${[...seen, path].join(' → ')} hand each other their sim` }
  const text = await textOf(files, path)
  if (text === null) return { path, why: `${path} is not there` }
  const source = parse(path, text)
  for (const st of source.statements) {
    if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && st.exportClause && ts.isNamedExports(st.exportClause) && st.exportClause.elements.some(e => e.name.text === 'sim')) {
      const to = st.moduleSpecifier.text
      if (!/^\.\/[^/]+\.sim\.ts$/.test(to)) return { path, why: `${path} hands out the sim of ${to}, which is not a scene's of the game's folder` }
      return definer(files, folder, `${folder}/${to.slice(2)}`, [...seen, path])
    }
    if (ts.isVariableStatement(st) && st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || d.name.text !== 'sim' || !d.initializer) continue
        let init: ts.Expression = d.initializer
        while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression
        if (!ts.isObjectLiteralExpression(init)) return { path, why: `${path} makes its sim otherwise than as an object of its kinds` }
        return { path, text, object: init, source }
      }
    }
  }
  return { path, why: `${path} exports no sim` }
}

// The names an object of kinds lists: its properties' names.
const listed = (object: ts.ObjectLiteralExpression) =>
  object.properties.flatMap(p => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? [p.name.text] : []))

// `text` with each edit made, at its offset, those later in the text first.
const edited = (text: string, edits: { at: number; insert: string }[]) =>
  [...edits].sort((a, b) => b.at - a.at).reduce((t, e) => t.slice(0, e.at) + e.insert + t.slice(e.at), text)

// The module defining a sim with kind `name` imported among the scene's imports of its kinds' rules,
// in the order of their paths, and listed at the end of its sim.
function adding(d: Extract<Definer, { object: unknown }>, name: string): string {
  const spec = `./${name}.sim.ts`
  const line = `import { ${name} } from '${spec}'\n`
  const imports = d.source.statements.filter(ts.isImportDeclaration)
  const rules = imports.filter(i => ts.isStringLiteral(i.moduleSpecifier) && /^\.\/[^/]+\.sim\.ts$/.test(i.moduleSpecifier.text))
  const after = rules.find(i => (i.moduleSpecifier as ts.StringLiteral).text > spec)
  const last = rules.at(-1) ?? imports.at(-1)
  const importAt = after ? { at: after.getStart(d.source), insert: line } : last ? { at: last.getEnd(), insert: `\n${line.trimEnd()}` } : { at: d.source.statements[0]?.getStart(d.source) ?? 0, insert: line }
  const props = d.object.properties
  const entryAt = props.length ? { at: props[props.length - 1].getEnd(), insert: `, ${name}` } : { at: d.object.getStart(d.source) + 1, insert: ` ${name} ` }
  return edited(d.text, [importAt, entryAt])
}

// Kind `like`'s code made kind `name`'s: every identifier named `like` named `name`, and the comment
// that opens the file, which says what `like` is, made to say where the file came from.
function copied(path: string, text: string, like: string, name: string, what: string): string {
  const source = parse(path, text)
  const edits: { at: number; insert: string; cut: number }[] = []
  const walk = (n: ts.Node) => {
    if (ts.isIdentifier(n) && n.text === like) edits.push({ at: n.getStart(source), cut: n.getEnd() - n.getStart(source), insert: name })
    n.forEachChild(walk)
  }
  walk(source)
  const out = [...edits].sort((a, b) => b.at - a.at).reduce((t, e) => t.slice(0, e.at) + e.insert + t.slice(e.at + e.cut), text)
  const after = parse(path, out)
  // Where the first statement starts, past the comments before it.
  const head = after.statements[0]?.getStart(after) ?? out.length
  return `// The ${name} kind's ${what}, made from ${like}'s.\n` + out.slice(head)
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
// The value at `at` of the JSON file `p`, as the editor's files read one, or undefined where it has none.
async function valueIn(files: RouteFiles, p: string, at: At): Promise<unknown> {
  const text = await textOf(files, p)
  if (text === null) throw new Error(`${p} is not there`)
  return valueAt(text, at)
}

type Place = { file: string; at: At; table: boolean }

// Kind `name` made in every file, as the header says; refused as it says.
async function make(body: unknown, files: RouteFiles) {
  const b = body as { game?: unknown; name?: unknown; like?: unknown; sims?: unknown; prefab?: unknown; definitions?: unknown; places?: unknown } | null
  const game = b?.game, name = b?.name, like = b?.like ?? null, sims = b?.sims
  if (typeof game !== 'string' || !GAME.test(game)) throw new Error('make makes a kind of a game, named by its folder')
  const folder = `games/${game}`
  if (!(await files.list(folder).catch(() => [] as string[])).includes(`${folder}/${game}.scene.json`)) throw new Error(`there is no game ${game}`)
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`a kind's name is a lower-case letter and then letters and digits, and not ${JSON.stringify(name)}`)
  if (RESERVED.has(name)) throw new Error(`${name} is a word of the language, and no kind's name`)
  if (name === game) throw new Error(`${name} is the game's own name: its sim is ${game}.sim.ts`)
  if ((await files.list(`plugins/${name}`).catch(() => [])).length || (await files.list(`${folder}/plugins/${name}`).catch(() => [])).length)
    throw new Error(`${name} is a plugin's name: a row of kind ${name} would load that plugin's file as its look`)
  const rule = `${folder}/${name}.sim.ts`, look = `${folder}/${name}.client.ts`
  for (const p of [rule, look]) if ((await textOf(files, p)) !== null) throw new Error(`${p} is there already`)
  if (like !== null && (typeof like !== 'string' || !NAME.test(like))) throw new Error(`make is handed the kind the new one is like by its name, or null, and not ${JSON.stringify(like)}`)
  if (!Array.isArray(sims) || !sims.every(s => typeof s === 'string' && /^games\/[^/]+\/[^/]+\.sim\.ts$/.test(s) && s.startsWith(`${folder}/`)))
    throw new Error(`make adds the kind to the sims of scenes of ${game}, by their paths`)
  // A JSON file of the game's folder, by its path from the repo.
  const ofGame = (p: unknown, ending = /\.json$/): p is string => typeof p === 'string' && p.startsWith(`${folder}/`) && ending.test(p) && !p.split('/').includes('..')
  const prefab = b?.prefab, definitions = b?.definitions, places = b?.places
  if (!ofGame(prefab, /\.scene\.json$/)) throw new Error(`make puts the kind's prefab into a scene file of ${game}, by its path, and not ${JSON.stringify(prefab)}`)
  if (!Array.isArray(definitions) || !definitions.every(f => ofGame(f))) throw new Error(`make copies the kind's definitions into data files of ${game}, by their paths`)
  const place = (p: unknown): p is Place =>
    isObject(p) && ofGame(p.file) && Array.isArray(p.at) && p.at.every(k => typeof k === 'string' || typeof k === 'number') && typeof p.table === 'boolean'
  if (!Array.isArray(places) || !places.every(place)) throw new Error(`make puts the kind into places of ${game}'s data, each { file, at, table }: a JSON file of ${game} by its path, a path in it, and whether it is a table keyed by kinds or a list of kinds`)
  if (like === null && places.length) throw new Error('a kind made blank is put in no place: only a kind made like another goes beside it')

  const code: Record<string, string> = {}
  if (like === null) {
    code[rule] = `// The ${name} kind's rule.\nimport type { Kind } from '#engine/engine.ts'\n\nexport const ${name}: Kind = {}\n`
  } else {
    const likeRule = await textOf(files, `${folder}/${like}.sim.ts`)
    if (likeRule === null) throw new Error(`${like} has no rule of its own in ${folder}: ${folder}/${like}.sim.ts is not there`)
    code[rule] = copied(rule, likeRule, like, name, 'rule')
    const likeLook = await textOf(files, `${folder}/${like}.client.ts`)
    if (likeLook !== null) code[look] = copied(look, likeLook, like, name, 'look')
  }
  const done = new Set<string>()
  for (const s of sims as string[]) {
    const d = await definer(files, folder, s)
    if ('why' in d) throw new Error(`${name} cannot be added to the sim of ${s}: ${d.why}`)
    if (done.has(d.path)) continue
    done.add(d.path)
    if (listed(d.object).includes(name)) throw new Error(`${d.path} lists a kind ${name} already`)
    code[d.path] = adding(d, name)
  }
  if ((await valueIn(files, prefab, ['prefabs', name])) !== undefined) throw new Error(`${prefab} has a prefab ${name} already`)
  // `like`'s definition in each file of `definitions` that holds one, by its file.
  const defined: [string, unknown][] = []
  for (const f of definitions as string[]) {
    const defs = await valueIn(files, f, [])
    if (!isObject(defs)) continue
    if (name in defs) throw new Error(`${f} has a definition ${name} already`)
    if (like !== null && defs[like] !== undefined) defined.push([f, defs[like]])
  }

  for (const [p, text] of Object.entries(code)) await files.write(p, text)
  const likePrefab = like === null ? undefined : await valueIn(files, prefab, ['prefabs', like])
  await files.edit(prefab, ['prefabs', name], likePrefab ?? {})
  for (const [f, entry] of defined) await files.edit(f, [name], entry)
  // Each place read as the change comes to it, after every value written before it.
  for (const p of places as Place[]) {
    const here = await valueIn(files, p.file, p.at)
    const where = `${p.file} at ${JSON.stringify(p.at)}`
    if (p.table) {
      if (!isObject(here) || !(like! in here)) throw new Error(`${where} is no table keyed by kinds that has ${like}`)
      if (name in here) throw new Error(`${where} is a table that has ${name} already`)
      await files.edit(p.file, [...p.at, name], here[like!])
    } else {
      if (!Array.isArray(here) || !here.includes(like)) throw new Error(`${where} is no list of kinds that holds ${like}`)
      await files.edit(p.file, [...p.at, -1], name, true)
    }
  }
  return { files: Object.keys(code) }
}

async function gameOf(query: URLSearchParams, files: RouteFiles) {
  const game = query.get('game') ?? ''
  if (!GAME.test(game)) throw new Error('name a game')
  const folder = `games/${game}`
  const all = await files.list(folder).catch(() => [] as string[])
  const here = all.filter(f => !f.slice(folder.length + 1).includes('/'))
  const scenes = here.filter(f => f.endsWith('.scene.json')).map(f => f.replace(/\.scene\.json$/, '.sim.ts')).filter(f => here.includes(f))
  const modules: Record<string, { kinds: string[] } | { why: string }> = {}
  const of: Record<string, string> = {}
  for (const s of scenes) {
    const d = await definer(files, folder, s)
    of[s] = d.path
    modules[d.path] ??= 'why' in d ? { why: d.why } : { kinds: listed(d.object) }
  }
  const base = (f: string) => f.slice(folder.length + 1)
  return {
    scenes: of,
    modules,
    rules: here.filter(f => f.endsWith('.sim.ts') && !f.endsWith('.test.ts') && !scenes.includes(f)).map(f => base(f).replace(/\.sim\.ts$/, '')).sort(),
    looks: here.filter(f => f.endsWith('.client.ts')).map(f => base(f).replace(/\.client\.ts$/, '')).sort(),
  }
}

export function kinds(r: Router) {
  r.get('game', ({ query, files }) => gameOf(query, files))
  r.post('make', ({ body, files }) => make(body, files))
}
