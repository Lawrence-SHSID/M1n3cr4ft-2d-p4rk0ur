import assert from 'node:assert/strict'
import test from 'node:test'
import { generateEndLevel } from '../shared/end-levels'
import type { BlockKind, CharacterId, GameSession, Input, Level } from '../shared/types'
import { blockSize, PHYSICS } from '../src/game/physics'
import { createSession, retrySession, startSession, stepSession } from '../src/game/session'

const STEP = 1 / 120
const IDLE: Input = { left: false, right: false, jump: false }
const feet = (session: GameSession, id: CharacterId = 'steve') => {
  const player = session.runs.find(run => run.id === id)!.state.player
  return player.y + player.height
}

function islands(level: Level) {
  const tops = level.blocks.filter(block => block.solid
    && (block.motion || !level.blocks.some(other => other.solid && !other.motion
      && other.x === block.x && other.y < block.y))).sort((a,b) => a.x - b.x)
  const groups: { start: number; end: number; y: number; ids: string[]; moving: boolean }[] = []
  for (const block of tops) {
    const last = groups.at(-1), width = blockSize(block).width
    if (!block.motion && last && !last.moving && last.end === block.x && last.y === block.y) {
      last.end += width; last.ids.push(block.id)
    } else groups.push({ start: block.x, end: block.x + width, y: block.y, ids: [block.id], moving: Boolean(block.motion) })
  }
  return groups
}

/** Plan timings with cloned sessions, then replay only real wait/move/jump inputs. */
function completeEnd(session: GameSession, id: CharacterId = 'steve') {
  const run = session.runs.find(item => item.id === id)!, state = run.state
  const visited = new Set<string>(), materials = new Set<BlockKind>(), lifts = new Set<string>()
  const tick = (input: Input) => {
    stepSession(session, { [id]: input }, STEP)
    if (run.checkpoint) visited.add(run.checkpoint.id)
    if (state.player.grounded && state.player.groundKind) materials.add(state.player.groundKind)
    if (state.player.groundId?.includes('-lift-')) lifts.add(state.player.groundId)
    assert.notEqual(state.status, 'dead', 'End ' + session.level.number + ' died at '
      + state.player.x.toFixed(2) + ',' + feet(session,id).toFixed(2))
  }
  const clone = (source: GameSession): GameSession => ({ ...source, runs: source.runs.map(item =>
    ({ ...item, state: { ...item.state, player: { ...item.state.player } } })) })
  const route = islands(session.level)
  let currentIndex = route.findIndex(item => item.ids.includes(state.player.groundId ?? ''))
  assert.ok(currentIndex >= 0)
  for (; currentIndex < route.length - 1 && state.status === 'playing'; currentIndex++) {
    const current = route[currentIndex]!, next = route[currentIndex + 1]!
    const edge = current.end - 0.025
    for (let frame = 0; frame < 1800 && state.player.x < edge - 0.006; frame++)
      tick({ ...IDLE, right: true, sneak: true })
    assert.ok(state.player.grounded && state.player.x >= edge - 0.006, 'could not line up')
    const waiting = clone(session), target = next.start + 0.22
    let plan: { delay: number; lead: number; frames: number } | undefined
    for (let delay = 0; delay <= 1080 && !plan; delay += 8) {
      for (const lead of [0,4]) {
        const trial = clone(waiting), trialState = trial.runs.find(item => item.id === id)!.state
        for (let frame = 0; frame < 210 && trialState.status === 'playing'; frame++) {
          stepSession(trial, { [id]: { ...IDLE, right: trialState.player.x < target,
            jump: frame === lead, sprint: true } }, STEP)
          if (trialState.player.grounded && next.ids.includes(trialState.player.groundId ?? '')) {
            plan = { delay, lead, frames: frame + 1 }; break
          }
        }
        if (plan) break
      }
      if (!plan) for (let frame = 0; frame < 8; frame++) stepSession(waiting,{[id]:IDLE},STEP)
    }
    assert.ok(plan, 'End ' + session.level.number + ' cannot reach island ' + (currentIndex + 1)
      + ' from ' + state.player.x.toFixed(2) + ' at time ' + session.time.toFixed(2))
    for (let frame = 0; frame < plan.delay; frame++) tick(IDLE)
    for (let frame = 0; frame < plan.frames; frame++) tick({ ...IDLE,
      right: state.player.x < target, jump: frame === plan.lead, sprint: true })
    assert.ok(next.ids.includes(state.player.groundId ?? ''), 'planned landing did not replay')
  }
  for (let frame = 0; frame < 1800 && state.status === 'playing'; frame++) tick({ ...IDLE, right: true })
  assert.equal(state.status,'won')
  return { visited, materials, lifts }
}
test('five authored End courses keep bounded distinct layouts and safe recovery islands', () => {
  const signatures = new Set<string>()
  for (let number = 21; number <= 25; number++) {
    const level = generateEndLevel(number)
    assert.equal(level.theme, 'end')
    assert.equal(level.kind, 'parkour')
    assert.equal(level.length, 10 + (number - 1) * 5)
    assert.ok(level.blocks.every(block => block.x >= 0 && block.x + (block.width ?? 1) <= level.length))
    assert.equal(new Set(level.blocks.map(block => block.id)).size, level.blocks.length)
    assert.deepEqual(level, generateEndLevel(number))
    const route = islands(level)
    signatures.add(JSON.stringify(route))
    assert.ok(route.filter(island => island.end - island.start <= 1.5).length >= 4)
    assert.ok(route.slice(1).filter((item,index) => item.start - route[index]!.end === 4).length >= 4)
    assert.ok(route.slice(1).every((item,index) => item.start - route[index]!.end >= 3.5))
    assert.ok(route.filter(item => item.moving).length >= 3)
    assert.ok(level.blocks.filter(block => block.motion).every(block => block.kind === 'end-stone'
      && block.height === 0.5 && block.motion!.axis === 'y'))
    assert.ok(level.blocks.some(block => block.kind === 'slime'))
    assert.ok(level.blocks.some(block => block.kind === 'end-stone'))
    assert.ok(level.blocks.some(block => block.kind === 'purpur'))
    assert.equal(route.at(-1)!.end, level.length)
    assert.equal(route.at(-1)!.y, level.flag.y)
    assert.ok(level.checkpoints!.length >= 3)
    for (const checkpoint of level.checkpoints!) {
      const landing = route.find(item => item.start <= checkpoint.x && item.end > checkpoint.x)!
      assert.ok(landing.end - landing.start >= 3)
      assert.ok(checkpoint.x + PHYSICS.playerWidth < landing.end)
      assert.equal(checkpoint.y, landing.y)
      assert.ok(!level.blocks.some(block => block.kind === 'slime'
        && block.x <= checkpoint.x && block.x + 1 > checkpoint.x && block.y === checkpoint.y))
    }
  }
  assert.equal(signatures.size, 5)
})

test('End generator rejects requests outside the five-course chapter', () => {
  for (const number of [20,26,21.5,NaN,Infinity]) assert.throws(() => generateEndLevel(number), RangeError)
})

for (let number = 21; number <= 25; number++) {
  test('End course ' + number + ' finishes with real sprint/slime jumps and saves every checkpoint', () => {
    const session = createSession(generateEndLevel(number))
    startSession(session)
    const result = completeEnd(session)
    assert.equal(session.status, 'won')
    assert.ok(session.runs[0]!.state.jumps >= 10)
    assert.deepEqual(result.visited, new Set(session.level.checkpoints!.map(point => point.id)))
    assert.deepEqual(result.materials, new Set(['end-stone','purpur','slime']))
    assert.equal(result.lifts.size, session.level.blocks.filter(block => block.motion).length)
  })
}

test('every End checkpoint supports a fresh real-input finish after retry', () => {
  for (let number = 21; number <= 25; number++) {
    const level = generateEndLevel(number)
    for (const checkpoint of level.checkpoints!) {
      const session = createSession(level)
      // A saved marker is session data; retry itself places the fresh body.
      session.runs[0]!.checkpoint = checkpoint
      retrySession(session)
      assert.equal(session.runs[0]!.state.player.grounded, true)
      assert.equal(session.runs[0]!.state.player.vx, 0)
      completeEnd(session)
      assert.equal(session.status, 'won', checkpoint.id)
    }
  }
})
