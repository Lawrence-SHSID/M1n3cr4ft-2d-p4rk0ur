import assert from 'node:assert/strict'
import test from 'node:test'
import { generateLevel } from '../shared/levels'
import type { GameState, Input, Level } from '../shared/types'
import { createGame, PHYSICS, startGame, stepGame } from '../src/game/physics'
import { KeyboardControls } from '../src/game/controls'
import { createSession, retrySession, startSession, stepSession } from '../src/game/session'

const STEP = 1 / 120
const IDLE: Input = { left: false, right: false, jump: false }
const UP: Input = { ...IDLE, jump: true }
const DOWN: Input = { ...IDLE, sneak: true }
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
const feet = (state: GameState) => state.player.y + state.player.height

function ladderCourse(): Level {
  return {
    number: 11, length: 60, kind: 'parkour', theme: 'nether', name: 'Ladder test', subtitle: '',
    spawn: { x: 2.3, y: 8 }, flag: { x: 59, y: 3 },
    blocks: [
      { id: 'floor', kind: 'netherrack', x: 0, y: 8, width: 3, solid: true },
      { id: 'fortress', kind: 'nether-brick', x: 3, y: 3, width: 5, height: 6, solid: true },
    ],
    ladders: [{ id: 'ladder', x: 2.08, y: 3, width: 0.84, height: 5 }], spikes: [], checkpoints: [],
  }
}

function running(level = ladderCourse()): GameState {
  const state = createGame(level)
  startGame(state)
  return state
}

function tick(state: GameState, seconds: number, input: Input = IDLE): void {
  for (let frame = 0; frame < Math.round(seconds / STEP); frame++) stepGame(state, input, STEP)
}

test('only levels eleven through twenty use deterministic Nether themes and both supplied land materials', () => {
  for (let number = 1; number <= 30; number++) {
    const level = generateLevel(number)
    assert.equal(level.theme, number >= 11 && number <= 20 ? 'nether' : number >= 21 && number <= 25 ? 'end' : 'overworld')
    assert.deepEqual(level, generateLevel(number))
    assert.equal(level.kind, number % 10 === 0 ? 'elytra' : 'parkour')
    if (number < 11 || number > 19) {
      if (level.theme !== 'end') assert.notEqual(level.layout, 'vertical')
      continue
    }
    assert.equal(level.layout, 'vertical')
    assert.ok(level.width! >= 11 && level.width! <= 13)
    assert.ok(level.spawn.y - level.flag.y >= 10.5)
    assert.ok(level.blocks.some(block => block.kind === 'netherrack'))
    assert.ok(level.blocks.some(block => block.kind === 'nether-brick'))
    assert.ok(level.blocks.every(block => ['netherrack', 'nether-brick'].includes(block.kind)))
    assert.ok(level.ladders!.length >= 3)
    assert.equal(new Set(level.ladders!.map(ladder => ladder.id)).size, level.ladders!.length)
    for (const ladder of level.ladders!) {
      assert.ok(ladder.height > PHYSICS.normalJumpHeight)
      assert.ok(ladder.x >= 0 && ladder.x + (ladder.width ?? 0.84) <= level.width!)
      assert.ok(ladder.y + ladder.height < PHYSICS.voidY)
    }
  }
})

test('Up climbs a tall ladder, hangs on release, and Down descends without crouching or jumping', () => {
  const state = running()
  tick(state, 0.5, UP)
  close(feet(state), 6.5)
  assert.equal(state.player.climbing, true)
  assert.equal(state.player.sneaking, false)
  assert.equal(state.player.grounded, false)
  assert.equal(state.jumps, 0)
  tick(state, 1)
  close(feet(state), 6.5)
  assert.equal(state.player.vy, 0)
  tick(state, 0.5, DOWN)
  close(feet(state), 8)
  assert.equal(state.player.climbing, true)
  assert.equal(state.player.sneaking, false)
  assert.equal(state.player.height, PHYSICS.playerHeight)
  assert.equal(state.player.groundKind, 'netherrack')
  assert.equal(state.player.grounded, true)
})

test('a ladder reaches its top and lets a player step onto a brick ledge', () => {
  const state = running()
  tick(state, 2, UP)
  close(feet(state), 3)
  tick(state, 0.4, { ...IDLE, right: true })
  assert.ok(state.player.x >= 3.05)
  assert.equal(state.player.climbing, false)
  assert.equal(state.player.grounded, true)
  assert.equal(state.player.groundKind, 'nether-brick')
  assert.equal(state.jumps, 0)
})

test('sideways departure releases a ladder and gravity resumes', () => {
  const state = running()
  tick(state, 0.5, UP)
  const startFeet = feet(state)
  tick(state, 0.5, { ...IDLE, left: true })
  assert.ok(state.player.x + state.player.width < state.level.ladders![0]!.x)
  assert.equal(state.player.climbing, false)
  assert.ok(feet(state) > startFeet)
  assert.ok(state.player.vy > 0 || state.player.grounded)
})

test('climbing preserves wall and ceiling collision instead of passing through solids', () => {
  const wall = running()
  tick(wall, 0.5, UP)
  tick(wall, 0.5, { ...UP, right: true })
  close(wall.player.x + wall.player.width, 3)
  assert.equal(wall.player.climbing, true)
  assert.equal(wall.player.vx, 0)
  const level = ladderCourse()
  level.blocks.push({ id: 'roof', kind: 'nether-brick', x: 2, y: 4, width: 1, height: 0.5, solid: true })
  const ceiling = running(level)
  tick(ceiling, 2, UP)
  close(ceiling.player.y, 4.5)
  assert.equal(ceiling.player.vy, 0)
  assert.equal(ceiling.status, 'playing')
})

test('a normal jump away from ladders keeps its 1.2-block height', () => {
  const level = ladderCourse()
  level.spawn.x = 0.5
  const state = running(level)
  const initialFeet = feet(state)
  let peak = initialFeet
  for (let frame = 0; frame < 120; frame++) {
    stepGame(state, frame === 0 ? UP : IDLE, STEP)
    peak = Math.min(peak, feet(state))
  }
  assert.ok(initialFeet - peak > 1.19 && initialFeet - peak <= 1.2)
  assert.equal(state.player.climbing, false)
  assert.equal(state.jumps, 1)
})

test('Steve and Alex climb independently through their actual arrow and WASD controls', () => {
  const level = ladderCourse()
  level.spawn.x = 0.5
  level.blocks = [{ id: 'floor', kind: 'netherrack', x: 0, y: 8, width: 8, solid: true }]
  level.ladders = [
    { id: 'steve-ladder', x: 0.3, y: 3, width: 0.84, height: 5 },
    { id: 'alex-ladder', x: 1.3, y: 3, width: 0.84, height: 5 },
  ]
  const session = createSession(level, 'duo')
  startSession(session)
  const controls = new KeyboardControls('duo', true)
  const [steve, alex] = session.runs
  controls.press('ArrowUp')
  for (let frame = 0; frame < 60; frame++) stepSession(session, controls.inputs(), STEP)
  close(feet(steve!.state), 6.5)
  close(feet(alex!.state), 8)
  controls.release('ArrowUp')
  controls.press('KeyW')
  for (let frame = 0; frame < 60; frame++) stepSession(session, controls.inputs(), STEP)
  close(feet(steve!.state), 6.5)
  close(feet(alex!.state), 6.5)
  controls.release('KeyW')
  controls.press('ArrowDown')
  controls.press('KeyS')
  for (let frame = 0; frame < 20; frame++) stepSession(session, controls.inputs(), STEP)
  close(feet(steve!.state), 7)
  close(feet(alex!.state), 7)
  assert.equal(steve!.state.player.sprinting, false)
  assert.equal(alex!.state.player.sprinting, false)
  controls.clear()
  const heldFeet = session.runs.map(run => feet(run.state))
  for (let frame = 0; frame < 30; frame++) stepSession(session, controls.inputs(), STEP)
  session.runs.forEach((run, index) => close(feet(run.state), heldFeet[index]!))
  retrySession(session)
  for (const run of session.runs) {
    close(feet(run.state), 8)
    assert.equal(run.state.player.climbing, false)
    assert.equal(run.state.player.vy, 0)
    assert.equal(run.state.jumpWasPressed, false)
  }
})

// Each row reverses direction. Drive a complete session so the test also checks
// that smaller-X checkpoints save correctly as the route climbs upward.
function completeNether(number: number) {
  const session = createSession(generateLevel(number))
  startSession(session)
  const run = session.runs[0]!, state = run.state
  const checkpoints: string[] = []
  let leftSteps = 0, rightSteps = 0, climbs = 0
  const step = (input: Input) => {
    stepSession(session, { steve: input }, STEP)
    if (input.left) leftSteps++
    if (input.right) rightSteps++
    if (run.checkpoint && checkpoints.at(-1) !== run.checkpoint.id) checkpoints.push(run.checkpoint.id)
  }
  const advanceUntil = (done: () => boolean, input: (frame: number) => Input, action: string) => {
    for (let frame = 0; frame < 2400 && state.status === 'playing' && !done(); frame++) step(input(frame))
    assert.notEqual(state.status, 'dead', `Level ${number} died during ${action} at ${state.player.x},${feet(state)}`)
    assert.ok(state.status === 'won' || done(), `Level ${number} could not ${action}; stopped at ${state.player.x},${feet(state)}`)
  }
  const walkTo = (target: number) => {
    const right = target > state.player.x
    advanceUntil(() => right ? state.player.x >= target : state.player.x <= target,
      () => ({ ...IDLE, right, left: !right }), `walk to ${target}`)
  }
  const ladders = [...state.level.ladders!].sort((a, b) => b.y - a.y)
  const rows = [state.level.spawn.y, ...ladders.map(ladder => ladder.y)]
  for (let row = 0; row < rows.length && state.status === 'playing'; row++) {
    const direction = row % 2 === 0 ? 1 : -1
    const surfaces = state.level.blocks.filter(block => block.solid && !block.motion && block.y === rows[row])
      .sort((a, b) => a.x - b.x)
    const islands: { start: number; end: number }[] = []
    for (const surface of surfaces) {
      const previous = islands.at(-1)
      if (previous && previous.end === surface.x) previous.end += surface.width ?? 1
      else islands.push({ start: surface.x, end: surface.x + (surface.width ?? 1) })
    }
    if (direction < 0) islands.reverse()
    const fightOn = (island: { start: number; end: number }) => {
      const skeleton = session.combat?.skeleton
      if (!skeleton || skeleton.hearts === 0 || skeleton.x < island.start || skeleton.x >= island.end
        || Math.abs(skeleton.y + skeleton.height - rows[row]!) > 1e-7) return
      const center = skeleton.x + skeleton.width / 2
      advanceUntil(() => skeleton.hearts === 0, () => ({ ...IDLE, attack: true,
        right: state.player.x + state.player.width / 2 < center - .1,
        left: state.player.x + state.player.width / 2 > center + .1 }), 'defeat the mid-course bonus skeleton')
    }
    for (let index = 1; index < islands.length && state.status === 'playing'; index++) {
      const current = islands[index - 1]!, next = islands[index]!
      fightOn(current)
      const launch = direction > 0 ? current.end - 0.05 : current.start - state.player.width + 0.05
      const target = direction > 0 ? next.start + 0.1 : next.end - state.player.width - 0.1
      walkTo(launch)
      advanceUntil(() => (direction > 0 ? state.player.x >= target : state.player.x <= target)
          && state.player.grounded && Math.abs(feet(state) - rows[row]!) < 1e-7,
        frame => ({ ...IDLE, right: direction > 0 && state.player.x < target,
          left: direction < 0 && state.player.x > target, sprint: true, jump: frame === 0 }),
        `jump ${direction > 0 ? 'right' : 'left'} across row ${row}`)
    }
    fightOn(islands.at(-1)!)
    if (row < ladders.length && state.status === 'playing') {
      const ladder = ladders[row]!
      walkTo(ladder.x + 0.1)
      advanceUntil(() => feet(state) <= ladder.y + 1e-7, () => UP, `climb row ${row + 1}`)
      climbs++
      const entry = direction > 0 ? ladder.x - state.player.width - 0.15 : ladder.x + (ladder.width ?? 0.84) + 0.15
      walkTo(entry)
      advanceUntil(() => state.player.grounded && Math.abs(feet(state) - ladder.y) < 1e-7,
        () => IDLE, `land on row ${row + 1}`)
    } else if (state.status === 'playing') walkTo(state.level.flag.x - state.player.width / 2)
  }
  return { state, run, checkpoints, leftSteps, rightSteps, climbs }
}

for (let number = 11; number <= 19; number++) {
  test(`generated Nether level ${number} climbs a zigzag to the flag using real walking, ladders, and sprint-jumps`, () => {
    const result = completeNether(number)
    assert.equal(result.state.status, 'won')
    assert.ok(result.state.jumps >= 3)
    assert.ok(result.leftSteps > 100 && result.rightSteps > 100)
    assert.equal(result.climbs, result.state.level.ladders!.length)
    assert.ok(result.state.elapsed < 120)
    assert.equal(result.run.checkpoint?.id, result.state.level.checkpoints!.at(-1)!.id)
    assert.deepEqual(result.checkpoints, result.state.level.checkpoints!.map(checkpoint => checkpoint.id))
  })
}

test('Nether checkpoints rise along alternating sides rather than assuming increasing horizontal X', () => {
  for (let number = 11; number <= 19; number++) {
    const level = generateLevel(number)
    let previousY = level.spawn.y, previousProgress = -Infinity
    const checkpoints = level.checkpoints!
    assert.ok(checkpoints.length >= 3)
    assert.ok(checkpoints.some((checkpoint, index) => index > 0 && checkpoint.x < checkpoints[index - 1]!.x))
    for (const checkpoint of checkpoints) {
      assert.ok(checkpoint.y < previousY)
      assert.ok(checkpoint.progress! > previousProgress)
      previousY = checkpoint.y
      previousProgress = checkpoint.progress!
    }
    assert.ok(level.flag.y <= previousY)
  }
})

test('ranked checkpoints save later progress at smaller X, never regress, and retry at the latest point', () => {
  const level = ladderCourse()
  level.spawn = { x: 20, y: 8 }
  level.flag = { x: 59, y: 8 }
  level.blocks = [{ id: 'floor', kind: 'netherrack', x: 0, y: 8, width: 60, solid: true }]
  level.ladders = []
  level.checkpoints = [
    { id: 'earlier-right', x: 20, y: 8, progress: 1 },
    { id: 'later-left', x: 10, y: 8, progress: 2 },
  ]
  const session = createSession(level)
  startSession(session)
  stepSession(session, {}, STEP)
  const run = session.runs[0]!
  const checkpointId = () => run.checkpoint?.id
  assert.equal(checkpointId(), 'earlier-right')
  for (let frame = 0; frame < 500 && checkpointId() !== 'later-left'; frame++) {
    stepSession(session, { steve: { ...IDLE, left: true } }, STEP)
  }
  assert.equal(run.checkpoint?.id, 'later-left')
  for (let frame = 0; frame < 300; frame++) stepSession(session, { steve: { ...IDLE, right: true } }, STEP)
  assert.equal(run.checkpoint?.id, 'later-left')
  retrySession(session)
  close(run.state.player.x, 10)
  close(feet(run.state), 8)
  assert.equal(run.checkpoint?.id, 'later-left')
})
