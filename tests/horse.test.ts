import assert from 'node:assert/strict'
import test from 'node:test'
import type { Input, Level } from '../shared/types'
import { HORSE, readSkin } from '../src/game/appearance'
import { createGame, PHYSICS, startGame, stepGame } from '../src/game/physics'
import { createSession, retrySession, startSession, stepSession } from '../src/game/session'
import { generateLevel } from '../shared/levels'

const STEP = 1 / 120, idle: Input = { left: false, right: false, jump: false }
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`)
const arena = (): Level => ({ number: 0, name: 'Horse test', subtitle: '', length: 40,
  spawn: { x: 2, y: 9 }, flag: { x: 39, y: 9 }, spikes: [],
  blocks: [{ id: 'floor', x: 0, y: 9, width: 40, solid: true, kind: 'grass' }],
  checkpoints: [{ id: 'saved', x: 12, y: 9 }] })

test('horse rolls use the exact 5% boundary independently for both players in every theme', () => {
  for (const number of [1, 8, 11, 18, 20, 21, 25, 30]) {
    let rolls = 0
    const session = createSession(generateLevel(number), 'duo', 'pk', { random: () => [ .049999, .05 ][rolls++]! })
    assert.equal(rolls, 2)
    assert.equal(session.runs[0]!.state.player.horse, true)
    assert.equal(session.runs[1]!.state.player.horse, false)
    retrySession(session); assert.equal(rolls, 2, 'retry must not reroll')
  }
})

test('a horse jumps 2.5 blocks normally and retains the five-block slime boost', () => {
  for (const kind of ['grass', 'slime'] as const) {
    const level = arena(); level.blocks[0]!.kind = kind
    const state = createGame(level, { horse: true, skin: 'dream' }); startGame(state)
    const start = state.player.y; let highest = start
    stepGame(state, { ...idle, jump: true }, STEP)
    for (let i = 0; i < 180; i++) { stepGame(state, idle, STEP); highest = Math.min(highest, state.player.y) }
    close(start - highest, kind === 'slime' ? 5 : 2.5); assert.equal(state.player.grounded, true); assert.equal(state.jumps, 1)
  }
})

test('horse movement runs at 130% of sprint speed, crouches slowly and still collides with walls', () => {
  const level = arena(), state = createGame(level, { horse: true }); startGame(state)
  for (const sprint of [false, true]) {
    stepGame(state, { ...idle, right: true, sprint }, STEP)
    close(state.player.vx, PHYSICS.sprintSpeed * 1.3)
  }
  stepGame(state, { ...idle, right: true, sneak: true }, STEP)
  close(state.player.vx, PHYSICS.sneakSpeed); assert.equal(state.player.height, HORSE.crouchHeight)
  level.blocks.push({ id: 'wall', x: 4, y: 6, height: 3, kind: 'stone', solid: true })
  for (let i = 0; i < 80; i++) stepGame(state, { ...idle, right: true }, STEP)
  close(state.player.x + state.player.width, 4); assert.equal(state.player.vx, 0)
})

test('horse, selected skin and correct size survive checkpoint retry and independent duo respawn', () => {
  const session = createSession(arena(), 'duo', 'teamwork', { random: () => 0, skins: { steve: 'dream', alex: 'skeppy' } })
  startSession(session)
  const run = session.runs[0]!; run.checkpoint = session.level.checkpoints![0]!
  retrySession(session)
  assert.equal(run.state.player.x, 12); assert.equal(run.state.player.skin, 'dream'); assert.equal(run.state.player.horse, true)
  close(run.state.player.height, HORSE.height)
  run.state.status = 'dead'; run.respawnIn = .8
  stepSession(session, {}, .81)
  assert.equal(run.state.status, 'playing'); assert.equal(run.state.player.horse, true); assert.equal(run.state.player.skin, 'dream')
  assert.equal(session.runs[1]!.state.player.skin, 'skeppy')
})

test('horses retain ladder controls and flight courses keep normal elytra physics', () => {
  const map = arena(); map.ladders = [{ id: 'ladder', x: 2, y: 4, height: 5 }]
  const mounted = createGame(map, { horse: true }); startGame(mounted)
  const y = mounted.player.y; stepGame(mounted, { ...idle, jump: true }, .2)
  assert.equal(mounted.player.climbing, true); close(y - mounted.player.y, PHYSICS.climbSpeed * .2)
  const flight = generateLevel(10)
  const horse = createGame(flight, { horse: true, skin: 'skeppy' }), ordinary = createGame(flight)
  startGame(horse); startGame(ordinary)
  stepGame(horse, { ...idle, jump: true, right: true }, .1); stepGame(ordinary, { ...idle, jump: true, right: true }, .1)
  close(horse.player.x, ordinary.player.x); close(horse.player.y, ordinary.player.y)
  assert.equal(horse.player.horse, true); assert.equal(horse.player.skin, 'skeppy')
})

test('skin preferences accept four skins and fall back from removed Silver or invalid values', () => {
  for (const skin of ['steve', 'alex', 'dream', 'skeppy'] as const) assert.equal(readSkin(skin, 'steve'), skin)
  assert.equal(readSkin('silver', 'steve'), 'steve'); assert.equal(readSkin('silver', 'alex'), 'alex')
  assert.equal(readSkin(null, 'alex'), 'alex'); assert.equal(readSkin('missing', 'steve'), 'steve')
})
