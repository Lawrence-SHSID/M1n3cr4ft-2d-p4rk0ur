import assert from 'node:assert/strict'
import test from 'node:test'
import { clone, compileLevel, isCustomLevel, newLevel, playabilityIssues } from '../src/editor/levels'
import { deleteObjectAt, moveObject, objectAt, oneBlockLadders, selectionBounds } from '../src/editor/objects'
import { createGame, startGame, stepGame } from '../src/game/physics'

test('moving a slab snaps to the grid, keeps its motion and never mutates the drag snapshot', () => {
  const d = newLevel(), motion = { axis: 'y' as const, range: 1.5, speed: 1, phase: 0 }
  d.blocks.push({ id: 'slab', x: 5, y: 9, kind: 'stone', solid: true, width: 2, height: .5, motion })
  const before = clone(d), s = objectAt(d, { x: 5.3, y: 9.2 })!
  assert.equal(s.kind, 'block')
  const moved = moveObject(d, s, 2.2, -1.8).level, b = moved.blocks.find(b => b.id === 'slab')!
  assert.deepEqual([b.x, b.y, b.width, b.height], [7, 7, 2, .5]); assert.deepEqual(b.motion, motion)
  assert.deepEqual(d, before)
  const edge = moveObject(d, s, 100, -100).level.blocks.find(b => b.id === 'slab')!
  assert.equal(edge.x, 22); assert.equal(edge.y, 0)
  assert.equal(isCustomLevel(moved), true)
})
test('selecting any tree part moves or deletes the whole tree and leaves nearby terrain alone', () => {
  const d = newLevel()
  for (const [x,y,kind] of [[3,7,'wood'],[3,8,'wood'],[2,6,'leaf'],[3,6,'leaf'],[4,6,'leaf']] as const)
    d.blocks.push({ id: `tree/oak/${x}/${y}`, x, y, kind, solid: false })
  const s = objectAt(d, { x: 3.3, y: 7.3 })!
  assert.equal(s.kind, 'tree'); assert.equal(s.keys.length, 5)
  const moved = moveObject(d, s, -100, -100).level
  assert.deepEqual(selectionBounds(moved, s), { x: 0, y: 0, width: 3, height: 3 })
  assert.equal(moved.blocks.find(b => b.id === 'grass-3')!.x, 3)
  const deleted = deleteObjectAt(d, { x: 2.3, y: 6.3 })
  assert.equal(deleted.blocks.filter(b => b.id.startsWith('tree/')).length, 0)
  assert.deepEqual(deleted.blocks, newLevel().blocks)
})
test('a connected drawing moves as one shape on a quarter-block grid and pixels erase independently', () => {
  const d = newLevel()
  d.paint = [{ x: 12, y: 5, color: '#ff4444', lethal: true }, { x: 12.25, y: 5.25, color: '#ff4444', lethal: true },
    { x: 12.5, y: 5.25, color: '#ff4444', lethal: true }, { x: 15, y: 5, color: '#ff4444', lethal: true }]
  const s = objectAt(d, { x: 12.1, y: 5.1 })!
  assert.equal(s.keys.length, 3)
  const moved = moveObject(d, s, 1.1, -.6)
  assert.deepEqual(moved.level.paint.slice(-3).map(c => [c.x,c.y]), [[13,4.5],[13.25,4.75],[13.5,4.75]])
  assert.equal(moved.selection.keys.length, 3); assert.equal(moved.level.paint[0]!.x, 15)
  const erased = deleteObjectAt(d, { x: 12.1, y: 5.1 })
  assert.equal(erased.paint.length, 3); assert.equal(d.paint.length, 4)
})
test('ladders, spikes, checkpoints and both player markers can all be selected and moved', () => {
  const d = newLevel(); d.ladders.push({ id: 'l', x: 8, y: 8, height: 1 })
  d.spikes.push({ x: 7, y: 10 }); d.checkpoints.push({ id: 'cp', x: 10.25, y: 10 })
  for (const [point, kind] of [[{x:8.4,y:8.5},'ladder'],[{x:7.5,y:9.8},'spike'],[{x:10.4,y:9},'checkpoint'],
    [{x:1.2,y:9},'spawn'],[{x:23.2,y:9},'flag']] as const) {
    const s = objectAt(d, point)!; assert.equal(s.kind, kind)
    const before = selectionBounds(d, s)!, moved = moveObject(d, s, -1, -1), after = selectionBounds(moved.level, moved.selection)!
    assert.ok(Math.abs(after.x - before.x + 1) < 1e-7); assert.ok(Math.abs(after.y - before.y + 1) < 1e-7); assert.equal(isCustomLevel(moved.level), true)
  }
})
test('deleting an overlapping ladder removes just that object, not the block underneath', () => {
  const d = newLevel(); d.ladders.push({ id: 'l', x: 3, y: 10, height: 1 })
  const erased = deleteObjectAt(d, { x: 3.3, y: 10.3 })
  assert.equal(erased.ladders.length, 0); assert.equal(erased.blocks.length, d.blocks.length)
  assert.deepEqual(deleteObjectAt(d, { x: 6, y: 2 }), d)
})
test('deleting start or finish remains saveable but gives a clear test-level warning', () => {
  const d = newLevel(), erased = deleteObjectAt(deleteObjectAt(d, { x: 1.2, y: 9 }), { x: 23.2, y: 9 })
  assert.equal(erased.spawnPlaced, false); assert.equal(erased.flagPlaced, false); assert.equal(isCustomLevel(erased), true)
  assert.ok(playabilityIssues(erased).some(s => s.startsWith('Place a Start')))
  assert.ok(playabilityIssues(erased).some(s => s.startsWith('Place a Finish')))
})
test('old ladders split into one-block tiles and stacked tiles climb continuously in both directions', () => {
  const d = newLevel(); d.ladders = [{ id: 'old', x: 1, y: 6, height: 4 }]
  const edited = oneBlockLadders(d)
  assert.deepEqual(edited.ladders.map(l => [l.y, l.height]), [[6,1],[7,1],[8,1],[9,1]])
  assert.equal(new Set(edited.ladders.map(l => l.id)).size, 4); assert.equal(d.ladders[0]!.height, 4)
  const game = createGame(compileLevel(edited)); startGame(game)
  const idle = { left: false, right: false, jump: false }
  stepGame(game, { ...idle, jump: true }, 1)
  assert.ok(Math.abs(game.player.y + game.player.height - 7) < 1e-7)
  stepGame(game, { ...idle, sneak: true }, 1)
  assert.ok(Math.abs(game.player.y + game.player.height - 10) < 1e-7)
  assert.equal(game.status, 'playing')
})
