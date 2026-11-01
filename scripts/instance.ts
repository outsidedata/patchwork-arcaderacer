// A drawing file, `<kind>.client.ts`, made into one that hands out a fresh copy of itself: what the dev
// server serves for `<kind>.client.ts?instance` (`vite.config.ts`) and what a page's bundle holds for
// it (`scripts/bundle.ts`). The page imports a drawing file once and calls its `instance()` for every
// row of its kind (`engine/browser.ts`) and every local actor (`plugins/local`), so each row still
// has its own top-level variables, the mesh it drew, without the file being fetched again for it.
//
// `instanced(code)` takes the file as JavaScript, its types already stripped. Its imports stay at
// the top, shared by every copy, as they were when each row imported the file under its own
// address. Everything else, `export` taken off, goes inside `export async function instance()`,
// which runs it and hands back an object with a getter for each name the file exported, so an
// exported `let` reads as it is now, as a module's own export does. The function is async so a file
// that awaits at its top still runs.
import { parseAst } from 'vite'

type Node = { type: string; start: number; end: number; [k: string]: any }

// The names a declaration's pattern binds: `a`, `{ a, b: c }`, `[a, ...b]`, `{ a = 1 }`.
function bound(p: Node): string[] {
  switch (p.type) {
    case 'Identifier': return [p.name]
    case 'ObjectPattern': return p.properties.flatMap((q: Node) => bound(q.type === 'RestElement' ? q.argument : q.value))
    case 'ArrayPattern': return p.elements.filter(Boolean).flatMap(bound)
    case 'RestElement': return bound(p.argument)
    case 'AssignmentPattern': return bound(p.left)
    default: throw new Error(`a drawing file exports a ${p.type}, which instance() cannot hand out`)
  }
}

export function instanced(code: string): string {
  const program = parseAst(code) as unknown as { body: Node[] }
  const top: string[] = []
  const body: string[] = []
  const exported: [string, string][] = []
  const text = (n: Node) => code.slice(n.start, n.end)
  for (const n of program.body) {
    if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || (n.type === 'ExportNamedDeclaration' && n.source)) {
      top.push(text(n))
    } else if (n.type === 'ExportNamedDeclaration' && n.declaration) {
      const d = n.declaration as Node
      body.push(text(d))
      const names = d.type === 'VariableDeclaration' ? d.declarations.flatMap((v: Node) => bound(v.id)) : [d.id.name]
      for (const name of names) exported.push([name, name])
    } else if (n.type === 'ExportNamedDeclaration') {
      for (const s of n.specifiers as Node[]) exported.push([s.exported.name ?? s.exported.value, s.local.name])
    } else if (n.type === 'ExportDefaultDeclaration') {
      const d = n.declaration as Node
      if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) {
        body.push(text(d))
        exported.push(['default', d.id.name])
      } else {
        body.push(`const __default = (${text(d)});`)
        exported.push(['default', '__default'])
      }
    } else {
      body.push(text(n))
    }
  }
  const getters = exported.map(([name, local]) => `get ${JSON.stringify(name)}() { return ${local} }`).join(', ')
  return `${top.join('\n')}\nexport async function instance() {\n${body.join('\n')}\nreturn { ${getters} }\n}\n`
}
