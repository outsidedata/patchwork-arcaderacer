// A theme's colour read as a number, whatever CSS colour the theme writes it in, and read as CSS
// under an element for a canvas.
import { afterEach, expect, test } from 'vitest'
import { cssOf, hexOf, rgbaOf, themed } from './theme.ts'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.body.removeAttribute('style')
})

test('a colour of the theme is read as 0xrrggbb, in any CSS colour the page reads, else the colour given for none', () => {
  const root = document.documentElement.style
  root.setProperty('--a', '#4c8dff')
  root.setProperty('--b', 'rgb(1, 2, 3)')
  root.setProperty('--c', '#abc')
  root.setProperty('--d', 'not a colour')
  // The page's text has a colour of its own, which an element a colour is not read on inherits.
  document.body.style.color = 'rgb(9, 9, 9)'
  expect(themed('--a', 0)).toBe(0x4c8dff)
  expect(themed('--b', 0)).toBe(0x010203)
  expect(themed('--c', 0)).toBe(0xaabbcc)
  expect(themed('--d', 7)).toBe(7)
  expect(themed('--none', 7)).toBe(7)
  expect(hexOf(0x0000ff)).toBe('#0000ff')
})

test('a CSS colour is read with its alpha, as the page computes it; what is no colour is none', () => {
  expect(rgbaOf('#4c8dff')).toEqual([0x4c, 0x8d, 0xff, 1])
  expect(rgbaOf('rgba(0, 0, 0, 0.45)')).toEqual([0, 0, 0, 0.45])
  expect(rgbaOf('#000')).toEqual([0, 0, 0, 1])
  expect(rgbaOf('not a colour')).toBeUndefined()
})

test('under an element, each variable is the CSS colour set there, and #888 where none is', () => {
  const el = document.createElement('canvas')
  document.body.appendChild(el)
  el.style.setProperty('--accent', 'tomato')
  const css = cssOf(el)
  expect(css('--accent')).toBe('tomato')
  expect(css('--warn')).toBe('#888')
  el.remove()
})
