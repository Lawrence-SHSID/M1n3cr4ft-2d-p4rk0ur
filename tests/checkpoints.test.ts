import assert from 'node:assert/strict'
import test from 'node:test'
import { generateLevel } from '../shared/levels'
import { createGame, startGame, stepGame } from '../src/game/physics'

test('checkpoints start only after the forty-five-block course', () => {
  for (let number = 1; number <= 8; number++) assert.equal(generateLevel(number).checkpoints?.length ?? 0, 0)
  assert.equal(generateLevel(8).length, 45)
  const first = generateLevel(9)
  assert.equal(first.length, 50)
  assert.ok(first.checkpoints && first.checkpoints.length > 0)
})

test('long courses have deterministic checkpoints on safe static grass with room to respawn', () => {
  for (const number of [9, 11, 12, 19, 49, 99, 999]) {
    const level = generateLevel(number)
    const checkpoints = level.checkpoints!
    assert.ok(checkpoints.length > 0)
    assert.deepEqual(checkpoints, generateLevel(number).checkpoints)
    assert.equal(new Set(checkpoints.map(point => point.id)).size, checkpoints.length)
    for (const checkpoint of checkpoints) {
      assert.ok(checkpoint.x > level.spawn.x && checkpoint.x + 0.48 < level.length)
      const supporting = level.blocks.find(block => block.solid && block.kind === 'grass' && !block.motion
        && block.y === checkpoint.y && checkpoint.x >= block.x && checkpoint.x + 0.48 <= block.x + 1)
      assert.ok(supporting, 'the whole respawn footprint fits on a static grass tile')
      assert.ok(!level.spikes.some(spike => spike.x === supporting.x && spike.y === supporting.y))
      assert.ok(level.blocks.some(block => block.kind === 'grass' && block.solid && !block.motion
        && block.y === supporting.y && Math.abs(block.x - supporting.x) === 1
        && !level.spikes.some(spike => spike.x === block.x && spike.y === block.y)), 'single-tile landings are excluded')

      const respawn = createGame({ ...level, spawn: { x: checkpoint.x, y: checkpoint.y } })
      assert.equal(respawn.player.grounded, true)
      assert.equal(respawn.player.groundKind, 'grass')
      startGame(respawn)
      stepGame(respawn, { left: false, right: false, jump: false }, 1 / 120)
      assert.equal(respawn.status, 'playing', 'a checkpoint cannot cause immediate spike death or finish the course')
      assert.equal(respawn.player.grounded, true)
    }
  }
})

test('recovery points are distributed near twenty-block intervals on long courses', () => {
  for (const number of [9, 12, 19, 49, 99, 999]) {
    const level = generateLevel(number)
    const checkpoints = level.checkpoints!
    assert.ok(checkpoints[0]!.x <= 30)
    const distances: number[] = []
    for (let index = 1; index < checkpoints.length; index++) {
      const distance = checkpoints[index]!.x - checkpoints[index - 1]!.x
      distances.push(distance)
      assert.ok(distance >= 14 && distance <= 40, 'sparse safe islands may move a marker away from the ideal twenty blocks')
    }
    const median = distances.sort((a, b) => a - b)[Math.floor(distances.length / 2)]
    if (median !== undefined) assert.ok(median >= 18 && median <= 22)
    assert.ok(level.length - checkpoints.at(-1)!.x <= 30)
  }
})
