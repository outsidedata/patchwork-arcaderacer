// The design system's code field: a file's text in CodeMirror, highlighted for the language its
// path's extension says (TypeScript, TSX, JavaScript, CSS, HTML, Python; plain text else) by the
// theme's `--code-*` colours, with line numbers, folding, bracket matching, search (Mod-F), undo of
// its own keystrokes, and Mod-S handed to `onSave`. Every keystroke hands the whole text to
// `onChange`. A `value` that differs from the text it holds, a file read again say, replaces it;
// `line`, when it changes, puts the cursor at the start of that line, from 1, and scrolls it into
// the middle of the view.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { python } from '@codemirror/lang-python'
import { tags as t } from '@lezer/highlight'

// The language of a file, by its extension.
const LANGUAGES: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript(),
  mjs: () => javascript(),
  cjs: () => javascript(),
  css: () => css(),
  html: () => html(),
  py: () => python(),
}
const extensionOf = (path: string) => path.slice(path.lastIndexOf('.') + 1)

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.modifier, t.self], color: 'var(--code-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--code-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--code-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: 'var(--code-type)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: 'var(--code-function)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--code-property)' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: 'var(--code-operator)' },
  { tag: t.invalid, color: 'var(--danger)' },
])

export function CodeField({ value, path, onChange, onSave, line, label }: {
  value: string
  path: string
  onChange(text: string): void
  onSave?(): void
  line?: number
  label?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const language = extensionOf(path)
  // The latest handlers, so the view made once calls the ones of the last render.
  const handlers = useRef({ onChange, onSave })
  useLayoutEffect(() => { handlers.current = { onChange, onSave } })

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { handlers.current.onSave?.(); return true } }, indentWithTab]),
          basicSetup,
          LANGUAGES[language]?.() ?? [],
          syntaxHighlighting(highlight),
          EditorView.contentAttributes.of({ 'aria-label': label ?? path }),
          EditorView.updateListener.of(u => { if (u.docChanged) handlers.current.onChange(u.state.doc.toString()) }),
        ],
      }),
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // A new language is a new view; the text is kept in step below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  useEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === value) return
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    const v = view.current
    if (!v || line === undefined) return
    const at = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines)).from
    v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) })
    v.focus()
  }, [line])

  return <div className="ui-code" ref={host} />
}
