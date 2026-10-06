import assert from 'node:assert/strict'
import test from 'node:test'
import type { CharacterId, GameSession, Input, Level } from '../shared/types'
import { generateLevel } from '../shared/levels'
import { createSession, retrySession, startSession, stepSession } from '../src/game/session'

const idle: Input = { left: false, right: false, jump: false }
const right: Input = { ...idle, right: true }
const step = 1 / 120
function course(): Level {
  return { number: 9, length: 50, name: 'Race test', subtitle: '',
    spawn: { x: 0.8, y: 8 }, flag: { x: 12, y: 8 },
    blocks: [{ id: 'floor', kind: 'grass', solid: true, x: 0, y: 8, width: 100 }],
    spikes: [], checkpoints: [{ id: 'saved', x: 4, y: 8 }] }
}
function race(level = course()): GameSession {
  const session = createSession(level, 'duo', 'pk')
  startSession(session)
  return session
}

test('PK starts both players at the same safe line across all dimensions and flight', () => {
  for (const number of [1, 7, 11, 19, 20, 25, 30]) {
    const session = createSession(generateLevel(number), 'duo', 'pk')
    assert.equal(session.multiplayerMode, 'pk')
    assert.equal(session.result, null)
    assert.deepEqual(session.runs[0]!.state.player, session.runs[1]!.state.player)
    assert.equal(session.runs[0]!.state.player.x, session.level.spawn.x)
  }
  const solo = createSession(course(), 'solo', 'pk')
  assert.equal(solo.multiplayerMode, 'teamwork')
  assert.equal(solo.runs.length, 1)
})

for (const winner of ['steve', 'alex'] as CharacterId[]) {
  test('PK ends immediately when ' + winner + ' reaches the flag and freezes the race', () => {
    const session = race()
    stepSession(session, { [winner]: right }, 4)
    assert.equal(session.status, 'won')
    assert.equal(session.result, winner)
    assert.equal(session.runs.filter(run => run.state.status === 'won').length, 1)
    assert.ok(session.elapsed < 4, 'the losing player is not allowed to finish the remaining step')
    const frozen = structuredClone(session)
    stepSession(session, { steve: right, alex: right }, 1)
    assert.deepEqual(session, frozen)
  })
}

test('same-step PK finishes are a draw, independent of the runner array order', () => {
  for (const reverse of [false, true]) {
    const session = race()
    if (reverse) session.runs.reverse()
    stepSession(session, { steve: right, alex: right }, 4)
    assert.equal(session.status, 'won')
    assert.equal(session.result, 'draw')
    assert.ok(session.runs.every(run => run.state.status === 'won'))
  }
})

test('Teamwork still waits for both players and never declares a race winner', () => {
  const session = createSession(course(), 'duo', 'teamwork')
  startSession(session)
  stepSession(session, { steve: right }, 4)
  assert.equal(session.runs[0]!.state.status, 'won')
  assert.equal(session.status, 'playing')
  assert.equal(session.result, null)
  stepSession(session, { alex: right }, 4)
  assert.equal(session.status, 'won')
  assert.equal(session.result, null)
})

test('PK retains personal checkpoints and respawns one fallen racer while the other moves', () => {
  const level = course(); level.flag.x = 90
  const session = race(level), [steve, alex] = session.runs
  stepSession(session, { steve: right }, 0.75)
  assert.equal(steve!.checkpoint?.id, 'saved')
  assert.equal(alex!.checkpoint, null)
  steve!.state.player.y = 17; steve!.state.player.grounded = false
  stepSession(session, {}, step)
  assert.equal(steve!.state.status, 'dead')
  stepSession(session, { alex: right }, 0.81)
  assert.equal(steve!.state.status, 'playing')
  assert.equal(steve!.state.player.x, 4)
  assert.ok(alex!.state.player.x > level.spawn.x + 3)
  assert.equal(session.status, 'playing')
  assert.equal(session.result, null)
  // Without a saved checkpoint, Alex returns to the shared race line.
  alex!.checkpoint = null
  alex!.state.player.y = 17; alex!.state.player.grounded = false
  stepSession(session, {}, step)
  stepSession(session, {}, 0.81)
  assert.equal(alex!.state.player.x, level.spawn.x)
})

test('PK retry clears the previous result; a fresh rematch clears both personal checkpoints', () => {
  const session = race()
  stepSession(session, { alex: right }, 4)
  assert.equal(session.result, 'alex')
  retrySession(session)
  assert.equal(session.result, null)
  assert.equal(session.status, 'playing')
  assert.ok(session.runs.every(run => run.state.status === 'playing'))
  assert.equal(session.runs[1]!.state.player.x, 4)
  const rematch = createSession(session.level, 'duo', 'pk')
  assert.equal(rematch.result, null)
  assert.equal(rematch.elapsed, 0)
  assert.ok(rematch.runs.every(run => run.checkpoint === null))
  assert.deepEqual(rematch.runs[0]!.state.player, rematch.runs[1]!.state.player)
})

test('PK flight names the first pilot across the flag without waiting for the second', () => {
  const level: Level = { ...course(), kind: 'elytra', flight: { ceiling: 0, floor: 12 },
    spawn: { x: 0.8, y: 6 }, flag: { x: 8, y: 6 }, blocks: [], checkpoints: [] }
  const session = race(level)
  for (let frame = 0; frame < 240 && session.status === 'playing'; frame++) {
    const lift = (id: CharacterId, boost: boolean): Input => {
      const player = session.runs.find(run => run.id === id)!.state.player
      return { ...idle, right: boost, jump: player.y + player.height + player.vy * 0.55 > 6 }
    }
    stepSession(session, { steve: lift('steve', true), alex: lift('alex', false) }, step)
  }
  assert.equal(session.status, 'won')
  assert.equal(session.result, 'steve')
  assert.equal(session.runs[1]!.state.status, 'playing')
})
