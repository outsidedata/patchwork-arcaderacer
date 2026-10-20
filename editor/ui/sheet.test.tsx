// A surface fills its panel, or is as tall as it is told, hands over a double click where it was, and
// draws again when an item of its version changes, not for a new list of the same items; a picture's
// pixels are drawn at their own size.
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, onTestFinished, test, vi } from 'vitest'
import { PixelImage, Surface } from './sheet.tsx'
import { blank } from './pixels.ts'

test('a surface given a height is that many pixels tall, however few, and one given none takes its panel\'s', () => {
  render(<><Surface label="tall" height={240} version={0} draw={() => {}} /><Surface label="filling" version={0} draw={() => {}} /></>)
  expect(screen.getByLabelText('tall').style.height).toBe('240px')
  expect(screen.getByLabelText('tall').style.minHeight).toBe('240px')
  expect(screen.getByLabelText('filling').style.height).toBe('')
})

test('a picture of pixels is a canvas of its own size, and of none before it has any', () => {
  render(<><PixelImage label="frame" pixels={blank(48, 32)} /><PixelImage label="coming" pixels={undefined} /></>)
  const frame = screen.getByLabelText('frame') as HTMLCanvasElement
  expect([frame.width, frame.height]).toEqual([48, 32])
  expect((screen.getByLabelText('coming') as HTMLCanvasElement).width).toBe(0)
})

test('a surface draws again when an item of its version changes, and not when it is handed a new list of the same items', () => {
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setTransform() {}, clearRect() {} } as never)
  onTestFinished(() => context.mockRestore())
  const map = { cells: [1, 2] }
  let draws = 0
  const draw = () => { draws++ }
  const { rerender } = render(<Surface label="map" version={[map, 2, 'a']} draw={draw} />)
  const first = draws
  expect(first).toBeGreaterThan(0)
  rerender(<Surface label="map" version={[map, 2, 'a']} draw={draw} />)
  expect(draws).toBe(first)
  rerender(<Surface label="map" version={[map, 3, 'a']} draw={draw} />)
  expect(draws).toBe(first + 1)
  rerender(<Surface label="map" version={[{ cells: [1, 2] }, 3, 'a']} draw={draw} />)
  expect(draws).toBe(first + 2)
  rerender(<Surface label="map" version={[map, 3]} draw={draw} />)
  expect(draws).toBe(first + 3)
})

test('a double click on a surface is handed over where it was, in CSS pixels', () => {
  const got: [number, number][] = []
  render(<Surface label="level" version={0} draw={() => {}} onDouble={p => got.push([p.x, p.y])} />)
  fireEvent.doubleClick(screen.getByLabelText('level').querySelector('canvas')!, { clientX: 12, clientY: 30 })
  expect(got).toEqual([[12, 30]])
})
