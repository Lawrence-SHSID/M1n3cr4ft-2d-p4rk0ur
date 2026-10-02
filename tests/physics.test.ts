import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Block, GameState, Input, Level } from '../shared/types'
import { blockPosition, blockSize, createGame, PHYSICS, startGame, stepGame } from '../src/game/physics'

const idle: Input = { left: false, right: false, jump: false }
const step = 1 / 120
const ground = (kind: Block['kind'] = 'grass', x = 0, y = 8): Block => ({ id: `floor-${x}-${y}`, x, y, kind, solid: true })
const level = (blocks: Block[] = [ground()]): Level => ({
  number: 1, length: 10, name: 'Physics test', subtitle: '',
  spawn: { x: 0.2, y: 8 }, flag: { x: 100, y: 8 }, blocks, spikes: [],
})
function running(map: Level): GameState {
  const state = createGame(map)
  startGame(state)
  return state
}
function tick(state: GameState, seconds: number, input = idle): void {
  for (let index = 0; index < Math.round(seconds / step); index += 1) stepGame(state, input, step)
}

for (const [kind, height] of [['grass', 1], ['slime', 5]] as const) {
  test(`${kind} jump rises ${height} blocks and returns to its platform`, () => {
    const state = running(level([ground(kind)]))
    const start = state.player.y
    let highest = start
    stepGame(state, { ...idle, jump: true }, step)
    highest = Math.min(highest, state.player.y)
    for (let index = 0; index < 180; index += 1) {
      stepGame(state, idle, step)
      highest = Math.min(highest, state.player.y)
    }
    assert.ok(Math.abs(start - highest - height) < 0.001)
    assert.equal(state.jumps, 1)
    assert.equal(state.player.grounded, true)
    assert.equal(state.player.y, start)
  })
}

test('jumping in midair does not cause a second jump', () => {
  const state = running(level())
  stepGame(state, { ...idle, jump: true }, step)
  tick(state, 0.1)
  const velocity = state.player.vy
  stepGame(state, { ...idle, jump: true }, step)
  assert.equal(state.jumps, 1)
  assert.ok(state.player.vy > velocity)
})

test('holding jump does not jump again after landing', () => {
  const state = running(level())
  tick(state, 1, { ...idle, jump: true })
  assert.equal(state.jumps, 1)
  assert.equal(state.player.grounded, true)
})

test('a queued jump just before landing fires on contact', () => {
  const state = running(level())
  state.player.y -= 0.1
  state.player.grounded = false
  state.player.groundId = null
  state.coyote = 0
  state.player.vy = 2
  tick(state, 0.1, { ...idle, jump: true })
  assert.equal(state.jumps, 1)
  assert.ok(state.player.vy < 0)
})

test('slime height is preserved during a coyote jump off its edge', () => {
  const state = running(level([ground('slime')]))
  state.player.x = 1.02
  stepGame(state, idle, step)
  assert.equal(state.player.grounded, false)
  stepGame(state, { ...idle, jump: true }, step)
  assert.equal(state.jumps, 1)
  assert.ok(state.player.vy < -16)
})

test('spike contact immediately ends the game', () => {
  const map = level()
  map.spikes = [{ x: 0, y: 8 }]
  const state = running(map)
  stepGame(state, idle, step)
  assert.equal(state.status, 'dead')
  assert.equal(state.deathReason, 'spike')
})

test('a one-block jump can clear the spike triangle', () => {
  const map = level(Array.from({ length: 5 }, (_, index) => ground('grass', index)))
  map.spikes = [{ x: 2, y: 8 }]
  const state = running(map)
  tick(state, 0.2, { ...idle, right: true })
  stepGame(state, { ...idle, right: true, jump: true }, step)
  tick(state, 0.5, { ...idle, right: true })
  assert.equal(state.status, 'playing')
  assert.ok(state.player.x > 2.9)
})

test('falling below the world causes void death', () => {
  const state = running(level([]))
  tick(state, 2)
  assert.equal(state.status, 'dead')
  assert.equal(state.deathReason, 'void')
})

test('red flag only finishes when the player is near its base', () => {
  const map = level()
  map.flag = { x: 0.5, y: 8 }
  const state = running(map)
  state.player.y -= 2
  state.player.grounded = false
  stepGame(state, idle, step)
  assert.equal(state.status, 'playing')
  state.player.y = 8 - state.player.height
  stepGame(state, idle, step)
  assert.equal(state.status, 'won')
})

test('horizontal stone platforms carry a standing player', () => {
  const platform: Block = { ...ground('stone'), motion: { axis: 'x', range: 1, speed: 1, phase: 0 } }
  const state = running(level([platform]))
  const startX = state.player.x
  tick(state, 0.5)
  assert.ok(Math.abs(state.player.x - startX - Math.sin(0.5)) < 1e-7)
  assert.equal(state.player.grounded, true)
  assert.equal(state.player.groundId, platform.id)
})

test('vertical stone platforms carry the player and keep contact', () => {
  const platform: Block = { ...ground('stone'), motion: { axis: 'y', range: 1, speed: 1, phase: 0 } }
  const state = running(level([platform]))
  tick(state, 0.5)
  assert.ok(Math.abs(state.player.y + state.player.height - blockPosition(platform, state.time).y) < 1e-7)
  assert.equal(state.player.grounded, true)
})

test('ready, paused and terminal states do not advance', () => {
  const state = createGame(level())
  const original = structuredClone(state)
  stepGame(state, { ...idle, right: true }, step)
  assert.deepEqual(state, original)
  for (const status of ['paused', 'dead', 'won'] as const) {
    state.status = status
    const snapshot = structuredClone(state)
    tick(state, 1, { ...idle, right: true, jump: true })
    assert.deepEqual(state, snapshot)
  }
})

test('solid walls block horizontal travel', () => {
  const state = running(level([ground(), ground('wood', 1, 7)]))
  tick(state, 0.5, { ...idle, right: true })
  assert.equal(state.player.x, 1 - state.player.width)
  assert.equal(state.player.vx, 0)
})

test('solid ceilings stop an upward jump', () => {
  const state = running(level([ground(), ground('leaf', 0, 5)]))
  stepGame(state, { ...idle, jump: true }, step)
  let minimumY = state.player.y
  for (let index = 0; index < 40; index += 1) {
    stepGame(state, idle, step)
    minimumY = Math.min(minimumY, state.player.y)
  }
  assert.ok(minimumY >= 6 - 1e-7)
  assert.equal(state.jumps, 1)
})

test('nonsolid decorative leaves do not block movement', () => {
  const decoration = { ...ground('leaf', 1, 7), solid: false }
  const state = running(level([ground(), decoration, ground('grass', 1), ground('grass', 2)]))
  tick(state, 0.4, { ...idle, right: true })
  assert.ok(state.player.x > 1.8)
})

test('elapsed time uses playing simulation time and invalid steps are ignored', () => {
  const state = running(level())
  stepGame(state, idle, Number.NaN)
  stepGame(state, idle, -1)
  stepGame(state, idle, 0.1)
  assert.ok(Math.abs(state.time - 0.1) < 1e-7)
  assert.ok(Math.abs(state.elapsed - 0.1) < 1e-7)
  assert.equal(PHYSICS.normalJumpHeight, 1)
  assert.equal(PHYSICS.slimeJumpHeight, 5)
})

test('walking, sprinting and sneaking have distinct speeds, with sneak taking priority', () => {
  const floor = { ...ground(), width: 20 }
  for (const [input, speed, sneaking, sprinting] of [
    [{ ...idle, right: true }, PHYSICS.speed, false, false],
    [{ ...idle, right: true, sprint: true }, PHYSICS.sprintSpeed, false, true],
    [{ ...idle, right: true, sneak: true }, PHYSICS.sneakSpeed, true, false],
    [{ ...idle, right: true, sprint: true, sneak: true }, PHYSICS.sneakSpeed, true, false],
  ] as const) {
    const state = running(level([floor]))
    tick(state, 0.2, input)
    assert.ok(Math.abs(state.player.x - 0.2 - speed * 0.2) < 1e-7)
    assert.equal(state.player.vx, speed)
    assert.equal(state.player.sneaking, sneaking)
    assert.equal(state.player.sprinting, sprinting)
  }
})

function tryGap(emptyBlocks: number, coyoteFrames = 0): GameState {
  const map = level([{ ...ground(), width: 3 }, { ...ground('grass', 3 + emptyBlocks), width: 30 }])
  const state = running(map)
  state.player.x = 2.995
  const sprint = { ...idle, right: true, sprint: true }
  for (let frame = 0; frame < coyoteFrames; frame += 1) stepGame(state, sprint, step)
  stepGame(state, { ...sprint, jump: true }, step)
  tick(state, 1.5, sprint)
  return state
}

test('a sprinting normal jump clears a four-block empty gap from the late edge', () => {
  const state = tryGap(4)
  assert.equal(state.status, 'playing')
  assert.ok(state.player.x > 7)
  assert.equal(state.player.grounded, true)
  assert.equal(state.jumps, 1)
})

test('a five-block empty gap is beyond sprint range even with an optimal coyote launch', () => {
  // Examine every fixed-step launch time from the platform edge through the
  // entire coyote window, instead of relying on only one failed attempt.
  for (let delay = 0; delay <= Math.ceil(PHYSICS.coyoteTime / step) + 1; delay += 1) {
    const state = tryGap(5, delay)
    assert.equal(state.status, 'dead', `delay ${delay} unexpectedly cleared five blocks`)
    assert.equal(state.deathReason, 'void')
    assert.equal(state.player.grounded, false)
  }
})

test('sneaking holds the player on both edges, and releasing it allows a fall', () => {
  const state = running(level())
  tick(state, 2, { ...idle, right: true, sneak: true })
  assert.equal(state.player.grounded, true)
  assert.ok(state.player.x < 1)
  assert.ok(state.player.x > 0.99)
  assert.equal(state.player.vx, 0)
  tick(state, 2, { ...idle, left: true, sneak: true })
  assert.equal(state.player.grounded, true)
  assert.ok(state.player.x + state.player.width > 0)
  assert.ok(state.player.x + state.player.width < 0.01)
  tick(state, 1.5, { ...idle, left: true })
  assert.equal(state.status, 'dead')
  assert.equal(state.deathReason, 'void')
})

test('sneaking crosses adjoining tiles but cannot step into a gap', () => {
  const state = running(level([ground(), ground('grass', 1), ground('grass', 3)]))
  tick(state, 2, { ...idle, right: true, sneak: true })
  assert.ok(state.player.x > 1.99 && state.player.x < 2)
  assert.equal(state.player.grounded, true)
})

test('jumping remains available while sneaking at a protected edge', () => {
  const state = running(level())
  tick(state, 1, { ...idle, right: true, sneak: true })
  stepGame(state, { ...idle, right: true, sneak: true, jump: true }, step)
  assert.equal(state.player.grounded, false)
  assert.equal(state.jumps, 1)
  assert.ok(state.player.vy < 0)
  assert.ok(state.player.x > 1)
})

test('crouching preserves the feet and cannot stand up through a slab ceiling', () => {
  const ceiling: Block = { id: 'low-slab', kind: 'stone', x: 1, y: 6.5, width: 2, height: 0.5, solid: true }
  const state = running(level([{ ...ground(), width: 6 }, ceiling]))
  const initialFeet = state.player.y + state.player.height
  stepGame(state, { ...idle, sneak: true }, step)
  assert.equal(state.player.height, PHYSICS.crouchHeight)
  assert.equal(state.player.y + state.player.height, initialFeet)
  tick(state, 0.8, { ...idle, right: true, sneak: true })
  assert.ok(state.player.x > 1 && state.player.x < 3)
  stepGame(state, idle, step)
  assert.equal(state.player.sneaking, true)
  assert.equal(state.player.height, PHYSICS.crouchHeight)
  assert.equal(state.player.y, 7)
  tick(state, 1.5, { ...idle, right: true })
  assert.ok(state.player.x > 3)
  assert.equal(state.player.sneaking, false)
  assert.equal(state.player.height, PHYSICS.playerHeight)
  assert.equal(state.player.y + state.player.height, initialFeet)
})

test('half-slab landing uses the actual width and keeps its top surface', () => {
  const slab: Block = { id: 'wide-slab', kind: 'stone', x: 0, y: 8, width: 2, height: 0.5, solid: true }
  const map = level([slab])
  map.spawn = { x: 1.5, y: 7 }
  const state = running(map)
  tick(state, 0.5)
  assert.equal(state.player.grounded, true)
  assert.equal(state.player.groundId, slab.id)
  assert.equal(state.player.y + state.player.height, 8)
  assert.deepEqual(blockSize(slab), { width: 2, height: 0.5 })
  assert.deepEqual(blockSize(ground()), { width: 1, height: 1 })
})

test('slab underside collisions use its half-height instead of a full cube', () => {
  const slab: Block = { id: 'roof-slab', kind: 'stone', x: 0, y: 5.5, width: 2, height: 0.5, solid: true }
  const state = running(level([ground(), slab]))
  stepGame(state, { ...idle, jump: true }, step)
  let top = state.player.y
  for (let frame = 0; frame < 40; frame += 1) {
    stepGame(state, idle, step)
    top = Math.min(top, state.player.y)
  }
  assert.ok(Math.abs(top - 6) < 1e-7)
})

test('sneaking stays on a moving half slab while it carries the player', () => {
  const slab: Block = {
    id: 'moving-slab', kind: 'stone', x: 0, y: 8, width: 2, height: 0.5, solid: true,
    motion: { axis: 'x', range: 0.75, speed: 1.3, phase: 0 },
  }
  const state = running(level([slab]))
  tick(state, 2, { ...idle, right: true, sneak: true })
  const position = blockPosition(slab, state.time)
  assert.equal(state.player.grounded, true)
  assert.equal(state.player.groundId, slab.id)
  assert.ok(state.player.x < position.x + 2)
  assert.ok(state.player.x > position.x + 1.99)
  assert.equal(state.player.y + state.player.height, 8)
})
