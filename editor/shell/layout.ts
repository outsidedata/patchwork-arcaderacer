// Where the dock keeps its layout in the browser, and forgetting it: the next load places every
// panel where its extension asked.
export const LAYOUT = 'editor.layout'
// The panels the dock has seen, and those it took away because their extension turned off, to put
// back when it turns on.
export const PANELS = 'editor.panels'

export function resetLayout() {
  localStorage.removeItem(LAYOUT)
  localStorage.removeItem(PANELS)
  location.reload()
}
