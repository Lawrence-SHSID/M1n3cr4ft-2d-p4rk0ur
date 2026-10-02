import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Block, GameState, Input, Level } from '../shared/types'
import { FLIGHT, stepFlight } from '../src/game/flight'
import { createGame, startGame, stepGame } from '../src/game/physics'

const idle: Input = { left: false, right: false, jump: false }
const fixedStep = 1 / 120

function course(blocks: Block[] = []): Level {
  return {
    number: 1, length: 100, name: 'Flight test', subtitle: '', kind: 'elytra',
    spawn: { x: 0.5, y: 6 }, flag: { x: 100, y: 10 },
    flight: { ceiling: 0, floor: 12 }, blocks, spikes: [],
  }
}

function flying(level = course()): GameState {
  const state = createGame(level)
  startGame(state)
  return state
}

function tick(state: GameState, duration: number, input: Input = idle): void {
  for (let index = 0; index < Math.round(duration / fixedStep); index += 1) stepGame(state, input, fixedStep)
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-8, `expected ${actual} to be near ${expected}`)
}

test('Elytra creation uses horizontal hitbox with spawn.y at the feet', () => {
  const level = course()
  const state = createGame(level)
  assert.equal(state.player.width, FLIGHT.playerWidth)
  assert.equal(state.player.height, FLIGHT.playerHeight)
  close(state.player.y + state.player.height, level.spawn.y)
  assert.equal(state.player.grounded, false)
  assert.equal(state.coyote, 0)
})

test('idle flight moves forward automatically and descends under gravity', () => {
  const state = flying()
  const start = { x: state.player.x, y: state.player.y }
  tick(state, 0.25)
  close(state.player.x - start.x, FLIGHT.speed * 0.25)
  close(state.player.y - start.y, 0.5 * FLIGHT.gravity * 0.25 ** 2)
  close(state.player.vy, FLIGHT.gravity * 0.25)
  assert.equal(state.player.vx, FLIGHT.speed)
  assert.equal(state.status, 'playing')
})

test('held jump smoothly accelerates upward and release descends without a normal jump', () => {
  const state = flying()
  const startY = state.player.y
  stepGame(state, { ...idle, jump: true }, fixedStep)
  close(state.player.vy, -FLIGHT.liftAcceleration * fixedStep)
  assert.ok(startY - state.player.y < 0.001)
  tick(state, 0.25 - fixedStep, { ...idle, jump: true })
  close(startY - state.player.y, 0.5 * FLIGHT.liftAcceleration * 0.25 ** 2)
  close(state.player.vy, -2)
  assert.equal(state.jumps, 0)
  tick(state, 0.5)
  assert.ok(state.player.vy > 0)
  assert.equal(state.jumps, 0)
})

test('terminal upward and downward speeds are clamped', () => {
  const high = flying()
  tick(high, 0.75, { ...idle, jump: true })
  assert.equal(high.player.vy, -FLIGHT.maxUpSpeed)
  assert.equal(high.status, 'playing')
  const low = flying()
  tick(low, 0.75)
  assert.equal(low.player.vy, FLIGHT.maxDownSpeed)
  assert.equal(low.status, 'playing')
})

test('right input boosts forward speed and release returns to automatic speed', () => {
  const state = flying()
  const x = state.player.x
  tick(state, 0.25, { ...idle, right: true })
  close(state.player.x - x, FLIGHT.boostSpeed * 0.25)
  assert.equal(state.player.vx, FLIGHT.boostSpeed)
  tick(state, 0.25)
  close(state.player.x - x, (FLIGHT.boostSpeed + FLIGHT.speed) * 0.25)
  assert.equal(state.player.vx, FLIGHT.speed)
})

test('left, sneak, and sprint do not affect flight trajectory or body shape', () => {
  const baseline = flying()
  const modified = flying()
  tick(baseline, 0.5)
  tick(modified, 0.5, { ...idle, left: true, sneak: true, sprint: true })
  assert.deepEqual(modified, baseline)
  assert.equal(modified.player.sneaking, false)
  assert.equal(modified.player.sprinting, false)
  assert.equal(modified.player.height, FLIGHT.playerHeight)
})

test('all solid block kinds kill on contact instead of supporting a landing', () => {
  for (const kind of ['grass', 'dirt', 'stone', 'wood', 'leaf', 'slime'] as const) {
    const state = flying(course([{ id: kind, x: 2, y: 4.5, width: 1, height: 3, kind, solid: true }]))
    tick(state, 0.5)
    assert.equal(state.status, 'dead', kind)
    assert.equal(state.deathReason, 'collision', kind)
    assert.equal(state.player.grounded, false)
  }
})

test('ceiling and floor contact are instant collision deaths', () => {
  for (const boundary of ['ceiling', 'floor'] as const) {
    const level = course()
    if (boundary === 'ceiling') level.spawn.y = FLIGHT.playerHeight
    else level.spawn.y = level.flight!.floor
    const state = flying(level)
    stepGame(state, idle, fixedStep)
    assert.equal(state.status, 'dead', boundary)
    assert.equal(state.deathReason, 'collision', boundary)
  }
})

test('flight reaches ceiling and floor bounds through ordinary movement', () => {
  const upward = flying()
  tick(upward, 3, { ...idle, jump: true })
  assert.equal(upward.status, 'dead')
  assert.equal(upward.deathReason, 'collision')
  const downward = flying()
  tick(downward, 3)
  assert.equal(downward.status, 'dead')
  assert.equal(downward.deathReason, 'collision')
})

test('custom slab dimensions leave their actual open space flyable', () => {
  const slab: Block = { id: 'slab', x: 1, y: 6.1, width: 2, height: 0.25, kind: 'stone', solid: true }
  const safe = flying(course([slab]))
  safe.player.y = 5
  tick(safe, 0.1)
  assert.equal(safe.status, 'playing')
  const hit = flying(course([slab]))
  hit.player.y = 5.55
  stepGame(hit, idle, fixedStep)
  assert.equal(hit.status, 'dead')
  assert.equal(hit.deathReason, 'collision')
})

test('fixed subdivision detects a thin block during a large boosted frame', () => {
  const wall: Block = { id: 'thin-wall', x: 2, y: 1, width: 0.02, height: 10, kind: 'wood', solid: true }
  const state = flying(course([wall]))
  stepGame(state, { ...idle, right: true }, 1)
  assert.equal(state.status, 'dead')
  assert.equal(state.deathReason, 'collision')
  assert.ok(state.player.x < wall.x)
  assert.ok(state.elapsed < 1)
})

test('moving block collision uses its position at the current flight time', () => {
  const moving: Block = {
    id: 'moving', x: 3, y: 4, width: 0.25, height: 4, kind: 'stone', solid: true,
    motion: { axis: 'x', range: 1.5, speed: 1, phase: -Math.PI / 2 },
  }
  const state = flying(course([moving]))
  stepGame(state, idle, fixedStep)
  assert.equal(state.status, 'dead')
  assert.equal(state.deathReason, 'collision')
})

test('nonsolid decorative blocks do not affect flight', () => {
  const state = flying(course([{ id: 'leaves', x: 0, y: 4, width: 10, height: 4, kind: 'leaf', solid: false }]))
  tick(state, 0.5)
  assert.equal(state.status, 'playing')
})

test('spike triangle contact kills with spike reason', () => {
  const level = course()
  level.spikes = [{ x: 1, y: 6 }]
  const state = flying(level)
  stepGame(state, idle, fixedStep)
  assert.equal(state.status, 'dead')
  assert.equal(state.deathReason, 'spike')
})

test('a rectangle beside a spike tip is safe despite overlapping its bounding box', () => {
  const level = course()
  level.spikes = [{ x: 0, y: 6 }]
  const state = flying(level)
  state.player.x = 0.91
  state.player.y = 5.03
  stepGame(state, { ...idle, jump: true }, fixedStep)
  assert.equal(state.status, 'playing')
})

test('crossing the flag with the leading edge wins at any safe corridor height', () => {
  const level = course()
  level.flag = { x: 2, y: 11 }
  const state = flying(level)
  tick(state, 0.25, { ...idle, jump: true })
  assert.equal(state.status, 'won')
  assert.equal(state.deathReason, null)
  assert.ok(state.player.x < level.flag.x)
  assert.ok(Math.abs(state.player.y + state.player.height - level.flag.y) > 1)
})

test('collision at the finish has priority over crossing the flag', () => {
  const wall: Block = { id: 'end-wall', x: 2, y: 0, width: 1, height: 12, kind: 'stone', solid: true }
  const level = course([wall])
  level.flag.x = wall.x
  const state = flying(level)
  tick(state, 0.25)
  assert.equal(state.status, 'dead')
  assert.equal(state.deathReason, 'collision')
})

test('large and fixed frames produce equivalent flight motion', () => {
  const large = flying()
  const fixed = flying()
  const input = { ...idle, jump: true, right: true }
  stepGame(large, input, 0.25)
  tick(fixed, 0.25, input)
  close(large.player.x, fixed.player.x)
  close(large.player.y, fixed.player.y)
  close(large.player.vy, fixed.player.vy)
  close(large.elapsed, fixed.elapsed)
})

test('ready, pause, death, win, and invalid frame durations freeze flight state', () => {
  for (const status of ['ready', 'paused', 'dead', 'won'] as const) {
    const state = createGame(course())
    state.status = status
    const snapshot = structuredClone(state)
    stepFlight(state, { ...idle, jump: true, right: true }, 0.25)
    assert.deepEqual(state, snapshot)
  }
  const state = flying()
  const snapshot = structuredClone(state)
  for (const duration of [0, -1, Number.NaN, Infinity]) stepFlight(state, idle, duration)
  assert.deepEqual(state, snapshot)
})
