import assert from 'node:assert/strict'
import test from 'node:test'
import { generateLevel } from '../shared/levels'
import type { Level } from '../shared/types'

const surfaces = (level: Level) => level.blocks.filter(block => block.solid && !block.motion
  && ['grass', 'slime', 'ice', 'netherrack', 'nether-brick', 'end-stone', 'purpur'].includes(block.kind)
  && !level.blocks.some(other => other.solid && !other.motion && other.x === block.x && other.y < block.y))
  .sort((a, b) => a.x - b.x)
const surfaceAt = (level: Level, x: number) => surfaces(level).find(block => block.x === x)

test('levels start at ten blocks and grow by exactly five, with bounded deterministic geometry', () => {
  for (const number of [1, 2, 3, 4, 5, 6, 7, 8, 12, 25, 1000]) {
    const level = generateLevel(number)
    assert.equal(level.length, 10 + (number - 1) * 5)
    assert.equal(level.number, number)
    if (level.layout === 'vertical') assert.ok(level.flag.x >= 0 && level.flag.x < level.width!)
    else assert.ok(level.flag.x > level.length - 2 && level.flag.x < level.length)
    assert.ok(level.blocks.every(block => block.x >= 0 && block.x + (block.width ?? 1) <= (level.width ?? level.length)))
    assert.ok(level.spikes.every(spike => spike.x >= 0 && spike.x + 1 <= level.length))
    assert.equal(new Set(level.blocks.map(block => block.id)).size, level.blocks.length)
    assert.deepEqual(level, generateLevel(number))
    if (level.kind !== 'elytra') {
      const finish = level.blocks.find(block => block.solid && !block.motion && block.y === level.flag.y
        && block.x <= level.flag.x && block.x + (block.width ?? 1) > level.flag.x)
      assert.ok(finish)
      assert.equal(finish.y, level.flag.y)
      assert.ok(!level.spikes.some(spike => spike.x === finish.x))
    }
  }
})

test('starter includes all textures, ground dirt layers, a background tree, and a slime boost', () => {
  const level = generateLevel(1)
  assert.deepEqual(new Set(level.blocks.map(block => block.kind)), new Set(['grass', 'dirt', 'stone', 'wood', 'leaf', 'slime']))
  for (const surface of surfaces(level)) {
    assert.ok(level.blocks.some(block => block.kind === 'dirt' && block.x === surface.x && block.y === surface.y + 1))
  }
  assert.ok(level.blocks.filter(block => block.kind === 'wood' || block.kind === 'leaf').every(block => !block.solid))
  assert.deepEqual(level.spikes, [{ x: 6, y: 9 }])
  assert.deepEqual(level.spawn, { x: 0.8, y: 9 })
  assert.equal(surfaceAt(level, 5)?.kind, 'slime')
  assert.ok(!level.blocks.some(block => block.solid && block.x === 3))
})

test('the first six courses have distinct islands, elevations, gaps, and spring placements', () => {
  const levels = Array.from({ length: 6 }, (_, index) => generateLevel(index + 1))
  const layouts = levels.map(level => JSON.stringify(surfaces(level).map(block => [block.x, block.y, block.kind])))
  assert.equal(new Set(layouts).size, 6)
  assert.ok(new Set(levels.map(level => level.flag.y)).size >= 5)
  assert.ok(new Set(levels.map(level => level.spawn.y)).size >= 4)
  assert.ok(new Set(levels.map(level => surfaces(level).filter(block => block.kind === 'slime').length)).size >= 2)
  assert.equal(surfaceAt(levels[1]!, 3)?.y, surfaceAt(levels[1]!, 8)?.y)
  for (const x of [4, 5, 6, 7]) assert.ok(!surfaceAt(levels[1]!, x), 'level two has a real four-empty-block sprint gap')
  const stairs = levels[2]!
  assert.equal(surfaceAt(stairs, 4)?.y, 9)
  assert.equal(surfaceAt(stairs, 8)?.y, 8.5)
  assert.equal(surfaceAt(stairs, 11)?.y, 8)
  assert.equal(surfaceAt(levels[4]!, 18)?.y, 5)
  assert.equal(surfaceAt(levels[4]!, 24)?.y, 8, 'ridge course descends again')
})

test('moving platforms include horizontal ferries and vertical elevators with bounded half-slabs', () => {
  const axes = new Set<string>()
  for (let number = 1; number <= 50; number++) {
    const level = generateLevel(number)
    if (level.kind === 'elytra' || level.theme !== 'overworld') continue
    const moving = level.blocks.filter(block => block.motion)
    assert.ok(moving.length >= 1)
    for (const block of moving) {
      assert.equal(block.kind, 'stone')
      assert.ok(block.solid)
      assert.equal(block.height, 0.5)
      axes.add(block.motion!.axis)
      assert.ok(block.motion!.range >= 1 && block.motion!.range <= 3)
      if (block.motion!.axis === 'x') {
        assert.ok(block.x - block.motion!.range >= 0)
        assert.ok(block.x + block.motion!.range + (block.width ?? 1) <= level.length)
      } else {
        assert.ok(block.y - block.motion!.range >= 0)
        assert.ok(block.y + block.motion!.range + (block.height ?? 1) < 16)
      }
    }
    if (number >= 7) assert.ok(moving.some(block => block.motion!.axis === 'y'))
  }
  assert.deepEqual(axes, new Set(['x', 'y']))
  assert.equal(generateLevel(3).blocks.find(block => block.motion)?.motion?.axis, 'y')
  assert.equal(generateLevel(5).blocks.find(block => block.motion)?.motion?.axis, 'y')
  const ferryCourse = generateLevel(4)
  for (let x = 5; x < 13; x++) assert.ok(!surfaceAt(ferryCourse, x))
  const ferry = ferryCourse.blocks.find(block => block.motion)!
  assert.equal(ferry.width, 2)
  assert.equal(ferry.motion!.range, 3)
  assert.ok(ferry.x - ferry.motion!.range < 7)
  assert.ok(ferry.x + ferry.motion!.range + ferry.width! >= 13)
  assert.equal(ferry.motion!.axis, 'x')
  assert.equal(generateLevel(6).blocks.find(block => block.motion)?.motion?.axis, 'x')
})

test('the sprint introduction explains double-tapping a direction', () => {
  const level = generateLevel(2)
  assert.match(level.subtitle, /Double-tap a direction/)
  assert.ok(!level.subtitle.includes('Space'))
})

test('later seeds mix different gaps and heights rather than repeating five-tile modules', () => {
  const signatures = new Set<string>()
  for (let number = 8; number <= 38; number++) {
    const level = generateLevel(number)
    if (level.kind === 'elytra' || level.theme !== 'overworld') continue
    const surface = surfaces(level)
    const starts = surface.filter((block, index) => index === 0 || block.x > surface[index - 1]!.x + 1)
    assert.ok(starts.length >= 3)
    const gaps = starts.slice(1).map(block => block.x - surface[surface.findIndex(item => item === block) - 1]!.x - 1)
    assert.ok(new Set(gaps).size >= 2)
    signatures.add(JSON.stringify(starts.slice(0, 4).map(block => [block.x, block.y])))
    for (const tree of level.blocks.filter(block => block.kind === 'wood' || block.kind === 'leaf')) assert.ok(!tree.solid)
    for (const spike of level.spikes) {
      assert.equal(surfaceAt(level, spike.x)?.y, spike.y)
      assert.ok(spike.x !== level.length - 1)
    }
  }
  assert.ok(signatures.size >= 10)
})

test('invalid level numbers are rejected', () => {
  for (const number of [0, -1, 1.1, 1001, Infinity, NaN]) assert.throws(() => generateLevel(number), RangeError)
})

test('course seven introduces solid ice with safe grass starts and finishes', () => {
  const course = generateLevel(7)
  assert.equal(course.name, 'Frostline crossing')
  assert.equal(course.length, 40)
  const ice = course.blocks.filter(block => block.kind === 'ice')
  assert.ok(ice.length >= 10)
  assert.ok(ice.every(block => block.solid && !block.motion))
  assert.equal(surfaceAt(course, 0)?.kind, 'grass')
  assert.equal(surfaceAt(course, 39)?.kind, 'grass')
  assert.equal(surfaceAt(course, 33)?.kind, 'slime')
  assert.deepEqual(course, generateLevel(7))
})
