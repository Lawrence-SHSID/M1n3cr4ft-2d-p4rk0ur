import type { CharacterId, GameMode, GameSession, Input, Level, PlayerRun } from '../../shared/types'
import { blockPosition, blockSize, createGame, PHYSICS, startGame, stepGame } from './physics'
import { FLIGHT } from './flight'

const IDLE: Input = { left: false, right: false, jump: false }
const MAX_STEP = 1 / 120
const EPSILON = 1e-7
const RESPAWN_DELAY = 0.8

export function createSession(level: Level, mode: GameMode = 'solo'): GameSession {
  const runs: PlayerRun[] = [createRun('steve', level, level.spawn)]
  if (mode === 'duo') runs.push(createRun('alex', level, alexSpawn(level)))
  return { level, mode, runs, status: 'ready', time: 0, elapsed: 0 }
}

export function startSession(session: GameSession): void {
  if (session.status !== 'ready' && session.status !== 'paused') return
  session.status = 'playing'
  for (const run of session.runs) startGame(run.state)
}

/** Each runner owns collisions and checkpoints; all runners share one platform clock. */
export function stepSession(session: GameSession, inputs: Partial<Record<CharacterId, Input>>, dt: number): void {
  if (session.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return
  let remaining = dt
  while (remaining > EPSILON && session.status === 'playing') {
    const step = Math.min(remaining, MAX_STEP)
    advanceSession(session, inputs, step)
    remaining -= step
  }
}

/** Retry the current route from each personal checkpoint, retaining the session clock. */
export function retrySession(session: GameSession): void {
  for (const run of session.runs) respawn(session, run, session.time, session.elapsed)
  session.status = 'playing'
}

function createRun(id: CharacterId, level: Level, spawn: { x: number; y: number }): PlayerRun {
  return { id, state: createGame({ ...level, spawn: { ...spawn } }), checkpoint: null, deaths: 0, respawnIn: 0 }
}

function advanceSession(session: GameSession, inputs: Partial<Record<CharacterId, Input>>, dt: number): void {
  const nextTime = session.time + dt
  const nextElapsed = session.elapsed + dt
  for (const run of session.runs) {
    if (run.state.status === 'dead') {
      if (session.mode === 'duo') {
        run.respawnIn = Math.max(0, run.respawnIn - dt)
        if (run.respawnIn <= EPSILON) respawn(session, run, nextTime, nextElapsed)
      }
      continue
    }
    if (run.state.status !== 'playing') continue
    run.state.time = session.time
    run.state.elapsed = session.elapsed
    stepGame(run.state, inputs[run.id] ?? IDLE, dt)
    if (run.state.deathReason !== null) {
      run.deaths += 1
      run.respawnIn = session.mode === 'duo' ? RESPAWN_DELAY : 0
    } else {
      activateCheckpoint(session, run)
    }
  }
  session.time = nextTime
  session.elapsed = nextElapsed
  if (session.mode === 'solo' && session.runs[0]!.state.status === 'dead') {
    session.status = 'dead'
  } else if (session.runs.every(run => run.state.status === 'won')) {
    session.status = 'won'
  }
}

function activateCheckpoint(session: GameSession, run: PlayerRun): void {
  const flying = session.level.kind === 'elytra'
  if (session.level.length <= 45 || (!flying && !run.state.player.grounded)) return
  const player = run.state.player
  const feet = player.y + player.height
  const checkpoints = session.level.checkpoints ?? []
  for (const checkpoint of checkpoints) {
    if (checkpoint.x <= (run.checkpoint?.x ?? -Infinity)) continue
    const nearX = Math.abs(player.x - checkpoint.x) <= (flying ? 0.8 : 0.65)
    const nearAltitude = Math.abs(feet - checkpoint.y) <= (flying ? 1 : 0.12)
    if (nearX && nearAltitude) {
      run.checkpoint = checkpoint
    }
  }
}

function respawn(session: GameSession, run: PlayerRun, time: number, elapsed: number): void {
  const spawn = run.checkpoint ?? (run.id === 'alex' ? alexSpawn(session.level) : session.level.spawn)
  const jumps = run.state.jumps
  const state = createGame({ ...session.level, spawn: { x: spawn.x, y: spawn.y } })
  state.time = time
  state.elapsed = elapsed
  state.jumps = jumps
  startGame(state)
  run.state = state
  run.respawnIn = 0
}

function alexSpawn(level: Level): { x: number; y: number } {
  const flying = level.kind === 'elytra'
  const width = flying ? FLIGHT.playerWidth : PHYSICS.playerWidth
  const height = flying ? FLIGHT.playerHeight : PHYSICS.playerHeight
  const isSafe = (x: number) => {
    const feet = level.spawn.y
    const solidFloor = flying || level.blocks.some(block => {
      if (!block.solid || block.motion) return false
      const position = blockPosition(block, 0)
      const size = blockSize(block)
      return Math.abs(position.y - feet) <= EPSILON
        && x + width > position.x + EPSILON && x < position.x + size.width - EPSILON
    })
    const hazard = level.spikes.some(spike => feet > spike.y - 0.38 + EPSILON && feet - height < spike.y - EPSILON
      && x + width > spike.x + 0.08 && x < spike.x + 0.92)
    const bodyBlocked = level.blocks.some(block => {
      if (!block.solid) return false
      const position = blockPosition(block, 0)
      const size = blockSize(block)
      return x + width > position.x + EPSILON && x < position.x + size.width - EPSILON
        && feet > position.y + EPSILON && feet - height < position.y + size.height - EPSILON
    })
    const inBounds = !flying || (feet - height > (level.flight?.ceiling ?? 0) + EPSILON
      && feet < (level.flight?.floor ?? 16) - EPSILON)
    return solidFloor && !hazard && !bodyBlocked && inBounds
  }
  const offsets = flying ? [1.3, -1.3, 1, -1, 0.75, -0.75, 0] : [1, -1, 0.75, -0.75, 0.5, -0.5, 0]
  for (const offset of offsets) {
    const x = level.spawn.x + offset
    if (isSafe(x)) return { x, y: level.spawn.y }
  }
  return { ...level.spawn }
}
