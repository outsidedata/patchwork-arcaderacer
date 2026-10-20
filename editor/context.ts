// The editor, to every component under the app: `useEditor` hands it over and draws the component
// again whenever something it reads changes, by the topics it names (`Topic`, `editor.ts`).
//
// A component is told through React's store hook (`useSyncExternalStore`), its snapshot how many
// changes of its topics there have been (`Editor.seen`): every change that lands in one task is drawn
// as one drawing, a component is never drawn from a state its parent has not been drawn from too,
// and a change that lands between a component's drawing and its subscribing is drawn all the same.
import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react'
import type { Editor, Topic } from './editor.ts'

export const EditorContext = createContext<Editor | null>(null)

// The editor, the component drawn again for every change of one of `topics`, and of `texts` only of
// `paths` when given. `[]` is a component that reads nothing that changes. A component names every
// topic it reads, through every function it calls: one it leaves out stops showing what changed.
export function useEditor(topics: readonly Topic[], paths?: readonly string[]): Editor {
  const ed = useContext(EditorContext)
  if (!ed) throw new Error('useEditor is used outside the editor')
  const key = `${topics.join(' ')}\n${paths?.join('\n') ?? ''}`
  // `key` is every topic and path.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subscribe = useCallback((f: () => void) => (topics.length ? ed.subscribe(f, topics, paths) : () => {}), [ed, key])
  useSyncExternalStore(subscribe, () => ed.seen(topics, paths))
  return ed
}

// A file's text, read the first time a component asks for it and kept up to date with every write
// the editor makes. Undefined until it has been read.
export function useText(path: string | undefined): string | undefined {
  return useTexts(path === undefined ? [] : [path])[0]
}

// The texts of several files, as `useText` reads one, in the order of their paths: the component is
// drawn again when one of them changes, and for no other file.
export function useTexts(paths: string[]): (string | undefined)[] {
  const ed = useEditor(paths.length ? ['texts'] : [], paths)
  const key = paths.join('\n')
  useEffect(() => {
    for (const path of key ? key.split('\n') : [])
      if (!ed.texts.has(path)) void ed.text(path).catch(e => ed.error(`${path}: ${(e as Error).message}`))
  }, [ed, key])
  return paths.map(p => ed.texts.get(p))
}
