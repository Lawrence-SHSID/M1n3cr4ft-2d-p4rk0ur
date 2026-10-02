import assert from 'node:assert/strict'
import test from 'node:test'
import { generateLevel } from '../shared/levels'
import type { GameState, Input } from '../shared/types'
import { blockPosition, createGame, startGame, stepGame } from '../src/game/physics'

const STEP = 1 / 120
const IDLE: Input = { left: false, right: false, jump: false }

/** Drive a real player from spawn using only the game's public input API. */
function playCourse(number: number) {
  const state = createGame(generateLevel(number))
  startGame(state)
  const groundKinds = new Set<string>()
  const tick = (input: Input) => {
    stepGame(state, input, STEP)
    if (state.player.grounded && state.player.groundKind) groundKinds.add(state.player.groundKind)
    assert.notEqual(state.status, 'dead', `Level ${number}: ${state.deathReason} at x=${state.player.x.toFixed(2)}`)
  }
  const to = (target: number, jump = false, sprint = false) => {
    let firstStep = true
    for (let frame = 0; frame < 1500; frame++) {
      if (state.status === 'won' || (state.player.x >= target - 0.05 && state.player.grounded)) return
      tick({ left: false, right: state.player.x < target - 0.012, jump: jump && firstStep, sprint })
      firstStep = false
    }
    assert.fail(`Level ${number}: could not reach x=${target}; stopped at ${state.player.x}`)
  }
  const wait = (condition: (state: GameState) => boolean) => {
    for (let frame = 0; frame < 2400; frame++) {
      if (condition(state)) return
      tick(IDLE)
    }
    assert.fail(`Level ${number}: timed out waiting for the ferry`)
  }
  const ride = (destination: number) => {
    assert.equal(state.player.groundKind, 'stone', 'boarding must actually land on a moving slab')
    const boardedX = state.player.x
    const boardedId = state.player.groundId
    wait(current => current.player.x >= destination)
    assert.equal(state.player.groundId, boardedId, 'remain on the same slab while riding')
    assert.ok(state.player.x - boardedX > 3, 'the ferry must carry the player across the channel')
  }
  return { state, groundKinds, to, wait, ride }
}

test('the ten-block introduction is completable through the gap and five-block slime jump', () => {
  const { state, groundKinds, to } = playCourse(1)
  to(2.45)
  to(4.75, true)
  to(5.12)
  to(9.05, true)
  assert.equal(state.status, 'won')
  assert.ok(groundKinds.has('slime'))
  assert.ok(state.jumps >= 2)
})

test('the fifteen-block course is completable across its four-empty-block sprint gap', () => {
  const { state, to } = playCourse(2)
  to(3.95)
  to(8.4, true, true)
  assert.ok(state.player.x >= 8.35 && state.player.grounded)
  to(9.3)
  to(11.13, true)
  to(14.05, true, true)
  assert.equal(state.status, 'won')
  assert.ok(state.jumps >= 3)
})

test('the forest course is completable across half-height stairs and its high finish', () => {
  const { state, to } = playCourse(3)
  to(2.8)
  to(4.6, true, true)
  to(5.85)
  to(8.55, true, true)
  to(9.8)
  to(11.23, true)
  to(11.3)
  to(13.13, true)
  to(19.05, true, true)
  assert.equal(state.status, 'won')
  assert.ok(state.jumps >= 5)
})

test('the stone-ferry course is completable by boarding and riding the slab, then clearing spikes', () => {
  const { state, groundKinds, to, ride } = playCourse(4)
  to(4.9)
  to(7.15, true)
  ride(11.25)
  to(13.5, true)
  to(14.3)
  to(16.13, true)
  to(24.05, true, true)
  assert.equal(state.status, 'won')
  assert.ok(groundKinds.has('stone'))
  assert.ok(state.jumps >= 4)
})

test('the ridge course is completable through ascent, spike crossing, and descent', () => {
  const { state, to } = playCourse(5)
  to(3.85)
  to(6.3, true, true)
  to(7.8)
  to(9.35, true)
  to(10.8)
  to(13.3, true, true)
  to(15.12)
  to(18.13, true)
  to(18.25)
  to(20.15, true)
  to(24.18, true, true)
  to(26.12)
  to(29.05, true)
  assert.equal(state.status, 'won')
  assert.ok(state.jumps >= 7)
})

test('the skyline circuit is completable with a sprint leap, timed ferry, and two slime rises', () => {
  const { state, groundKinds, to, wait, ride } = playCourse(6)
  to(3.95)
  to(8.4, true, true)
  to(10.85)
  const ferry = state.level.blocks.find(block => block.motion)!
  wait(current => blockPosition(ferry, current.time).x <= 13)
  to(13.1, true)
  ride(18.6)
  to(20.3, true)
  to(22.1)
  to(25.13, true)
  to(25.2)
  to(27.15, true)
  to(27.85)
  to(30.15, true)
  to(34.05, true)
  assert.equal(state.status, 'won')
  assert.ok(groundKinds.has('stone') && groundKinds.has('slime'))
  assert.ok(state.jumps >= 7)
  assert.ok(state.elapsed < 30)
})
