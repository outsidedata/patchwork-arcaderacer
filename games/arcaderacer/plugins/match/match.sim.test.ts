// The cars dealt at a course's `reset`: those no racer picked in the list's order, then the whole list round
// again; so with as many cars as grid places, no car is on the grid twice, and with fewer they repeat in order.
import { expect, test } from 'vitest'
import { deal } from './match.sim.ts'

const SIX = ['jeep_tj', 'countach', 'ferrari_f40', 'porsche_911', 'skyline_gtr', 'volvo_240']
const dealt = (cars: string[], picks: string[], n: number) => {
  const next = deal(cars, picks)
  return Array.from({ length: n }, () => next())
}

test('six cars and a racer who picked one: the other five go to the five rivals, none twice', () => {
  const rivals = dealt(SIX, ['ferrari_f40'], 5)
  expect(rivals).toEqual(['jeep_tj', 'countach', 'porsche_911', 'skyline_gtr', 'volvo_240'])
  expect(new Set([...rivals, 'ferrari_f40']).size).toBe(6)
})

test('a racer who picked none is dealt first, then the rivals, from the cars nobody picked', () => {
  expect(dealt(SIX, ['countach', ''], 5)).toEqual(['jeep_tj', 'ferrari_f40', 'porsche_911', 'skyline_gtr', 'volvo_240'])
})

test('one car: every place is dealt it', () => {
  expect(dealt(['originalcar'], ['originalcar'], 5)).toEqual(Array(5).fill('originalcar'))
  expect(dealt(['originalcar'], [''], 6)).toEqual(Array(6).fill('originalcar'))
})

test('fewer cars than places: the cars nobody picked, then the whole list again from its start', () => {
  expect(dealt(['a', 'b', 'c'], ['b'], 5)).toEqual(['a', 'c', 'a', 'b', 'c'])
})
