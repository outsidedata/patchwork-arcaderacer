// nav3d's browser half, handed the plugins it draws through: a wire whose scene names two graphs, files
// the loader holds, and render3d's three and a scene of three's own, with no renderer. With its flag down
// it draws nothing; up, each graph's ways as lines and its places as points, over the places, never eased
// by render3d, a spline way along its curve; a graph's file written again is drawn again; down again, and
// on `close`, all of it is let go.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { written } from '#plugins/loader/loader.sim.ts'
import { nav3d } from './nav3d.plugin.ts'
import { drawn } from '#plugins/shapes3d/shapes3d.kinematics3d.ts'

const urls = { yard: '/nav3d-plugin-test/yard.nav.json', loft: '/nav3d-plugin-test/loft.nav.json' }
const line = (from: number[], to: number[]) => ({ line: { from, to }, data: { nav3d: { word: 'ground' } } })
const yard = {
  places: [{ point: { at: [0, 1, 0] } }, { point: { at: [4, 1, 0] } }, { point: { at: [4, 2, 3] } }],
  ways: [line([0, 1, 0], [4, 1, 0]), line([4, 1, 0], [4, 2, 3])],
}
written(urls.yard, JSON.stringify(yard))
written(urls.loft, JSON.stringify({ places: [{ point: { at: [9, 0, 9] } }], ways: [] }))

const plugins = () => {
  const scene = new THREE.Scene()
  const world = {
    loader: { assets: { yard: { type: 'json', url: urls.yard, preload: true }, loft: { type: 'json', url: urls.loft, preload: true } } },
    nav3d: { graphs: { yard: { asset: 'yard' }, loft: { asset: 'loft' } } },
  }
  return { scene, all: { wire: { rows: [], scene: { world } }, render3d: { THREE, scene } } as any }
}
const positions = (o: THREE.Object3D) => [...((o as THREE.Points).geometry.getAttribute('position').array as Float32Array)]

test('with its flag down it draws nothing', () => {
  const { scene, all } = plugins()
  const n = nav3d()
  n.tick(all)
  expect(scene.children).toHaveLength(0)
})

test('with its flag up each graph\'s ways are lines and its places points, over the places, never eased', () => {
  const { scene, all } = plugins()
  const n = nav3d()
  n.graphs = true
  n.tick(all)
  expect(scene.children).toHaveLength(4)
  const [lines, points] = scene.children
  expect(lines).toBeInstanceOf(THREE.LineSegments)
  expect(points).toBeInstanceOf(THREE.Points)
  const up = (p: number[]) => [p[0], p[1] + 0.05, p[2]]
  // As three holds them, in 32-bit floats.
  const f32 = (...ps: number[][]) => Array.from(new Float32Array(ps.flatMap(up)))
  expect(positions(lines)).toEqual(f32([0, 1, 0], [4, 1, 0], [4, 1, 0], [4, 2, 3]))
  expect(positions(points)).toEqual(f32([0, 1, 0], [4, 1, 0], [4, 2, 3]))
  expect(scene.children.every(o => o.userData.teleport === true)).toBe(true)
  // A second frame draws nothing more.
  n.tick(all)
  expect(scene.children).toHaveLength(4)
})

test('a spline way is drawn along its curve, a straight piece at a time as shapes3d draws it', () => {
  const { scene, all } = plugins()
  const points = [[4, 1, 0], [5, 1.5, 1.5], [4, 2, 3]]
  written(urls.yard, JSON.stringify({ ...yard, ways: [yard.ways[0], { spline: { points }, data: { nav3d: { word: 'stair' } } }] }))
  const n = nav3d()
  n.graphs = true
  n.tick(all)
  const up = (p: number[]) => [p[0], p[1] + 0.05, p[2]]
  const { pts } = drawn({ points })
  const f32 = (...ps: number[][]) => Array.from(new Float32Array(ps.flatMap(up)))
  expect(positions(scene.children[0])).toEqual(f32([0, 1, 0], [4, 1, 0], ...pts.slice(1).flatMap((p, i) => [pts[i], p])))
  n.close(all)
  written(urls.yard, JSON.stringify(yard))
})

test('a graph whose places give their ground\'s up is drawn off each place along it, and each of those places a line along its up', () => {
  const { scene, all } = plugins()
  const S = Math.SQRT1_2
  written(urls.yard, JSON.stringify({
    places: [{ point: { at: [1, 0, 0] } }, { point: { at: [0, 0, 0], normal: [S, S, 0] } }, { point: { at: [0, 1, 0], normal: [1, 0, 0] } }],
    ways: [line([1, 0, 0], [0, 0, 0]), line([0, 0, 0], [0, 1, 0])],
  }))
  const n = nav3d()
  n.graphs = true
  n.tick(all)
  // The yard's lines, points and ups, and the loft's lines and points.
  expect(scene.children).toHaveLength(5)
  const [lines, points, ups] = scene.children
  const off = (p: number[], u: number[], k: number) => p.map((v, i) => v + u[i] * k)
  const f32 = (...ps: number[][]) => Array.from(new Float32Array(ps.flat()))
  const floor = off([1, 0, 0], [0, 1, 0], 0.05), edge = off([0, 0, 0], [S, S, 0], 0.05), wall = off([0, 1, 0], [1, 0, 0], 0.05)
  expect(positions(lines)).toEqual(f32(floor, edge, edge, wall))
  expect(positions(points)).toEqual(f32(floor, edge, wall))
  expect(ups).toBeInstanceOf(THREE.LineSegments)
  expect(positions(ups)).toEqual(f32(edge, off([0, 0, 0], [S, S, 0], 0.45), wall, off([0, 1, 0], [1, 0, 0], 0.45)))
  expect(ups.userData.teleport).toBe(true)
  n.close(all)
  expect(scene.children).toHaveLength(0)
  written(urls.yard, JSON.stringify(yard))
})

test('a graph\'s file written again is drawn again; down again, and on close, all of it is let go', () => {
  const { scene, all } = plugins()
  const n = nav3d()
  n.graphs = true
  n.tick(all)
  const before = scene.children[0]
  written(urls.yard, JSON.stringify({ ...yard, ways: [yard.ways[0]] }))
  n.tick(all)
  expect(scene.children).toHaveLength(4)
  expect(scene.children).not.toContain(before)
  expect(positions(scene.children.find(o => o instanceof THREE.LineSegments && positions(o).length === 6)!)).toHaveLength(6)
  n.graphs = false
  n.tick(all)
  expect(scene.children).toHaveLength(0)
  n.graphs = true
  n.tick(all)
  n.close(all)
  expect(scene.children).toHaveLength(0)
  written(urls.yard, JSON.stringify(yard))
})
