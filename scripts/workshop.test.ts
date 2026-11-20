import { describe, expect, it } from 'vitest'
import { asked } from './workshop.ts'

describe('yarn workshop', () => {
  it('opens each workshop at its page', () => {
    expect(asked(5180, []).url).toBe('http://127.0.0.1:5180/')
    expect(asked(5180, ['mech']).url).toBe('http://127.0.0.1:5180/?game=mech')
    expect(asked(5180, ['ui', 'mech']).url).toBe('http://127.0.0.1:5180/ui?game=mech')
    expect(asked(5180, ['particles', 'portal2']).url).toBe('http://127.0.0.1:5180/particles?game=portal2')
    expect(asked(5180, ['poses']).url).toBe('http://127.0.0.1:5180/poses')
    expect(asked(5180, ['puppet3d', 'demo_puppet3d']).url).toBe('http://127.0.0.1:5180/puppet3d?game=demo_puppet3d')
    expect(asked(5180, ['hair3d', 'demo_hair3d']).url).toBe('http://127.0.0.1:5180/hair3d?game=demo_hair3d')
    expect(asked(5180, ['grass3d', 'demo_grass3d']).url).toBe('http://127.0.0.1:5180/grass3d?game=demo_grass3d')
  })

  it('hands the particle workshop its effect, its file, and an effects file with its sheets', () => {
    expect(asked(5181, ['particles', 'portal2', '--effect', 'portal2', '--file', 'games/portal2/assets/fx.json']).url)
      .toBe('http://127.0.0.1:5181/particles?game=portal2&file=games%2Fportal2%2Fassets%2Ffx.json&effect=portal2')
    expect(asked(5180, ['particles', '--effects', 'a/b.json', '--sheet', 'smoke=s/smoke.json', '--effect', 'boom']))
      .toEqual({ url: 'http://127.0.0.1:5180/particles?effect=boom', effects: 'a/b.json', sheets: { smoke: 's/smoke.json' } })
  })

  it('refuses what no page takes', () => {
    expect(() => asked(5180, ['ui'])).toThrow('needs a game')
    expect(() => asked(5180, ['puppet3d'])).toThrow('puppet3d workshop needs a game')
    expect(() => asked(5180, ['particles'])).toThrow('needs a game or an effects file')
    expect(() => asked(5180, ['poses', 'mech'])).toThrow('takes no game')
    expect(() => asked(5180, ['particles', 'portal2', '--effects', 'a.json'])).toThrow('not both')
    expect(() => asked(5180, ['mech', '--effect', 'x'])).toThrow('particle workshop\'s')
    expect(() => asked(5180, ['particles', 'portal2', '--sheet', 'k=v'])).toThrow('--sheet is a sheet')
    expect(() => asked(5180, ['particles', '--effects', 'a.json', '--file', 'b.json'])).toThrow('no game was given')
    expect(() => asked(5180, ['particles', '--bogus'])).toThrow('is not --effects')
  })
})
