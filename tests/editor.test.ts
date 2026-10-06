import assert from 'node:assert/strict'
import test from 'node:test'
import { clone, compileLevel, isCustomLevel, LIBRARY_KEY, newLevel, playabilityIssues, readLibrary, saveLibrary } from '../src/editor/levels'
import { blockPosition, createGame, startGame, stepGame } from '../src/game/physics'
import { createSession, retrySession, startSession, stepSession } from '../src/game/session'

const idle = { left: false, right: false, jump: false }
function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
test('saved levels survive a library round trip without sharing editable references', () => {
  const store = storage(), draft = newLevel()
  draft.name = 'My own Nether'; draft.theme = 'nether'
  draft.blocks.push({ id: 'moving', x: 5, y: 9, kind: 'stone', solid: true, width: 2, height: .5, motion: { axis: 'y', range: 1, speed: 1.5, phase: 0 } })
  draft.ladders.push({ id: 'ladder', x: 9, y: 6, height: 4 })
  draft.paint.push({ x: 12, y: 9, color: '#cc3344', lethal: true })
  saveLibrary(store, [draft])
  const loaded = readLibrary(store)
  assert.equal(loaded.error, ''); assert.deepEqual(loaded.levels, [draft])
  loaded.levels[0]!.blocks[0]!.x = 3
  assert.equal(draft.blocks[0]!.x, 0)
  assert.equal(readLibrary(store).levels[0]!.blocks[0]!.x, 0)
})
test('bad saved data stays intact and never reaches physics', () => {
  const store = storage(), raw = '{broken'
  store.setItem(LIBRARY_KEY, raw)
  assert.equal(readLibrary(store).levels.length, 0); assert.ok(readLibrary(store).error)
  assert.equal(store.getItem(LIBRARY_KEY), raw)
  const draft = newLevel()
  for (const mutate of [(d: typeof draft) => { d.spawn.x = NaN }, (d: typeof draft) => { d.blocks[0]!.motion = { axis: 'x', range: -1, speed: 1, phase: 0 } },
    (d: typeof draft) => { d.paint.push({ x: .1, y: 5, color: '#ff4444', lethal: true }) },
    (d: typeof draft) => { d.ladders.push({ id: 'bad', x: 2, y: 13, height: 5 }) }]) {
    const bad = clone(draft); mutate(bad); assert.equal(isCustomLevel(bad), false); assert.throws(() => compileLevel(bad))
  }
})
test('storage failures are reported and existing saves are not overwritten', () => {
  const draft = newLevel(), store = storage(); saveLibrary(store, [draft])
  const old = store.getItem(LIBRARY_KEY)
  assert.throws(() => saveLibrary({ setItem() { throw new Error('Quota exceeded') } }, [draft]), /Quota/)
  assert.equal(store.getItem(LIBRARY_KEY), old)
})
test('drawn pixels compile into exact colored solid and lethal shapes, preserving holes', () => {
  const draft = newLevel()
  draft.paint = [{ x: 5, y: 10, color: '#ff4455', lethal: true }, { x: 5.25, y: 10, color: '#ff4455', lethal: true },
    { x: 5.75, y: 10, color: '#ff4455', lethal: true }, { x: 6, y: 10, color: '#4477ff', lethal: false }]
  const level = compileLevel(draft)
  assert.deepEqual(level.hazards?.map(h => [h.x, h.width]), [[5, .5], [5.75, .25]])
  const solid = level.blocks.find(b => b.color)
  assert.equal(solid?.color, '#4477ff'); assert.equal(solid?.solid, true); assert.equal(solid?.width, .25)
  const game = createGame(level); game.player.x = 5.1; game.player.y = 9.8; game.player.grounded = false; startGame(game)
  stepGame(game, idle, 1 / 120); assert.equal(game.status, 'dead'); assert.equal(game.deathReason, 'spike')
  assert.equal(draft.blocks.some(b => b.color), false, 'compiling must not mutate the editable level')
})
test('a player can stand on a drawn solid obstacle without triggering a hazard', () => {
  const draft = newLevel(); draft.paint = [{ x: 5, y: 10, color: '#4477ff', lethal: false }, { x: 5.25, y: 10, color: '#4477ff', lethal: false }]
  draft.spawn = { x: 5, y: 10 }
  const game = createGame(compileLevel(draft)); assert.equal(game.player.grounded, true); startGame(game)
  stepGame(game, idle, .1); assert.equal(game.status, 'playing'); assert.equal(game.player.y + game.player.height, 10)
})
test('slab motion and ladder climbing work in a custom course', () => {
  const draft = newLevel()
  draft.blocks.push({ id: 'moving', x: 5, y: 9, kind: 'stone', solid: true, width: 2, height: .5, motion: { axis: 'y', range: 1, speed: 1, phase: 0 } })
  draft.ladders.push({ id: 'climb', x: 1, y: 6, height: 4 })
  const level = compileLevel(draft)
  assert.equal(blockPosition(level.blocks.find(b => b.id === 'moving')!, Math.PI / 2).y, 10)
  const game = createGame(level); startGame(game); stepGame(game, { ...idle, jump: true }, .5)
  assert.equal(game.player.climbing, true); assert.ok(game.player.y < 8)
})
test('custom checkpoints work in short courses and retry preserves them', () => {
  const draft = newLevel(); draft.checkpoints = [{ id: 'cp', x: 3, y: 10 }]
  const session = createSession(compileLevel(draft)); startSession(session)
  stepSession(session, { steve: { ...idle, right: true } }, .48)
  assert.equal(session.runs[0]!.checkpoint?.id, 'cp')
  session.runs[0]!.state.player.x = 8; retrySession(session)
  assert.equal(session.runs[0]!.state.player.x, 3)
})
test('the starter course is playable with ordinary inputs and custom wins do not need a generated level', () => {
  const level = compileLevel(newLevel()); assert.deepEqual(playabilityIssues(newLevel()), [])
  const game = createGame(level); startGame(game)
  for (let i = 0; i < 600 && game.status === 'playing'; i++) {
    const rightEdge = [5, 11, 18].find(edge => edge > game.player.x)
    const jump = game.player.grounded && rightEdge !== undefined && rightEdge - game.player.x < .5
    stepGame(game, { ...idle, right: true, sprint: true, jump }, 1 / 120)
  }
  assert.equal(game.status, 'won')
})
test('unsafe start and finish positions give actionable editor messages', () => {
  const draft = newLevel(); draft.spawn = { x: 5.5, y: 10 }; draft.flag = { x: 21, y: 11 }
  assert.ok(playabilityIssues(draft).some(s => s.startsWith('Start needs a solid')))
  assert.ok(playabilityIssues(draft).some(s => s.startsWith('Finish needs room')))
  draft.spawn = { x: 1, y: 10 }; draft.spikes.push({ x: 1, y: 10 })
  assert.ok(playabilityIssues(draft).some(s => s.startsWith('Start is touching')))
  draft.spikes = []; draft.flag = { ...draft.spawn }
  assert.ok(playabilityIssues(draft).some(s => s.includes('one block apart')))
})
