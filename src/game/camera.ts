import type { GameStatus, Level, Player } from '../../shared/types'

export interface CameraFrame {
  tile: number
  originX: number
  originY: number
}

type Actor = { player: Player; status: GameStatus; predicted?: boolean }
const RESPONSE = 6
const HORIZONTAL_CONTEXT = 3
const FLIGHT_MARGIN = 1
const PREDICTIVE_RESPONSE = 12

/**
 * A shared viewport in CSS pixels. Render a world point with
 * screenX = originX + x * tile and screenY = originY + y * tile.
 * reset() makes the next update initialize directly at its new target.
 * predicted subjects influence the target zoom without displacing visible players.
 */
export class SharedCamera {
  private frame: { tile: number; centerX: number; centerY: number } | null = null

  reset(): void {
    this.frame = null
  }

  update(level: Level, actors: Actor[], width: number, height: number, nominalTile: number, dt: number): CameraFrame {
    const viewportWidth = positive(width, 1)
    const viewportHeight = positive(height, 1)
    const nominal = positive(nominalTile, 64)
    const eligible = actors.filter(actor => actor.status !== 'dead' && validPlayer(actor.player))
    const subjects = eligible.map(actor => actor.player)
    const actual = eligible.filter(actor => !actor.predicted).map(actor => actor.player)
    const predicting = eligible.some(actor => actor.predicted)
    if (subjects.length === 0) {
      subjects.push({ x: finite(level.spawn.x, 0), y: finite(level.spawn.y, 8) - 1.25, width: 0.48, height: 1.25 } as Player)
    }

    const left = Math.min(...subjects.map(player => player.x))
    const right = Math.max(...subjects.map(player => player.x + player.width))
    const top = Math.min(...subjects.map(player => player.y))
    const bottom = Math.max(...subjects.map(player => player.y + player.height))
    const centerXs = subjects.map(player => player.x + player.width / 2)
    const centerYs = subjects.map(player => player.y + player.height / 2)
    const separationX = Math.max(...centerXs) - Math.min(...centerXs)
    const separationY = Math.max(...centerYs) - Math.min(...centerYs)
    const tallest = Math.max(...subjects.map(player => player.height))
    const flying = level.kind === 'elytra'

    const ceiling = finite(level.flight?.ceiling, 0)
    const floor = Math.max(ceiling + 0.1, finite(level.flight?.floor, 16))
    const upper = flying ? ceiling - FLIGHT_MARGIN : top - 3
    const lower = flying ? floor + FLIGHT_MARGIN : bottom + 2
    const fitX = viewportWidth / (right - left + HORIZONTAL_CONTEXT * 2)
    const fitY = viewportHeight / (lower - upper)
    const closeTile = Math.min(nominal * 1.1, flying ? fitY : viewportHeight / (tallest + 5))
    // Separation reduces zoom immediately, while the fit limit handles large spans.
    const separationZoom = closeTile / (1 + separationX / 24 + (flying ? 0 : separationY / 18))
    const targetTile = Math.min(separationZoom, fitX, fitY)
    const targetX = worldCenter((left + right) / 2, targetTile, viewportWidth, level.length, left, right)
    const targetY = (upper + lower) / 2

    if (!this.frame) {
      this.frame = { tile: targetTile, centerX: targetX, centerY: targetY }
    } else {
      const seconds = Math.max(0, Math.min(0.1, finite(dt, 0)))
      const alpha = -Math.expm1(-RESPONSE * seconds)
      if (seconds > 0 && actual.length > 0) {
        const bounds = subjectBounds(actual)
        // An actual runner must remain visible even during a sudden respawn.
        this.frame.tile = Math.min(this.frame.tile, viewportWidth / (bounds.right - bounds.left),
          viewportHeight / (bounds.bottom - bounds.top))
        this.frame.centerX = containCenter(this.frame.centerX, bounds.left, bounds.right, viewportWidth / this.frame.tile)
        if (!flying) this.frame.centerY = containCenter(this.frame.centerY, bounds.top, bounds.bottom, viewportHeight / this.frame.tile)
      }
      if (predicting && targetTile < this.frame.tile) {
        const zoomAlpha = -Math.expm1(-PREDICTIVE_RESPONSE * seconds)
        this.frame.tile = Math.exp(Math.log(this.frame.tile) + (Math.log(targetTile) - Math.log(this.frame.tile)) * zoomAlpha)
      } else {
        this.frame.tile += (targetTile - this.frame.tile) * alpha
      }
      const positionAlpha = predicting ? -Math.expm1(-PREDICTIVE_RESPONSE * seconds) : alpha
      this.frame.centerX += (targetX - this.frame.centerX) * positionAlpha
      this.frame.centerY += (targetY - this.frame.centerY) * positionAlpha
      if (seconds > 0 && actual.length > 0) {
        const bounds = subjectBounds(actual)
        this.frame.centerX = containCenter(this.frame.centerX, bounds.left, bounds.right, viewportWidth / this.frame.tile)
        if (!flying) this.frame.centerY = containCenter(this.frame.centerY, bounds.top, bounds.bottom, viewportHeight / this.frame.tile)
      }
    }

    if (flying) {
      // Corridor bounds remain visible even during a resize or course transition.
      this.frame.tile = Math.min(this.frame.tile, fitY)
      this.frame.centerY = (ceiling + floor) / 2
    }
    this.frame.centerX = worldCenter(this.frame.centerX, this.frame.tile, viewportWidth, level.length, left, right)
    return {
      tile: this.frame.tile,
      originX: viewportWidth / 2 - this.frame.centerX * this.frame.tile,
      originY: viewportHeight / 2 - this.frame.centerY * this.frame.tile,
    }
  }
}

function subjectBounds(subjects: Player[]): { left: number; right: number; top: number; bottom: number } {
  return {
    left: Math.min(...subjects.map(player => player.x)), right: Math.max(...subjects.map(player => player.x + player.width)),
    top: Math.min(...subjects.map(player => player.y)), bottom: Math.max(...subjects.map(player => player.y + player.height)),
  }
}

function containCenter(center: number, minimum: number, maximum: number, visible: number): number {
  return Math.max(maximum - visible / 2, Math.min(minimum + visible / 2, center))
}

function worldCenter(center: number, tile: number, width: number, length: number, left: number, right: number): number {
  // Subjects outside the course extend these bounds, including a predicted respawn.
  const worldLeft = Math.min(0, left)
  const worldRight = Math.max(positive(length, 1), right)
  const visible = width / tile
  if (visible >= worldRight - worldLeft) return (worldLeft + worldRight) / 2
  return Math.max(worldLeft + visible / 2, Math.min(worldRight - visible / 2, center))
}

function validPlayer(player: Player): boolean {
  return Number.isFinite(player.x) && Number.isFinite(player.y)
    && Number.isFinite(player.width) && player.width > 0
    && Number.isFinite(player.height) && player.height > 0
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}
