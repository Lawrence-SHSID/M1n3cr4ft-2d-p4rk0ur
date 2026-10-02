import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Block, CharacterId, GameSession, Input, Level } from '../shared/types'
import { generateLevel } from '../shared/levels'
import { blockPosition } from '../src/game/physics'
import { createSession, retrySession, startSession, stepSession } from '../src/game/session'

const idle: Input = { left: false, right: false, jump: false }
const right: Input = { ...idle, right: true }
const left: Input = { ...idle, left: true }
const step = 1 / 120
const floor: Block = { id: 'floor', x: 0, y: 8, kind: 'grass', width: 100, solid: true }
function map(length = 50): Level {
  return {
    number: 9, length, name: 'Session test', subtitle: '',
    spawn: { x: 0.8, y: 8 }, flag: { x: 90, y: 8 },
    blocks: [{ ...floor }], spikes: [],
    checkpoints: [{ id: 'cp-1', x: 10, y: 8 }, { id: 'cp-2', x: 20, y: 8 }],
  }
}
function tick(session: GameSession, seconds: number, inputs: Partial<Record<CharacterId, Input>> = {}): void {
  for (let frame = 0; frame < Math.round(seconds / step); frame += 1) stepSession(session, inputs, step)
}
function running(level = map(), mode: 'solo' | 'duo' = 'solo'): GameSession {
  const session = createSession(level, mode)
  startSession(session)
  return session
}
function moveToCheckpoint(session: GameSession, id: CharacterId, x = 10): void {
  const run = session.runs.find(item => item.id === id)!
  for (let frame = 0; frame < 800 && run.checkpoint?.x !== x; frame += 1) {
    stepSession(session, { [id]: right }, step)
  }
  assert.equal(run.checkpoint?.x, x)
}

test('solo starts with Steve and duo starts both characters about a block apart', () => {
  const solo = createSession(map())
  assert.deepEqual(solo.runs.map(run => run.id), ['steve'])
  assert.equal(solo.status, 'ready')
  const duo = createSession(map(), 'duo')
  assert.deepEqual(duo.runs.map(run => run.id), ['steve', 'alex'])
  assert.equal(duo.runs[1]!.state.player.x - duo.runs[0]!.state.player.x, 1)
  assert.ok(duo.runs.every(run => run.state.player.grounded))
})

test('duo safe spawn avoids a nearby spike', () => {
  const level = map()
  level.spawn.x = 2
  level.spikes.push({ x: 3, y: 8 })
  const session = createSession(level, 'duo')
  assert.equal(session.runs[1]!.state.player.x, 1)
  startSession(session)
  stepSession(session, {}, step)
  assert.ok(session.runs.every(run => run.state.status === 'playing'))
})

test('two runners move simultaneously and independently', () => {
  const session = running(map(), 'duo')
  const [steve, alex] = session.runs
  const steveX = steve!.state.player.x
  const alexX = alex!.state.player.x
  tick(session, 0.2, { steve: right, alex: left })
  assert.ok(Math.abs(steve!.state.player.x - steveX - 4.3 * 0.2) < 1e-7)
  assert.ok(Math.abs(alex!.state.player.x - alexX + 4.3 * 0.2) < 1e-7)
  assert.equal(steve!.state.player.facing, 1)
  assert.equal(alex!.state.player.facing, -1)
})

test('checkpoint progress is personal and only routes longer than 45 blocks qualify', () => {
  for (const length of [45, 46]) {
    const session = running(map(length), 'duo')
    tick(session, 2.1, { steve: right })
    assert.equal(session.runs[0]!.checkpoint?.id ?? null, length > 45 ? 'cp-1' : null)
    assert.equal(session.runs[1]!.checkpoint, null)
  }
})

test('checkpoint activation requires grounded feet at the matching height and never moves backward', () => {
  const session = running()
  const run = session.runs[0]!
  run.state.player.x = 10
  run.state.player.y = 8 - run.state.player.height - 1
  run.state.player.grounded = false
  run.state.coyote = 0
  stepSession(session, {}, step)
  assert.equal(run.checkpoint, null)
  run.state.player.y = 8 - run.state.player.height
  stepSession(session, {}, step)
  assert.equal(session.runs[0]!.checkpoint?.id, 'cp-1')
  moveToCheckpoint(session, 'steve', 20)
  run.state.player.x = 10
  stepSession(session, {}, step)
  assert.equal(session.runs[0]!.checkpoint?.id, 'cp-2')
})

test('solo death waits for retry at the saved checkpoint and a new session resets to the start', () => {
  const session = running()
  moveToCheckpoint(session, 'steve')
  const run = session.runs[0]!
  run.state.player.y = 17
  run.state.player.grounded = false
  stepSession(session, {}, step)
  assert.equal(session.status, 'dead')
  assert.equal(run.deaths, 1)
  const time = session.time
  const elapsed = session.elapsed
  tick(session, 1)
  assert.equal(session.time, time)
  retrySession(session)
  assert.equal(session.status, 'playing')
  assert.equal(run.state.player.x, 10)
  assert.equal(run.state.player.y + run.state.player.height, 8)
  assert.equal(run.state.player.grounded, true)
  assert.equal(run.checkpoint?.id, 'cp-1')
  assert.equal(run.state.deathReason, null)
  assert.equal(run.state.jumpBuffer, 0)
  assert.equal(run.state.jumpWasPressed, false)
  assert.equal(run.state.player.height, 1.25)
  assert.equal(run.state.player.facing, 1)
  assert.equal(session.time, time)
  assert.equal(session.elapsed, elapsed)
  assert.equal(run.state.time, time)
  assert.equal(run.state.elapsed, elapsed)
  const fresh = createSession(session.level)
  assert.equal(fresh.runs[0]!.checkpoint, null)
  assert.equal(fresh.runs[0]!.state.player.x, session.level.spawn.x)
  assert.equal(fresh.time, 0)
})

test('duo death respawns only the fallen runner after 0.8 seconds while the partner continues', () => {
  const session = running(map(), 'duo')
  moveToCheckpoint(session, 'steve')
  const [steve, alex] = session.runs
  steve!.state.player.y = 17
  steve!.state.player.grounded = false
  stepSession(session, { alex: right }, step)
  assert.equal(steve!.state.status, 'dead')
  assert.equal(steve!.deaths, 1)
  assert.equal(steve!.respawnIn, 0.8)
  assert.equal(session.status, 'playing')
  const alexX = alex!.state.player.x
  tick(session, 0.79, { alex: right })
  assert.equal(steve!.state.status, 'dead')
  assert.ok(alex!.state.player.x > alexX + 3)
  tick(session, 0.02, { alex: right })
  assert.equal(steve!.state.status, 'playing')
  assert.equal(steve!.state.player.x, 10)
  assert.equal(steve!.checkpoint?.id, 'cp-1')
  assert.equal(steve!.state.deathReason, null)
  assert.equal(alex!.checkpoint, null)
  assert.ok(Math.abs(steve!.state.time - session.time) < 1e-7)
})

test('a shared retry preserves each runner\'s different checkpoint', () => {
  const session = running(map(), 'duo')
  moveToCheckpoint(session, 'steve', 20)
  moveToCheckpoint(session, 'alex', 10)
  const time = session.time
  retrySession(session)
  const [steve, alex] = session.runs
  assert.equal(steve!.state.player.x, 20)
  assert.equal(steve!.checkpoint?.id, 'cp-2')
  assert.equal(alex!.state.player.x, 10)
  assert.equal(alex!.checkpoint?.id, 'cp-1')
  assert.equal(session.time, time)
  assert.ok(session.runs.every(run => run.state.status === 'playing'))
})

test('duo finish waits for both runners and keeps the first finisher frozen', () => {
  const level = map()
  level.flag = { x: 30, y: 8 }
  const session = running(level, 'duo')
  const [steve, alex] = session.runs
  steve!.state.player.x = level.flag.x - steve!.state.player.width / 2
  stepSession(session, {}, step)
  assert.equal(steve!.state.status, 'won')
  assert.equal(alex!.state.status, 'playing')
  assert.equal(session.status, 'playing')
  const stevePlayer = structuredClone(steve!.state.player)
  tick(session, 0.5, { steve: left, alex: right })
  assert.deepEqual(steve!.state.player, stevePlayer)
  alex!.state.player.x = level.flag.x - alex!.state.player.width / 2
  stepSession(session, {}, step)
  assert.equal(session.status, 'won')
  assert.ok(session.runs.every(run => run.state.status === 'won'))
})

test('both riders use an identical shared moving-platform phase', () => {
  const moving: Block = { ...floor, width: 6, height: 0.5, kind: 'stone', motion: { axis: 'x', range: 1, speed: 1, phase: 0 } }
  const level = map()
  // The start area includes a static surface for Alex's safe-spawn search, but
  // the moving surface is first, so both actual riders are carried by the slab.
  level.blocks = [moving, { ...floor, width: 6 }]
  const session = running(level, 'duo')
  const [steve, alex] = session.runs
  const before = session.runs.map(run => run.state.player.x)
  tick(session, 0.5)
  const offset = blockPosition(moving, session.time).x - moving.x
  assert.ok(Math.abs(steve!.state.player.x - before[0]! - offset) < 1e-7)
  assert.ok(Math.abs(alex!.state.player.x - before[1]! - offset) < 1e-7)
  assert.ok(session.runs.every(run => Math.abs(run.state.time - session.time) < 1e-7))
  assert.ok(session.runs.every(run => Math.abs(run.state.elapsed - session.elapsed) < 1e-7))
})

test('shared pause freezes runners and the world, then resumes together', () => {
  const session = running(map(), 'duo')
  tick(session, 0.2, { steve: right, alex: right })
  session.status = 'paused'
  const snapshot = structuredClone(session)
  tick(session, 0.5, { steve: right, alex: left })
  assert.deepEqual(session, snapshot)
  startSession(session)
  tick(session, 0.1, { steve: right, alex: left })
  assert.equal(session.status, 'playing')
  assert.ok(session.time > snapshot.time)
  assert.ok(session.runs[0]!.state.player.x > snapshot.runs[0]!.state.player.x)
  assert.ok(session.runs[1]!.state.player.x < snapshot.runs[1]!.state.player.x)
})

function flightMap(): Level {
  return {
    number: 10, length: 55, kind: 'elytra', flight: { ceiling: 0, floor: 12 },
    name: 'Flight session test', subtitle: '', spawn: { x: 0.8, y: 6 }, flag: { x: 54.35, y: 6 },
    blocks: [], spikes: [], checkpoints: [{ id: 'air-cp', x: 10, y: 6 }],
  }
}

function steerAtAltitude(session: GameSession, id: CharacterId, feet = 6, boost = false): Input {
  const player = session.runs.find(run => run.id === id)!.state.player
  return { left: false, right: boost, jump: player.y + player.height + player.vy * 0.55 > feet }
}

test('flight creates both players airborne at separate safe starting positions', () => {
  const session = running(flightMap(), 'duo')
  const [steve, alex] = session.runs
  assert.equal(steve!.state.player.width, 1.1)
  assert.equal(steve!.state.player.height, 0.6)
  assert.equal(steve!.state.player.grounded, false)
  assert.equal(alex!.state.player.grounded, false)
  assert.ok(alex!.state.player.x >= steve!.state.player.x + steve!.state.player.width)
  tick(session, 0.3, { steve: { ...idle, jump: true }, alex: right })
  assert.ok(steve!.state.player.y < 5.4)
  assert.ok(alex!.state.player.y > 5.4)
  assert.equal(steve!.state.player.vx, 5)
  assert.equal(alex!.state.player.vx, 8)
})

test('airborne checkpoint activation is personal, and retry restores a fresh flying body', () => {
  const session = running(flightMap(), 'duo')
  const [steve, alex] = session.runs
  for (let frame = 0; frame < 300 && !steve!.checkpoint; frame += 1) {
    stepSession(session, {
      steve: steerAtAltitude(session, 'steve', 6, true),
      alex: steerAtAltitude(session, 'alex'),
    }, step)
  }
  assert.equal(steve!.checkpoint?.id, 'air-cp')
  assert.equal(alex!.checkpoint, null)
  assert.equal(steve!.state.player.grounded, false)
  const time = session.time
  const elapsed = session.elapsed
  retrySession(session)
  assert.equal(steve!.state.player.x, 10)
  assert.equal(steve!.state.player.y + steve!.state.player.height, 6)
  assert.equal(steve!.state.player.width, 1.1)
  assert.equal(steve!.state.player.height, 0.6)
  assert.equal(steve!.state.player.grounded, false)
  assert.equal(steve!.state.player.groundId, null)
  assert.equal(steve!.state.player.vy, 0)
  assert.equal(steve!.state.coyote, 0)
  assert.equal(steve!.state.jumpBuffer, 0)
  assert.equal(session.time, time)
  assert.equal(session.elapsed, elapsed)
})

test('a flight collision automatically respawns only that pilot in duo mode', () => {
  const session = running(flightMap(), 'duo')
  const [steve, alex] = session.runs
  steve!.checkpoint = session.level.checkpoints![0]!
  steve!.state.player.y = -0.1
  stepSession(session, { alex: steerAtAltitude(session, 'alex') }, step)
  assert.equal(steve!.state.status, 'dead')
  assert.equal(steve!.state.deathReason, 'collision')
  assert.equal(session.status, 'playing')
  const alexX = alex!.state.player.x
  for (let frame = 0; frame < 96; frame += 1) {
    stepSession(session, { alex: steerAtAltitude(session, 'alex') }, step)
  }
  assert.equal(steve!.state.status, 'playing')
  assert.equal(steve!.state.player.x, 10)
  assert.equal(steve!.state.player.grounded, false)
  assert.equal(steve!.state.deathReason, null)
  assert.ok(alex!.state.player.x > alexX + 3.9)
})

test('duo flight requires both pilots to finish, without a flag altitude requirement', () => {
  const level = flightMap()
  level.flag = { x: 12, y: 1 }
  const session = running(level, 'duo')
  const [steve, alex] = session.runs
  for (let frame = 0; frame < 400 && steve!.state.status !== 'won'; frame += 1) {
    stepSession(session, {
      steve: steerAtAltitude(session, 'steve', 6, true),
      alex: steerAtAltitude(session, 'alex'),
    }, step)
  }
  assert.equal(steve!.state.status, 'won')
  assert.equal(alex!.state.status, 'playing')
  assert.equal(session.status, 'playing')
  for (let frame = 0; frame < 400 && session.status === 'playing'; frame += 1) {
    stepSession(session, { alex: steerAtAltitude(session, 'alex') }, step)
  }
  assert.equal(session.status, 'won')
  assert.ok(session.runs.every(run => run.state.status === 'won'))
})

function flightTarget(session: GameSession): number {
  const run = session.runs[0]!
  const player = run.state.player
  const bounds = session.level.flight!
  const gate = session.level.blocks.filter(block => block.solid && block.x + (block.width ?? 1) >= player.x)
    .sort((a, b) => a.x - b.x)[0]
  const checkpoint = session.level.checkpoints?.find(point => point.x > (run.checkpoint?.x ?? -Infinity)
    && point.x >= player.x - 0.8 && (!gate || point.x < gate.x))
  if (checkpoint) return checkpoint.y
  if (!gate) return 6
  const fromTop = gate.y === bounds.ceiling
  const lowerEdge = fromTop ? gate.y + (gate.height ?? 1) : bounds.ceiling
  const upperEdge = fromTop ? bounds.floor : gate.y
  return (lowerEdge + upperEdge + player.height) / 2
}

for (const number of [10, 20]) {
  test(`generated flight level ${number} completes with real steering and activates airborne checkpoints`, () => {
    const session = running(generateLevel(number))
    for (let frame = 0; frame < 6000 && session.status === 'playing'; frame += 1) {
      stepSession(session, { steve: steerAtAltitude(session, 'steve', flightTarget(session)) }, step)
    }
    assert.equal(session.status, 'won', JSON.stringify(session.runs[0]!.state.player))
    assert.ok(session.runs[0]!.checkpoint)
    assert.equal(session.runs[0]!.deaths, 0)
  })
}
