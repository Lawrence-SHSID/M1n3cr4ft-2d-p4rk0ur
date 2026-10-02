import assert from 'node:assert/strict'
import test from 'node:test'
import { generateLevel } from '../shared/levels'
import { createGame, startGame, stepGame } from '../src/game/physics'
import { FLIGHT } from '../src/game/flight'

const SHIP_WIDTH = 1.1
const SHIP_HEIGHT = 0.6

test('every tenth course is a deterministic elytra flight without changing length progression', () => {
  for (let number = 1; number <= 1000; number++) {
    if (number % 10) {
      if (number <= 30) assert.equal(generateLevel(number).kind, 'parkour')
      continue
    }
    const level = generateLevel(number)
    assert.equal(level.kind, 'elytra')
    assert.equal(level.length, 10 + (number - 1) * 5)
    assert.deepEqual(level, generateLevel(number))
    assert.deepEqual(level.flight, { ceiling: 1, floor: 10 })
    assert.equal(level.spikes.length, 0)
    assert.ok(level.spawn.y - SHIP_HEIGHT > level.flight!.ceiling && level.spawn.y < level.flight!.floor)
    assert.ok(level.blocks.every(block => block.x >= 8 && block.x + (block.width ?? 1) < level.length - 5))
    assert.equal(level.flag.x, level.length - 0.65)
  }
})

test('flight gates leave broad alternating upper and lower passages with long steering windows', () => {
  for (const number of [10, 20, 30, 100, 1000]) {
    const level = generateLevel(number)
    let previousSide: 'top' | 'bottom' | null = null
    let previousEnd = 0
    for (const gate of level.blocks) {
      assert.equal(gate.kind, 'stone')
      assert.ok(gate.solid && !gate.motion)
      assert.ok((gate.width ?? 1) >= 1 && (gate.width ?? 1) <= 1.5)
      const fromTop = gate.y === level.flight!.ceiling
      const passageHeight = fromTop ? level.flight!.floor - gate.y - gate.height! : gate.y - level.flight!.ceiling
      assert.ok(passageHeight >= 4)
      assert.notEqual(fromTop ? 'top' : 'bottom', previousSide)
      assert.ok(gate.x - previousEnd >= 8)
      previousEnd = gate.x + gate.width!
      previousSide = fromTop ? 'top' : 'bottom'
    }
  }
  assert.notDeepEqual(generateLevel(10).blocks.map(block => [block.x, block.y, block.height]),
    generateLevel(20).blocks.slice(0, 4).map(block => [block.x, block.y, block.height]))
})

test('flight checkpoints fit a ship in unobstructed air and keep distance from stone columns', () => {
  for (const number of [10, 20, 50, 100, 1000]) {
    const level = generateLevel(number)
    assert.ok(level.length > 45 && level.checkpoints!.length >= 2)
    assert.equal(new Set(level.checkpoints!.map(point => point.id)).size, level.checkpoints!.length)
    for (const checkpoint of level.checkpoints!) {
      assert.ok(checkpoint.x > 4 && checkpoint.x + SHIP_WIDTH < level.length - 3)
      assert.ok(checkpoint.y - SHIP_HEIGHT > level.flight!.ceiling && checkpoint.y < level.flight!.floor)
      assert.ok(level.blocks.every(block => checkpoint.x + SHIP_WIDTH <= block.x - 3.9 + 1e-7
        || checkpoint.x >= block.x + (block.width ?? 1) + 2), 'recovery keeps 3.9 clear blocks ahead of the ship and two behind it')
    }
    for (let index = 1; index < level.checkpoints!.length; index++) {
      const distance = level.checkpoints![index]!.x - level.checkpoints![index - 1]!.x
      assert.ok(distance > 10 && distance < 30)
    }
  }
})

test('all flight checkpoints allow enough time to steer from zero vertical velocity even when boosting', () => {
  for (let number = 10; number <= 1000; number += 10) {
    const level = generateLevel(number)
    for (const checkpoint of level.checkpoints!) {
      const nextGate = level.blocks.find(block => block.x > checkpoint.x)
      if (!nextGate) continue
      const earliestContact = (nextGate.x - checkpoint.x - FLIGHT.playerWidth) / FLIGHT.boostSpeed
      assert.ok(earliestContact >= 3.9 / FLIGHT.boostSpeed - 1e-7)
      const fromTop = nextGate.y === level.flight!.ceiling
      if (fromTop) {
        const neededDescent = nextGate.y + nextGate.height! - checkpoint.y + FLIGHT.playerHeight
        const clampTime = FLIGHT.maxDownSpeed / FLIGHT.gravity
        const possibleDescent = earliestContact <= clampTime ? 0.5 * FLIGHT.gravity * earliestContact ** 2
          : 0.5 * FLIGHT.gravity * clampTime ** 2 + FLIGHT.maxDownSpeed * (earliestContact - clampTime)
        assert.ok(possibleDescent > neededDescent, `level ${number}, ${checkpoint.id} needs more steering room`)
      } else {
        assert.ok(nextGate.y >= checkpoint.y, 'the safe checkpoint altitude can rise directly into the upper passage')
      }
    }
  }
})

for (const boost of [false, true]) {
  test(`every level-forty checkpoint can respawn and clear its next gate${boost ? ' while boosting' : ''}`, () => {
    const level = generateLevel(40)
    for (const checkpoint of level.checkpoints!) {
      const nextGate = level.blocks.find(block => block.x > checkpoint.x)
      if (!nextGate) continue
      // createGame is also the respawn path: a fresh flying body starts at the
      // checkpoint with vy=0. All following movement uses real game inputs.
      const state = createGame({ ...level, spawn: { x: checkpoint.x, y: checkpoint.y } })
      startGame(state)
      assert.equal(state.player.vy, 0)
      const fromTop = nextGate.y === level.flight!.ceiling
      const passageTop = fromTop ? nextGate.y + nextGate.height! : level.flight!.ceiling
      const passageBottom = fromTop ? level.flight!.floor : nextGate.y
      const targetFeet = (passageTop + passageBottom + FLIGHT.playerHeight) / 2
      let first = true
      for (let frame = 0; frame < 600 && state.status === 'playing'
        && state.player.x <= nextGate.x + nextGate.width!; frame++) {
        const feet = state.player.y + state.player.height
        const targetVelocity = Math.max(-3.5, Math.min(3.5, 2 * (targetFeet - feet)))
        const climb = state.player.vy > targetVelocity
        if (first) assert.equal(climb, !fromTop, 'immediate recovery releases lift below upper columns and lifts above lower columns')
        first = false
        stepGame(state, { left: false, right: boost, jump: climb }, 1 / 120)
      }
      assert.equal(state.status, 'playing', `${checkpoint.id} died from ${state.deathReason}`)
      assert.ok(state.player.x > nextGate.x + nextGate.width!, `${checkpoint.id} did not clear its next gate`)
    }
  })
}
