import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameSession, Input, Level } from '../shared/types'
import { generateLevel } from '../shared/levels'
import { COMBAT } from '../src/game/combat'
import { KeyboardControls } from '../src/game/controls'
import { PHYSICS, stepGame } from '../src/game/physics'
import { createSession, retrySession, startSession, stepSession } from '../src/game/session'

const STEP = 1 / 120
const IDLE: Input = { left: false, right: false, jump: false }
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
function arena(): Level {
  return { number: 8, length: 20, name: 'Bonus test', subtitle: '', spawn: { x: 5, y: 9 },
    flag: { x: 19, y: 9 }, blocks: [{ id: 'floor', x: 0, y: 9, width: 20, kind: 'grass', solid: true }],
    spikes: [], bonus: { skeleton: { x: 8, y: 9 } } }
}
function running(mode: 'solo' | 'duo' = 'solo', rule: 'teamwork' | 'pk' = 'teamwork') {
  const session = createSession(arena(), mode, rule); startSession(session); return session
}
function tick(session: GameSession, seconds: number, input: Input = IDLE) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepSession(session, { steve: input }, STEP)
}
function hit(session: GameSession, id: 'steve' | 'alex' = 'steve', vx: number = PHYSICS.speed) {
  const p = session.runs.find(run => run.id === id)!.state.player
  session.combat!.arrows.push({ id: session.combat!.nextArrowId++, x: p.x + p.width / 2,
    y: p.y + p.height / 2, vx, vy: 0, life: 8 })
  stepSession(session, {}, STEP)
}

test('bonus skeletons stand on safe exposed ground around the middle of each route', () => {
  for (let number = 8; number <= 998; number += 10) {
    const level = generateLevel(number), spawn = level.bonus!.skeleton
    assert.match(level.name, /^Bonus:/); assert.deepEqual(level, generateLevel(number))
    for (const x of [spawn.x, spawn.x + .65]) assert.ok(level.blocks.some(block => block.solid && !block.motion
      && block.y === spawn.y && x >= block.x && x <= block.x + (block.width ?? 1)))
    const progress = level.layout === 'vertical' ? (level.spawn.y - spawn.y) / (level.spawn.y - level.flag.y)
      : (spawn.x + .325 - level.spawn.x) / (level.flag.x - level.spawn.x)
    assert.ok(progress >= .3 && progress <= .7, `bonus ${number} progress ${progress}`)
    assert.ok(!level.spikes.some(spike => spike.y === spawn.y && spike.x < spawn.x + .65 && spike.x + 1 > spawn.x))
    assert.ok(!level.blocks.some(block => block.solid && !block.motion && block.x < spawn.x + .65
      && block.x + (block.width ?? 1) > spawn.x && block.y < spawn.y && block.y + (block.height ?? 1) > spawn.y - 1.8))
  }
  for (const number of [1, 7, 9, 10, 20, 21, 25, 30]) assert.equal(generateLevel(number).bonus, undefined)
})

test('players start with 20 hearts and Skelly starts with 15', () => {
  const session = running('duo')
  assert.ok(session.runs.every(run => run.state.combat!.hearts === 20))
  assert.equal(session.combat!.skeleton.hearts, 15)
  assert.equal(createSession(generateLevel(1)).combat, undefined)
})

test('the skeleton faces a player on either side, never moves and fires at walking speed', () => {
  const session = running(), skeleton = session.combat!.skeleton
  const position = { x: skeleton.x, y: skeleton.y }
  tick(session, 1.2, { ...IDLE, sprint: true })
  assert.equal(skeleton.facing, -1)
  const arrow = session.combat!.arrows[0]!
  close(Math.hypot(arrow.vx, arrow.vy), PHYSICS.speed)
  assert.notEqual(Math.hypot(arrow.vx, arrow.vy), PHYSICS.sprintSpeed)
  session.runs[0]!.state.player.x = 12
  tick(session, STEP)
  assert.equal(skeleton.facing, 1)
  assert.deepEqual({ x: skeleton.x, y: skeleton.y }, position)
})

test('each arrow takes 2.5 hearts once and eight hits end that attempt', () => {
  const session = running(), run = session.runs[0]!
  session.combat!.skeleton.shootIn = 100
  for (let n = 1; n <= 8; n++) {
    hit(session)
    assert.equal(run.state.combat!.hearts, 20 - n * 2.5)
    assert.equal(session.combat!.arrows.length, 0)
  }
  assert.equal(run.state.deathReason, 'arrow'); assert.equal(run.deaths, 1)
  assert.equal(session.status, 'dead')
})

test('arrow knockback pushes exactly 0.75 blocks despite movement or crouch input', () => {
  for (const direction of [-1, 1]) {
    const session = running(), state = session.runs[0]!.state
    hit(session, 'steve', direction * PHYSICS.speed)
    const x = state.player.x
    stepGame(state, { ...IDLE, right: direction < 0, left: direction > 0, sprint: true, sneak: true }, .125)
    close(state.player.x - x, direction * .75)
    close(state.combat!.knockbackRemaining, 0)
  }
})

test('knockback respects a wall and can knock crouching players over an edge', () => {
  const wall = running(), state = wall.runs[0]!.state
  wall.level.blocks.push({ id: 'wall', x: 5.9, y: 7, width: 1, height: 2, solid: true, kind: 'stone' })
  hit(wall); stepGame(state, IDLE, .25)
  close(state.player.x + state.player.width, 5.9)
  const edge = running(), edgeState = edge.runs[0]!.state
  edge.level.blocks[0]!.width = 5.5
  hit(edge); stepGame(edgeState, { ...IDLE, sneak: true }, .25)
  assert.ok(edgeState.player.x > 5.5); assert.equal(edgeState.player.grounded, false)
})

test('two simultaneous arrows each deal damage and contribute their full knockback', () => {
  const session = running(), state = session.runs[0]!.state, p = state.player
  for (let id = 1; id <= 2; id++) session.combat!.arrows.push({ id, x: p.x + p.width / 2,
    y: p.y + p.height / 2, vx: PHYSICS.speed, vy: 0, life: 8 })
  stepSession(session, {}, STEP)
  assert.equal(state.combat!.hearts, 15)
  const x = p.x
  stepGame(state, IDLE, .5)
  close(p.x - x, 1.5)
})

test('solid blocks intercept arrows before players and old arrows expire', () => {
  const session = running()
  session.combat!.skeleton.shootIn = 100
  session.level.blocks.push({ id: 'cover', x: 6.5, y: 7, height: 2, solid: true, kind: 'stone' })
  session.combat!.arrows.push({ id: 1, x: 8, y: 8.3, vx: -PHYSICS.speed, vy: 0, life: 8 })
  tick(session, 1)
  assert.equal(session.runs[0]!.state.combat!.hearts, 20)
  assert.equal(session.combat!.arrows.length, 0)
  session.combat!.arrows.push({ id: 2, x: 15, y: 5, vx: 0, vy: 0, life: STEP })
  tick(session, STEP); assert.equal(session.combat!.arrows.length, 0)
})

test('the stone sword requires reach and facing, deals six, and needs three timed hits', () => {
  const session = running(), p = session.runs[0]!.state.player
  session.combat!.skeleton.shootIn = 100
  tick(session, STEP, { ...IDLE, attack: true })
  assert.equal(session.combat!.skeleton.hearts, 15, 'out of reach')
  p.x = 7; p.facing = -1
  tick(session, .45, { ...IDLE, attack: true })
  assert.equal(session.combat!.skeleton.hearts, 15, 'facing away')
  p.facing = 1
  tick(session, .45, { ...IDLE, attack: true })
  assert.equal(session.combat!.skeleton.hearts, 9)
  tick(session, STEP, { ...IDLE, attack: true })
  assert.equal(session.combat!.skeleton.hearts, 9, 'held key cannot hit every frame')
  tick(session, .45, { ...IDLE, attack: true }); assert.equal(session.combat!.skeleton.hearts, 3)
  tick(session, .45, { ...IDLE, attack: true }); assert.equal(session.combat!.skeleton.hearts, 0)
  const shots = session.combat!.nextArrowId
  tick(session, 2); assert.equal(session.combat!.nextArrowId, shots, 'dead skeleton stops shooting')
})

test('swords cannot hit through solid cover', () => {
  const session = running(); session.runs[0]!.state.player.x = 7
  session.level.blocks.push({ id: 'cover', x: 7.65, y: 7, width: .2, height: 2, solid: true, kind: 'stone' })
  tick(session, .91, { ...IDLE, attack: true })
  assert.equal(session.combat!.skeleton.hearts, 15)
})

test('bonus flag stays locked until the skeleton is defeated', () => {
  const session = running(), state = session.runs[0]!.state
  state.player.x = 18.7
  tick(session, STEP); assert.equal(state.status, 'playing')
  session.combat!.skeleton.hearts = 0
  tick(session, 2 * STEP); assert.equal(session.status, 'won')
})

test('mid-course bonus encounters are beatable from their landing using real movement and attack input', () => {
  for (const number of [8, 18, 28]) {
    const level = generateLevel(number), enemy = level.bonus!.skeleton
    const session = createSession({ ...level, spawn: { x: enemy.x - .6, y: enemy.y } }); startSession(session)
    tick(session, .08, { ...IDLE, right: true })
    tick(session, .91, { ...IDLE, attack: true })
    assert.equal(session.combat!.skeleton.hearts, 0, `bonus ${number}`)
    assert.equal(session.runs[0]!.state.combat!.hearts, 20)
    assert.equal(session.status, 'playing')
  }
})

test('K and F attack independently in duo, either attacks in solo, and quick taps are retained', () => {
  const duo = new KeyboardControls('duo')
  duo.press('KeyK'); duo.release('KeyK'); duo.press('KeyF')
  assert.equal(duo.inputs().steve!.attack, true)
  assert.equal(duo.inputs().alex!.attack, true)
  assert.equal(duo.inputs().steve!.attack, undefined)
  duo.clear(); assert.equal(duo.inputs().alex!.attack, undefined)
  for (const key of ['KeyK', 'KeyF']) {
    const solo = new KeyboardControls('solo'); assert.equal(solo.press(key), 'steve')
    assert.equal(solo.inputs().steve!.attack, true)
  }
})

test('teamwork and PK share one skeleton without swords damaging the other player', () => {
  for (const rule of ['teamwork', 'pk'] as const) {
    const session = running('duo', rule)
    session.runs[0]!.state.player.x = 7; session.runs[1]!.state.player.x = 7.1
    stepSession(session, { steve: { ...IDLE, attack: true }, alex: { ...IDLE, attack: true } }, STEP)
    assert.equal(session.combat!.skeleton.hearts, 3)
    assert.ok(session.runs.every(run => run.state.combat!.hearts === 20))
  }
})

test('retry restores hearts, clears arrows and knockback, while a fresh course resets the fight', () => {
  const session = running()
  session.combat!.skeleton.hearts = 9; hit(session)
  retrySession(session)
  assert.equal(session.runs[0]!.state.combat!.hearts, 20)
  assert.equal(session.runs[0]!.state.combat!.knockbackRemaining, 0)
  assert.equal(session.combat!.arrows.length, 0)
  assert.equal(session.combat!.skeleton.hearts, 9)
  assert.equal(createSession(session.level).combat!.skeleton.hearts, 15)
})

test('paused combat freezes and duo arrow deaths respawn independently with full hearts', () => {
  const session = running('duo'), steve = session.runs[0]!
  session.combat!.skeleton.shootIn = 100
  for (let n = 0; n < 8; n++) hit(session)
  assert.equal(steve.state.status, 'dead'); assert.equal(steve.deaths, 1)
  assert.equal(session.status, 'playing'); assert.equal(session.runs[1]!.state.combat!.hearts, 20)
  session.status = 'paused'; const frozen = structuredClone(session)
  stepSession(session, { steve: { ...IDLE, attack: true } }, 2); assert.deepEqual(session, frozen)
  startSession(session); tick(session, .8)
  assert.equal(steve.state.status, 'playing'); assert.equal(steve.state.combat!.hearts, COMBAT.playerHearts)
})
