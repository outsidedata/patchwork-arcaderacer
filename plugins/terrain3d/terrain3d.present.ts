// Which ground layers the ground round a point hits, for terrain3d's near maps (`terrain3d.plugin.ts`,
// Near maps): each layer's weight, as the shader draws it before its height blend (`layers(x, z)`),
// summed over a grid of points `step` metres apart filling the square `reach` metres from (x, z) to its
// edge. A layer that sums to 0 shows nowhere on the grid. Run in one of terrain3d's workers as a task,
// or on the page where there are none.
type Ground = { layers(x: number, z: number): Record<string, number> }
export type Input = { x: number; z: number; reach: number; step: number; names: string[] }

export function present(ground: Ground, { x, z, reach, step, names }: Input): number[] {
  const sum = names.map(() => 0)
  const n = Math.max(1, Math.ceil(reach / step))
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const w = ground.layers(x + (i * reach) / n, z + (j * reach) / n)
      names.forEach((name, k) => { sum[k] += w[name] ?? 0 })
    }
  }
  return sum
}

export const task = (ground: Ground, input: Input) => ({ out: present(ground, input), transfer: [] })
