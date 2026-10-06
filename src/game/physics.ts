import type { Block, GameState, Input, Level } from '../../shared/types'
import { FLIGHT, stepFlight } from './flight'

export const PHYSICS = Object.freeze({
  gravity: 28,
  speed: 4.3,
  sprintSpeed: 6.5,
  sneakSpeed: 1.5,
  iceAcceleration: 14,
  iceDrag: 4,
  iceAirAcceleration: 4,
  climbSpeed: 3,
  normalJumpHeight: 1.2,
  slimeJumpHeight: 5,
  playerWidth: 0.48,
  playerHeight: 1.25,
  crouchHeight: 1,
  coyoteTime: 0.1,
  jumpBufferTime: 0.12,
  voidY: 16,
})

const EPSILON = 1e-7
const MAX_STEP = 1 / 120
type PositionedBlock = { block: Block; x: number; y: number; width: number; height: number; oldX: number; oldY: number }

export function blockSize(block: Block): { width: number; height: number } {
  return { width: block.width ?? 1, height: block.height ?? 1 }
}

/** World units are blocks, with positive y downward. Motion.range is its amplitude. */
export function blockPosition(block: Block, time: number): { x: number; y: number } {
  const position = { x: block.x, y: block.y }
  if (block.motion) {
    position[block.motion.axis] += Math.sin(time * block.motion.speed + block.motion.phase) * block.motion.range
  }
  return position
}

/** player.x/y are its top-left; spawn.x is its left edge and spawn.y is its feet. */
export function createGame(level: Level): GameState {
  const flying = level.kind === 'elytra'
  const width = flying ? FLIGHT.playerWidth : PHYSICS.playerWidth
  const height = flying ? FLIGHT.playerHeight : PHYSICS.playerHeight
  const state: GameState = {
    level,
    player: {
      x: level.spawn.x, y: level.spawn.y - height,
      vx: flying ? FLIGHT.speed : 0, vy: 0, width, height,
      grounded: false, groundKind: null, groundId: null, facing: 1, walkTime: 0,
      sneaking: false, sprinting: false, iceMomentum: false, climbing: false,
    },
    status: 'ready', time: 0, elapsed: 0, deathReason: null, jumps: 0,
    coyote: 0, jumpBuffer: 0, jumpWasPressed: false,
  }
  if (flying) return state
  const ground = level.blocks.find(block => {
    if (!block.solid) return false
    const position = blockPosition(block, 0)
    return overlaps(state.player.x, state.player.x + state.player.width, position.x, position.x + blockSize(block).width)
      && Math.abs(level.spawn.y - position.y) < EPSILON
  })
  if (ground) {
    state.player.grounded = true
    state.player.groundKind = ground.kind
    state.player.iceMomentum = ground.kind === 'ice'
    state.player.groundId = ground.id
    state.coyote = PHYSICS.coyoteTime
  }
  return state
}

export function startGame(state: GameState): void {
  if (state.status === 'ready' || state.status === 'paused') state.status = 'playing'
}

/** Splitting larger render intervals keeps collisions consistent with the fixed-step loop. */
export function stepGame(state: GameState, input: Input, dt: number): void {
  if (state.level.kind === 'elytra') {
    stepFlight(state, input, dt)
    return
  }
  if (state.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return
  let remaining = dt
  while (remaining > EPSILON && state.status === 'playing') {
    const step = Math.min(remaining, MAX_STEP)
    advance(state, input, step)
    remaining -= step
  }
}

function overlaps(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMax > bMin + EPSILON && aMin < bMax - EPSILON
}

function advance(state: GameState, input: Input, dt: number): void {
  const player = state.player
  const wasGrounded = player.grounded
  const supportingId = player.groundId
  const nextTime = state.time + dt
  const blocks: PositionedBlock[] = state.level.blocks.filter(block => block.solid).map(block => {
    const old = blockPosition(block, state.time)
    return { block, ...blockPosition(block, nextTime), ...blockSize(block), oldX: old.x, oldY: old.y }
  })

  state.jumpBuffer = Math.max(0, state.jumpBuffer - dt)
  state.coyote = wasGrounded ? PHYSICS.coyoteTime : Math.max(0, state.coyote - dt)
  if (input.jump && !state.jumpWasPressed) state.jumpBuffer = PHYSICS.jumpBufferTime
  state.jumpWasPressed = input.jump

  // Riders follow a platform before their own movement, including vertical motion.
  const supporting = wasGrounded ? blocks.find(item => item.block.id === supportingId) : undefined
  if (supporting) {
    player.x += supporting.x - supporting.oldX
    player.y += supporting.y - supporting.oldY
  }

  const ladder = state.level.ladders?.find(item =>
    overlaps(player.x, player.x + player.width, item.x, item.x + (item.width ?? 0.84))
      && player.y <= item.y + item.height + EPSILON
      && player.y + player.height >= item.y - EPSILON)
  player.climbing = Boolean(ladder && (player.climbing || input.jump || input.sneak))

  // Crouching changes the hitbox around the feet. Releasing crouch only stands
  // when the larger body fits, so a low slab ceiling cannot trap the player.
  const feet = player.y + player.height
  const standingY = feet - PHYSICS.playerHeight
  const canStand = !blocks.some(item =>
    overlaps(player.x, player.x + player.width, item.x, item.x + item.width)
      && overlaps(standingY, feet, item.y, item.y + item.height))
  player.sneaking = (!player.climbing && Boolean(input.sneak)) || !canStand
  if (!canStand) player.climbing = false
  player.height = player.sneaking ? PHYSICS.crouchHeight : PHYSICS.playerHeight
  player.y = feet - player.height

  if (player.climbing) {
    state.jumpBuffer = 0
    state.coyote = 0
    player.iceMomentum = false
  }
  if (!player.climbing && state.jumpBuffer > 0 && (wasGrounded || state.coyote > 0)) {
    const jumpHeight = player.groundKind === 'slime' ? PHYSICS.slimeJumpHeight : PHYSICS.normalJumpHeight
    player.vy = -Math.sqrt(2 * PHYSICS.gravity * jumpHeight)
    player.grounded = false
    player.groundId = null
    state.coyote = 0
    state.jumpBuffer = 0
    state.jumps += 1
  }

  const direction = Number(input.right) - Number(input.left)
  player.sprinting = Boolean(input.sprint) && !player.sneaking && !player.climbing && direction !== 0
  const speed = player.climbing ? PHYSICS.climbSpeed : player.sneaking ? PHYSICS.sneakSpeed : player.sprinting ? PHYSICS.sprintSpeed : PHYSICS.speed
  // Ice carries momentum through release and jumps. Other surfaces restore grip.
  // Crouching brakes immediately and retains the normal edge protection.
  if (wasGrounded && !player.climbing) player.iceMomentum = supporting?.block.kind === 'ice'
  if (player.iceMomentum && !player.sneaking) {
    const acceleration = direction === 0
      ? player.grounded ? PHYSICS.iceDrag : 0
      : player.grounded ? PHYSICS.iceAcceleration : PHYSICS.iceAirAcceleration
    const difference = direction * speed - player.vx
    player.vx += Math.sign(difference) * Math.min(Math.abs(difference), acceleration * dt)
  } else player.vx = direction * speed
  if (direction !== 0) player.facing = direction > 0 ? 1 : -1
  const previousX = player.x
  player.x += player.vx * dt

  if (player.sneaking && player.grounded) {
    const protectedX = protectEdge(previousX, player.x, player.width, player.y + player.height, blocks)
    if (Math.abs(protectedX - player.x) > EPSILON) player.vx = 0
    player.x = protectedX
  }

  // Resolve side contacts independently of vertical motion; standing on a top is not a side contact.
  for (const item of blocks) {
    if (!overlaps(player.y, player.y + player.height, item.y, item.y + item.height)
      || !overlaps(player.x, player.x + player.width, item.x, item.x + item.width)) continue
    if (previousX + player.width <= item.oldX + EPSILON || player.vx > 0) {
      player.x = item.x - player.width
    } else if (previousX >= item.oldX + item.width - EPSILON || player.vx < 0) {
      player.x = item.x + item.width
    }
    player.vx = 0
  }
  if (Math.abs(player.x - previousX) > EPSILON && direction !== 0) player.walkTime += dt

  const previousY = player.y
  const previousFeet = previousY + player.height
  // Analytical displacement avoids adding extra jump height from Euler integration.
  let verticalDistance: number
  if (player.climbing && ladder) {
    player.vy = (Number(Boolean(input.sneak)) - Number(input.jump)) * PHYSICS.climbSpeed
    const target = Math.max(ladder.y - player.height,
      Math.min(ladder.y + ladder.height - player.height, player.y + player.vy * dt))
    verticalDistance = target - player.y
    if (Math.abs(verticalDistance) < EPSILON) player.vy = 0
    else player.walkTime += dt
  } else {
    verticalDistance = player.vy * dt + 0.5 * PHYSICS.gravity * dt * dt
    player.vy += PHYSICS.gravity * dt
  }
  player.y += verticalDistance
  player.grounded = false
  player.groundId = null

  let landing: PositionedBlock | undefined
  let ceiling: PositionedBlock | undefined
  for (const item of blocks) {
    if (!overlaps(player.x, player.x + player.width, item.x, item.x + item.width)) continue
    const previousTop = item.block.id === supportingId && supporting ? item.y : item.oldY
    if (verticalDistance >= 0
      && previousFeet <= previousTop + EPSILON
      && player.y + player.height >= item.y - EPSILON) {
      if (!landing || item.y < landing.y) landing = item
    } else if (verticalDistance < 0
      && previousY >= item.oldY + item.height - EPSILON
      && player.y <= item.y + item.height + EPSILON) {
      if (!ceiling || item.y + item.height > ceiling.y + ceiling.height) ceiling = item
    }
  }
  if (landing) {
    player.y = landing.y - player.height
    player.vy = 0
    player.grounded = true
    player.groundId = landing.block.id
    player.groundKind = landing.block.kind
    player.iceMomentum = landing.block.kind === 'ice'
    state.coyote = player.climbing ? 0 : PHYSICS.coyoteTime
  } else if (ceiling) {
    player.y = ceiling.y + ceiling.height
    player.vy = 0
  }
  if (!player.grounded && state.coyote <= 0) player.groundKind = null

  state.time = nextTime
  state.elapsed += dt

  if (state.level.spikes.some(spike => touchesSpikes(player, spike.x, spike.y))) {
    state.status = 'dead'
    state.deathReason = 'spike'
  } else if (player.y > PHYSICS.voidY) {
    state.status = 'dead'
    state.deathReason = 'void'
  } else if (Math.abs(player.x + player.width / 2 - state.level.flag.x) <= 0.7
    && Math.abs(player.y + player.height - state.level.flag.y) <= 0.65) {
    state.status = 'won'
  }
}

function protectEdge(previousX: number, targetX: number, width: number, feet: number, blocks: PositionedBlock[]): number {
  const surfaces = blocks.filter(item => Math.abs(item.y - feet) < EPSILON)
  const standing = surfaces.filter(item => overlaps(previousX, previousX + width, item.x, item.x + item.width))
  if (standing.length === 0) return targetX
  let left = Math.min(...standing.map(item => item.x))
  let right = Math.max(...standing.map(item => item.x + item.width))
  // Extend protection across adjoining floor tiles, while preserving each gap.
  let extended = true
  while (extended) {
    extended = false
    for (const surface of surfaces) {
      if (surface.x > right + EPSILON || surface.x + surface.width < left - EPSILON) continue
      const nextLeft = Math.min(left, surface.x)
      const nextRight = Math.max(right, surface.x + surface.width)
      if (nextLeft !== left || nextRight !== right) extended = true
      left = nextLeft
      right = nextRight
    }
  }
  const margin = EPSILON * 4
  return Math.min(right - margin, Math.max(left - width + margin, targetX))
}

type Rectangle = { x: number; y: number; width: number; height: number }
type Point = { x: number; y: number }

/** Spike.y is the supporting surface. Each tile has three 0.38-block tall triangles. */
function touchesSpikes(player: Rectangle, x: number, y: number): boolean {
  if (!overlaps(player.x, player.x + player.width, x + 0.08, x + 0.92)
    || !overlaps(player.y, player.y + player.height, y - 0.38, y)) return false
  for (let index = 0; index < 3; index += 1) {
    const left = x + 0.08 + index * 0.28
    if (triangleIntersectsRectangle([
      { x: left, y }, { x: left + 0.14, y: y - 0.38 }, { x: left + 0.28, y },
    ], player)) return true
  }
  return false
}

function triangleIntersectsRectangle(triangle: Point[], rectangle: Rectangle): boolean {
  const corners = [
    { x: rectangle.x, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height },
    { x: rectangle.x, y: rectangle.y + rectangle.height },
  ]
  const axes: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }]
  for (let index = 0; index < 3; index += 1) {
    const start = triangle[index]!
    const end = triangle[(index + 1) % 3]!
    axes.push({ x: start.y - end.y, y: end.x - start.x })
  }
  return axes.every(axis => {
    const triangleProjection = triangle.map(point => point.x * axis.x + point.y * axis.y)
    const rectangleProjection = corners.map(point => point.x * axis.x + point.y * axis.y)
    return overlaps(Math.min(...triangleProjection), Math.max(...triangleProjection),
      Math.min(...rectangleProjection), Math.max(...rectangleProjection))
  })
}
