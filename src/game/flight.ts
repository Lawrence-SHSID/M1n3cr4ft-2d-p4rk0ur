import type { Block, GameState, Input, Spike } from '../../shared/types'

export const FLIGHT = Object.freeze({
  playerWidth: 1.1,
  playerHeight: 0.6,
  speed: 5,
  boostSpeed: 8,
  gravity: 6,
  liftAcceleration: 8,
  maxUpSpeed: 4,
  maxDownSpeed: 4,
})

const EPSILON = 1e-7
const MAX_STEP = 1 / 120
type Rectangle = { x: number; y: number; width: number; height: number }
type Point = { x: number; y: number }

/** Flight uses a horizontal body: hold jump to climb, release to descend, right to boost. */
export function stepFlight(state: GameState, input: Input, dt: number): void {
  if (state.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return
  let remaining = dt
  while (remaining > EPSILON && state.status === 'playing') {
    const step = Math.min(remaining, MAX_STEP)
    advance(state, input, step)
    remaining -= step
  }
}

function advance(state: GameState, input: Input, dt: number): void {
  const player = state.player
  player.width = FLIGHT.playerWidth
  player.height = FLIGHT.playerHeight
  player.grounded = false
  player.groundKind = null
  player.groundId = null
  player.sneaking = false
  player.sprinting = false
  player.facing = 1
  state.coyote = 0
  state.jumpBuffer = 0
  state.jumpWasPressed = input.jump

  if (hitHazard(state)) return

  const oldVy = Math.max(-FLIGHT.maxUpSpeed, Math.min(FLIGHT.maxDownSpeed, player.vy))
  const acceleration = input.jump ? -FLIGHT.liftAcceleration : FLIGHT.gravity
  player.vy = Math.max(-FLIGHT.maxUpSpeed, Math.min(FLIGHT.maxDownSpeed, oldVy + acceleration * dt))
  player.vx = input.right ? FLIGHT.boostSpeed : FLIGHT.speed
  player.x += player.vx * dt
  player.y += (oldVy + player.vy) * 0.5 * dt
  player.walkTime += dt
  state.time += dt
  state.elapsed += dt

  if (hitHazard(state)) return
  // The end is open across the flight corridor, independent of the flag's drawing height.
  if (player.x + player.width >= state.level.flag.x - EPSILON) state.status = 'won'
}

function hitHazard(state: GameState): boolean {
  const player = state.player
  if (state.level.spikes.some(spike => touchesSpikes(player, spike))) {
    state.status = 'dead'
    state.deathReason = 'spike'
    return true
  }

  const bounds = state.level.flight ?? { ceiling: 0, floor: 16 }
  if (player.y <= bounds.ceiling + EPSILON || player.y + player.height >= bounds.floor - EPSILON
    || state.level.blocks.some(block => block.solid && rectanglesTouch(player, positionedBlock(block, state.time)))) {
    state.status = 'dead'
    state.deathReason = 'collision'
    return true
  }
  return false
}

function positionedBlock(block: Block, time: number): Rectangle {
  const rectangle = { x: block.x, y: block.y, width: block.width ?? 1, height: block.height ?? 1 }
  if (block.motion) rectangle[block.motion.axis] += Math.sin(time * block.motion.speed + block.motion.phase) * block.motion.range
  return rectangle
}

function rectanglesTouch(a: Rectangle, b: Rectangle): boolean {
  return overlap(a.x, a.x + a.width, b.x, b.x + b.width)
    && overlap(a.y, a.y + a.height, b.y, b.y + b.height)
}

function overlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMax >= bMin - EPSILON && aMin <= bMax + EPSILON
}

/** Each spike tile has three triangles, based on spike.y and 0.38 blocks tall. */
function touchesSpikes(player: Rectangle, spike: Spike): boolean {
  if (!rectanglesTouch(player, { x: spike.x + 0.08, y: spike.y - 0.38, width: 0.84, height: 0.38 })) return false
  for (let index = 0; index < 3; index += 1) {
    const left = spike.x + 0.08 + index * 0.28
    const triangle: Point[] = [
      { x: left, y: spike.y },
      { x: left + 0.14, y: spike.y - 0.38 },
      { x: left + 0.28, y: spike.y },
    ]
    if (triangleTouchesRectangle(triangle, player)) return true
  }
  return false
}

function triangleTouchesRectangle(triangle: Point[], rectangle: Rectangle): boolean {
  const corners: Point[] = [
    { x: rectangle.x, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height },
    { x: rectangle.x, y: rectangle.y + rectangle.height },
  ]
  const axes: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }]
  for (let index = 0; index < triangle.length; index += 1) {
    const start = triangle[index]!
    const end = triangle[(index + 1) % triangle.length]!
    axes.push({ x: start.y - end.y, y: end.x - start.x })
  }
  return axes.every(axis => {
    const spikeProjection = triangle.map(point => point.x * axis.x + point.y * axis.y)
    const playerProjection = corners.map(point => point.x * axis.x + point.y * axis.y)
    return overlap(Math.min(...spikeProjection), Math.max(...spikeProjection),
      Math.min(...playerProjection), Math.max(...playerProjection))
  })
}
