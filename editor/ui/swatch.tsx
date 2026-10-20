// A colour shown and not edited, such as a faction's tint in a table's cell: a small square of it.
// `color` is any CSS colour, `#rrggbb` as a data file writes one; `label` names it, to a screen
// reader and in the square's tooltip, and is the colour itself when not given.
export function Swatch({ color, label }: { color: string; label?: string }) {
  return <span className="ui-swatch" role="img" aria-label={label ?? color} title={label ?? color} style={{ background: color }} />
}
