// What an expression of drivers is made of, and a file's drivers planned.
import { expect, test } from 'vitest'
import { driven, expression, plan } from './drivers.ts'

const value = (text: string, values: Record<string, number> = {}) => expression(text, 'it').run(values)

test('an expression is numbers, names, + - * / with ( ), a leading sign, and pi', () => {
  expect(value('1 + 2 * 3')).toBe(7)
  expect(value('(1 + 2) * 3')).toBe(9)
  expect(value('8 / 4 / 2')).toBe(1)
  expect(value('10 - 4 - 3')).toBe(3)
  expect(value('-2 * -3')).toBe(6)
  expect(value('+.5 + 1e-1 + 2.')).toBeCloseTo(2.6, 12)
  expect(value('2 * pi')).toBe(2 * Math.PI)
  expect(value('0.2 / amplitude', { amplitude: 4 })).toBeCloseTo(0.05, 12)
  expect(expression('a * b + a', 'it').names).toEqual(['a', 'b'])
})

test('comparisons, and, or and not hand back 1 or 0, and c ? a : b chooses', () => {
  expect([value('2 < 3'), value('3 <= 3'), value('2 > 3'), value('3 >= 4'), value('2 == 2'), value('2 != 2')]).toEqual([1, 1, 0, 0, 1, 0])
  expect([value('1 and 0'), value('1 and 2'), value('0 or 0'), value('0 or 5'), value('not 0'), value('not 3')]).toEqual([0, 1, 0, 1, 1, 0])
  expect(value('not 1 < 0 and 2 > 1')).toBe(1)
  expect(value('x > 1 ? 10 : 20', { x: 2 })).toBe(10)
  expect(value('x > 1 ? 10 : x < 0 ? 30 : 20', { x: 0 })).toBe(20)
})

test('the functions an expression calls', () => {
  expect(value('min(3, 1, 2) + max(3, 1, 2)')).toBe(4)
  expect([value('abs(-2)'), value('floor(1.7)'), value('ceil(1.2)'), value('trunc(-1.7)'), value('round(1.5)')]).toEqual([2, 1, 2, -1, 2])
  expect(value('sin(pi / 2) + cos(0)')).toBeCloseTo(2, 12)
  expect(value('atan2(1, 1)')).toBeCloseTo(Math.PI / 4, 12)
  expect(value('sqrt(16) + pow(2, 3) + exp(0) + log(1)')).toBe(13)
  expect(value('fmod(7, 3)')).toBe(1)
  expect(value('degrees(pi)')).toBeCloseTo(180, 12)
  expect(value('radians(180)')).toBeCloseTo(Math.PI, 12)
  expect(value('lerp(10, 20, 0.25)')).toBe(12.5)
  expect([value('clamp(5, 0, 1)'), value('clamp(-5, 0, 1)'), value('clamp(0.5, 0, 1)')]).toEqual([1, 0, 0.5])
  expect([value('smoothstep(0, 1, -1)'), value('smoothstep(0, 1, 0.5)'), value('smoothstep(0, 1, 2)')]).toEqual([0, 0.5, 1])
})

test('text that is no expression throws, beginning with what it is and saying where', () => {
  expect(() => value('')).toThrow('it is "", which is empty')
  expect(() => value('1 +')).toThrow('it is "1 +", which ends where it wants a number or a name')
  expect(() => value('2 $ 3')).toThrow('it is "2 $ 3", and "$", its character 3, is in no expression')
  expect(() => value('(1 + 2')).toThrow('it is "(1 + 2", which ends where it wants ")"')
  expect(() => value('1 2')).toThrow('it is "1 2", which goes on past its end at its character 3')
  expect(() => value('pow(2)')).toThrow('it is "pow(2)", which hands pow 1 number, and it takes 2')
  expect(() => value('boom(2)')).toThrow('it is "boom(2)", which calls boom, and an expression calls min, max')
  expect(() => value('* 2')).toThrow('it is "* 2", which has "*" at its character 1, where it wants a number or a name')
})

test('a number field\'s expression names the file\'s drivers and time, and nothing else', () => {
  expect(driven('amplitude * time', ['amplitude'], 'it')({ amplitude: 2, time: 3 })).toBe(6)
  expect(() => driven('amplitud * 2', ['amplitude', 'wind'], 'it')).toThrow('it is "amplitud * 2", which names amplitud, and the effects file\'s drivers are amplitude, wind')
  expect(() => driven('x', [], 'it')).toThrow('it is "x", which names x, and the effects file\'s drivers are none')
})

test('a file\'s drivers are numbers and expressions of each other and of time, each after what it reads; one named in over is that number', () => {
  const p = plan({ double: 'amplitude * 2', amplitude: 3, wave: 'double + sin(time)' })
  expect(p.names).toEqual(['double', 'amplitude', 'wave'])
  expect(p.run({}, 0)).toEqual({ time: 0, amplitude: 3, double: 6, wave: 6 })
  expect(p.run({ amplitude: 1 }, Math.PI / 2)).toEqual({ time: Math.PI / 2, amplitude: 1, double: 2, wave: 3 })
  // one held is that number whatever it reads
  expect(p.run({ double: 10 }, 0).wave).toBe(10)
  expect(plan().run({}, 4)).toEqual({ time: 4 })
})

test('drivers that cannot be planned throw, naming the driver', () => {
  expect(() => plan({ a: 'b', b: 'a + 1' })).toThrow('particle3d\'s effects file driver a is driven by itself: a > b > a')
  expect(() => plan({ a: 'c * 2' })).toThrow('particle3d\'s effects file driver a is "c * 2", which names c, and the effects file\'s drivers are a')
  expect(() => plan({ 'my-driver': 1 })).toThrow('particle3d\'s effects file driver my-driver has a name no expression can read')
  expect(() => plan({ time: 1 })).toThrow('particle3d\'s effects file driver time is named as one of an expression\'s own words')
  expect(() => plan({ a: Infinity })).toThrow('particle3d\'s effects file driver a is Infinity, and a driver is a finite number or an expression')
  expect(() => plan({ a: true as unknown as number })).toThrow('particle3d\'s effects file driver a is true, and a driver is a number or an expression')
})
