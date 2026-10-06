import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameStatus, Level, Player } from '../shared/types'
import { SharedCamera, type CameraFrame } from '../src/game/camera'
import { generateLevel } from '../shared/levels'

const width = 1000
const height = 600
const nominal = 64
function level(length = 120): Level {
  return { number: 1, length, name: '', subtitle: '', spawn: { x: 0.8, y: 9 }, flag: { x: length - 0.65, y: 9 }, blocks: [], spikes: [] }
}
function actor(x: number, y = 7.75, status: GameStatus = 'playing'): { player: Player; status: GameStatus } {
  return {
    status,
    player: { x, y, width: 0.48, height: 1.25, vx: 0, vy: 0, grounded: true, groundKind: 'grass', groundId: null, facing: 1, walkTime: 0, sneaking: false, sprinting: false, iceMomentum: false, climbing: false },
  }
}
function target(actors: ReturnType<typeof actor>[], map = level(), w = width, h = height): CameraFrame {
  return new SharedCamera().update(map, actors, w, h, nominal, 0)
}
function settle(camera: SharedCamera, map: Level, actors: ReturnType<typeof actor>[], seconds = 6, hz = 120): CameraFrame {
  let frame = camera.update(map, actors, width, height, nominal, 0)
  for (let index = 0; index < seconds * hz; index += 1) frame = camera.update(map, actors, width, height, nominal, 1 / hz)
  return frame
}
function isFramed(frame: CameraFrame, player: Player, w = width, h = height): boolean {
  const left = frame.originX + player.x * frame.tile
  const right = left + player.width * frame.tile
  const top = frame.originY + player.y * frame.tile
  const bottom = top + player.height * frame.tile
  return left >= -1e-6 && right <= w + 1e-6 && top >= -1e-6 && bottom <= h + 1e-6
}

test('close actors zoom in and every increasing separation reduces target scale', () => {
  let previous = Infinity
  for (const distance of [0, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]) {
    const frame = target([actor(40), actor(40 + distance)])
    assert.ok(frame.tile < previous)
    assert.ok(frame.tile <= nominal * 1.1)
    previous = frame.tile
  }
  assert.equal(target([actor(40), actor(40)]).tile, nominal * 1.1)
})

test('ordinary zoom out and in move through intermediate scales', () => {
  const map = level()
  const close = [actor(40), actor(41)]
  const far = [actor(40), actor(60)]
  const camera = new SharedCamera()
  const closeFrame = camera.update(map, close, width, height, nominal, 0)
  const farTarget = target(far, map)
  const intermediateOut = camera.update(map, far, width, height, nominal, 1 / 60)
  assert.ok(intermediateOut.tile < closeFrame.tile)
  assert.ok(intermediateOut.tile > farTarget.tile)
  const settledFar = settle(camera, map, far)
  assert.ok(Math.abs(settledFar.tile - farTarget.tile) < 1e-7)
  const intermediateIn = camera.update(map, close, width, height, nominal, 1 / 60)
  assert.ok(intermediateIn.tile > settledFar.tile)
  assert.ok(intermediateIn.tile < closeFrame.tile)
})

test('both horizontally separated subjects are fully onscreen after settling', () => {
  const map = level()
  const camera = new SharedCamera()
  camera.update(map, [actor(2), actor(3)], width, height, nominal, 0)
  const subjects = [actor(8), actor(104)]
  const frame = settle(camera, map, subjects)
  assert.ok(subjects.every(subject => isFramed(frame, subject.player)))
  const visible = width / frame.tile
  assert.ok(visible >= 104.48 - 8 + 6 - 1e-6)
})

test('a slime-height vertical separation keeps both players and tree/ground context visible', () => {
  const subjects = [actor(40, 2.75), actor(43, 7.75)]
  const frame = target(subjects)
  assert.ok(subjects.every(subject => isFramed(frame, subject.player)))
  const upper = frame.originY + (2.75 - 3) * frame.tile
  const lower = frame.originY + (7.75 + 1.25 + 2) * frame.tile
  assert.ok(upper >= -1e-6)
  assert.ok(lower <= height + 1e-6)
})

test('a won partner remains a camera subject while dead actors are excluded', () => {
  const active = actor(10)
  const won = actor(110, 7.75, 'won')
  const dead = actor(-500, -500, 'dead')
  const frame = target([active, won, dead])
  const withoutDead = target([active, won])
  assert.deepEqual(frame, withoutDead)
  assert.ok(isFramed(frame, active.player))
  assert.ok(isFramed(frame, won.player))
  assert.ok(frame.tile < target([active]).tile)
})

test('a predicted respawn supplied as playing contributes to shared framing', () => {
  const predicted = actor(25, 7.75, 'playing')
  const partner = actor(100)
  const frame = target([predicted, partner])
  assert.ok(isFramed(frame, predicted.player))
  assert.ok(isFramed(frame, partner.player))
})

test('a far respawn forecast keeps the living partner visible throughout and fits both by 0.8 seconds', () => {
  const map = level(1000)
  const live = actor(901)
  const predicted = { ...actor(0.8), predicted: true }
  for (const hz of [60, 120]) {
    const camera = new SharedCamera()
    const initial = camera.update(map, [actor(900), live], width, 520, nominal, 0)
    const desired = target([predicted, live], map, width, 520)
    let frame = initial
    for (let index = 0; index < 0.8 * hz; index += 1) {
      frame = camera.update(map, [predicted, live], width, 520, nominal, 1 / hz)
      assert.ok(isFramed(frame, live.player, width, 520), `partner cropped at ${index + 1}/${hz}`)
      if (index === 0) {
        assert.ok(frame.tile < initial.tile)
        assert.ok(frame.tile > desired.tile)
      }
    }
    assert.ok(isFramed(frame, predicted.player, width, 520), `forecast not ready at ${hz} Hz`)
    const respawned = camera.update(map, [actor(0.8), live], width, 520, nominal, 1 / hz)
    assert.ok(isFramed(respawned, live.player, width, 520))
    assert.ok(isFramed(respawned, predicted.player, width, 520))
  }
})

test('two distant death forecasts finish their pan by the respawn deadline', () => {
  const map = level(5005)
  const forecasts = [{ ...actor(20), predicted: true }, { ...actor(21), predicted: true }]
  for (const hz of [60, 120]) {
    const camera = new SharedCamera()
    camera.update(map, [actor(4900), actor(4901)], width, 520, nominal, 0)
    let frame = camera.update(map, forecasts, width, 520, nominal, 0)
    for (let index = 0; index < 0.8 * hz; index += 1) frame = camera.update(map, forecasts, width, 520, nominal, 1 / hz)
    assert.ok(forecasts.every(subject => isFramed(frame, subject.player, width, 520)), `late pan at ${hz} Hz`)
    frame = camera.update(map, [actor(20), actor(21)], width, 520, nominal, 1 / hz)
    assert.ok(forecasts.every(subject => isFramed(frame, subject.player, width, 520)))
  }
})

test('a viewport wider than the course centers the full small course', () => {
  const map = level(10)
  for (const x of [0.8, 4, 8.8]) {
    const frame = target([actor(x)], map)
    assert.ok(width / frame.tile > map.length)
    assert.ok(Math.abs(frame.originX + map.length / 2 * frame.tile - width / 2) < 1e-7)
    assert.ok(frame.originX >= 0)
    assert.ok(frame.originX + map.length * frame.tile <= width)
  }
})

test('the first course retains the red flag at its far edge', () => {
  const map = level(10)
  const frame = target([actor(0.8)], map)
  const flagRight = frame.originX + (map.flag.x + 0.63) * frame.tile
  assert.ok(flagRight < width)
  assert.ok(flagRight > 0)
})

test('flight always fits the entire corridor with margins and keeps its vertical center fixed', () => {
  const map = { ...level(200), kind: 'elytra' as const, flight: { ceiling: 1, floor: 10 } }
  const camera = new SharedCamera()
  camera.update(level(), [actor(40)], width, height, nominal, 0)
  for (const subjects of [[actor(20, 2), actor(21, 8)], [actor(20, 5), actor(160, 3)], [actor(60, 7)]]) {
    const frame = camera.update(map, subjects, width, height, nominal, 1 / 60)
    assert.ok(frame.originY + map.flight.ceiling * frame.tile >= frame.tile - 1e-7)
    assert.ok(frame.originY + map.flight.floor * frame.tile <= height - frame.tile + 1e-7)
    assert.ok(Math.abs(frame.originY + 5.5 * frame.tile - height / 2) < 1e-7)
  }
  const close = target([actor(40), actor(41)], map)
  const slightlyApart = target([actor(40), actor(42)], map)
  assert.ok(slightlyApart.tile < close.tile)
})

test('a thousand-block separation fits without a minimum tile size', () => {
  const subjects = [actor(0), actor(1000)]
  const frame = target(subjects, level(1001))
  assert.ok(frame.tile < 1)
  assert.ok(subjects.every(subject => isFramed(frame, subject.player)))
  assert.ok(Number.isFinite(frame.originX) && Number.isFinite(frame.originY))
})

test('exponential smoothing agrees at 60 Hz and 120 Hz', () => {
  const map = level()
  const from = [actor(30), actor(31)]
  const to = [actor(40, 2), actor(90, 8)]
  const frames = [60, 120].map(hz => {
    const camera = new SharedCamera()
    camera.update(map, from, width, height, nominal, 0)
    return settle(camera, map, to, 1, hz)
  })
  for (const key of ['tile', 'originX', 'originY'] as const) assert.ok(Math.abs(frames[0]![key] - frames[1]![key]) < 1e-7)
})

test('reset deterministically snaps the next update to its new subjects', () => {
  const map = level()
  const subjects = [actor(10), actor(80)]
  const camera = new SharedCamera()
  camera.update(map, [actor(2)], width, height, nominal, 0)
  camera.update(map, subjects, width, height, nominal, 1 / 60)
  camera.reset()
  assert.deepEqual(camera.update(map, subjects, width, height, nominal, 1 / 60), target(subjects, map))
})

test('empty, one-player and invalid viewport input return finite positive transforms', () => {
  const map = level()
  for (const subjects of [[], [actor(10)], [actor(4, 7.75, 'dead')]]) {
    const frame = new SharedCamera().update(map, subjects, 0, Number.NaN, 0, Number.NaN)
    assert.ok(frame.tile > 0)
    assert.ok(Object.values(frame).every(Number.isFinite))
  }
})

test('invalid durations freeze smoothing, and long frames use the sensible dt cap', () => {
  const map = level()
  const subjects = [actor(10), actor(90)]
  const camera = new SharedCamera()
  const initial = camera.update(map, [actor(40)], width, height, nominal, 0)
  for (const dt of [0, -1, Number.NaN, Infinity]) {
    assert.deepEqual(camera.update(map, subjects, width, height, nominal, dt), initial)
  }
  const capped = camera.update(map, subjects, width, height, nominal, 10)
  const other = new SharedCamera()
  other.update(map, [actor(40)], width, height, nominal, 0)
  assert.deepEqual(capped, other.update(map, subjects, width, height, nominal, 0.1))
})

test('vertical Nether camera fits bottom and summit players and prepares lower checkpoint respawns', () => {
  for (const number of [11, 19]) for (const viewportWidth of [390, 1000]) {
    const map = generateLevel(number)
    const bottom = actor(map.spawn.x, map.spawn.y - 1.25)
    const summit = actor(map.flag.x - 0.24, map.flag.y - 1.25)
    const camera = new SharedCamera()
    camera.update(map, [bottom, actor(map.spawn.x + 1, map.spawn.y - 1.25)], viewportWidth, height, nominal, 0)
    let frame = camera.update(map, [bottom, summit], viewportWidth, height, nominal, 1 / 120)
    assert.ok(isFramed(frame, bottom.player, viewportWidth, height))
    assert.ok(isFramed(frame, summit.player, viewportWidth, height))
    for (let index = 0; index < 240; index++) {
      frame = camera.update(map, [bottom, summit], viewportWidth, height, nominal, 1 / 120)
      assert.ok(isFramed(frame, bottom.player, viewportWidth, height))
      assert.ok(isFramed(frame, summit.player, viewportWidth, height))
    }
    assert.ok(viewportWidth / frame.tile > map.width!)
    assert.ok(Math.abs(frame.originX + map.width! / 2 * frame.tile - viewportWidth / 2) < 1e-7,
      'narrow vertical towers center by their actual width, not the nominal route length')
    const checkpoint = map.checkpoints![0]!
    const predicted = { ...actor(checkpoint.x, checkpoint.y - 1.25), predicted: true }
    const recovery = new SharedCamera()
    recovery.update(map, [summit], viewportWidth, height, nominal, 0)
    for (let index = 0; index < 96; index++) {
      frame = recovery.update(map, [summit, predicted], viewportWidth, height, nominal, 1 / 120)
      assert.ok(isFramed(frame, summit.player, viewportWidth, height), 'the living summit player stays visible')
    }
    assert.ok(isFramed(frame, predicted.player, viewportWidth, height), 'the saved lower-floor spawn is framed by 0.8 seconds')
    frame = recovery.update(map, [summit, actor(checkpoint.x, checkpoint.y - 1.25)], viewportWidth, height, nominal, 1 / 120)
    assert.ok(isFramed(frame, summit.player, viewportWidth, height))
    assert.ok(isFramed(frame, predicted.player, viewportWidth, height))
  }
})