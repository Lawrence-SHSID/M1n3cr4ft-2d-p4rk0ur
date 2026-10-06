import type { CharacterId, CombatState, GameSession, Input, Level } from '../../shared/types'
import { blockPosition, blockSize, PHYSICS } from './physics'

export const COMBAT = Object.freeze({
  playerHearts: 20, skeletonHearts: 15, arrowDamage: 2.5, swordDamage: 6,
  knockback: 0.75, swordReach: 1.35, attackCooldown: 0.45, swingDuration: 0.18,
  firstShot: 1.2, shotInterval: 1.4, arrowLifetime: 8,
})

export function createCombat(level: Level): CombatState | undefined {
  if (!level.bonus) return undefined
  const spawn = level.bonus.skeleton
  return {
    skeleton: { x: spawn.x, y: spawn.y - 1.8, width: 0.65, height: 1.8,
      facing: -1, hearts: COMBAT.skeletonHearts, shootIn: COMBAT.firstShot },
    arrows: [], nextArrowId: 1,
  }
}

type Rectangle = { x: number; y: number; width: number; height: number }
/** Returns entry time along a segment, including a projectile already inside a body. */
function entry(x: number, y: number, dx: number, dy: number, body: Rectangle): number | null {
  let near = 0, far = 1
  for (const [origin, delta, min, max] of [
    [x, dx, body.x, body.x + body.width], [y, dy, body.y, body.y + body.height],
  ]) {
    if (Math.abs(delta!) < 1e-9) {
      if (origin! < min! || origin! > max!) return null
    } else {
      const a = (min! - origin!) / delta!, b = (max! - origin!) / delta!
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b))
      if (near > far) return null
    }
  }
  return near
}

/** One stationary enemy and its arrows belong to the shared world, not each runner. */
export function stepCombat(session: GameSession, inputs: Partial<Record<CharacterId, Input>>, dt: number): void {
  const combat = session.combat
  if (!combat) return
  const skeleton = combat.skeleton
  const live = session.runs.filter(run => run.state.status === 'playing')
  const walls = session.level.blocks.filter(block => block.solid).map(block => ({
    ...blockPosition(block, session.time + dt), ...blockSize(block),
  }))
  const target = live.slice().sort((a, b) => {
    const distance = (p: Rectangle) => (p.x + p.width / 2 - skeleton.x - skeleton.width / 2) ** 2
      + (p.y + p.height / 2 - skeleton.y - skeleton.height / 2) ** 2
    return distance(a.state.player) - distance(b.state.player)
  })[0]
  if (target) skeleton.facing = target.state.player.x + target.state.player.width / 2 >= skeleton.x + skeleton.width / 2 ? 1 : -1

  for (const run of live) {
    const fighter = run.state.combat
    if (!fighter) continue
    fighter.attackCooldown = Math.max(0, fighter.attackCooldown - dt)
    fighter.swing = Math.max(0, fighter.swing - dt)
    if (!inputs[run.id]?.attack || fighter.attackCooldown > 1e-7) continue
    fighter.attackCooldown = COMBAT.attackCooldown
    fighter.swing = COMBAT.swingDuration
    const p = run.state.player
    const left = p.facing > 0 ? p.x : p.x - COMBAT.swordReach
    const right = p.facing > 0 ? p.x + p.width + COMBAT.swordReach : p.x + p.width
    const inReach = skeleton.x + skeleton.width >= left && skeleton.x <= right
      && skeleton.y + skeleton.height >= p.y - 0.2 && skeleton.y <= p.y + p.height + 0.2
    const x = p.x + p.width / 2, y = p.y + p.height / 2
    const dx = skeleton.x + skeleton.width / 2 - x, dy = skeleton.y + skeleton.height / 2 - y
    if (skeleton.hearts > 0 && inReach && !walls.some(wall => entry(x, y, dx, dy, wall) !== null)) {
      skeleton.hearts = Math.max(0, skeleton.hearts - COMBAT.swordDamage)
    }
  }

  if (skeleton.hearts > 0 && target) {
    skeleton.shootIn -= dt
    if (skeleton.shootIn <= 1e-7) {
      skeleton.shootIn += COMBAT.shotInterval
      const x = skeleton.x + skeleton.width / 2, y = skeleton.y + skeleton.height * 0.45
      const p = target.state.player
      const dx = p.x + p.width / 2 - x, dy = p.y + p.height / 2 - y
      const distance = Math.hypot(dx, dy) || 1
      combat.arrows.push({ id: combat.nextArrowId++, x, y,
        vx: dx / distance * PHYSICS.speed, vy: dy / distance * PHYSICS.speed,
        life: COMBAT.arrowLifetime })
    }
  }

  combat.arrows = combat.arrows.filter(arrow => {
    const dx = arrow.vx * dt, dy = arrow.vy * dt
    let earliest = Infinity
    let victim: typeof live[number] | undefined
    for (const wall of walls) {
      const hit = entry(arrow.x, arrow.y, dx, dy, wall)
      if (hit !== null && hit < earliest) earliest = hit
    }
    for (const run of live) {
      if (run.state.status !== 'playing') continue
      const hit = entry(arrow.x, arrow.y, dx, dy, run.state.player)
      if (hit !== null && hit < earliest) { earliest = hit; victim = run }
    }
    if (earliest !== Infinity) {
      if (victim?.state.combat) {
        const fighter = victim.state.combat
        fighter.hearts = Math.max(0, fighter.hearts - COMBAT.arrowDamage)
        const push = fighter.knockbackRemaining * fighter.knockbackDirection
          + (arrow.vx >= 0 ? 1 : -1) * COMBAT.knockback
        fighter.knockbackDirection = push >= 0 ? 1 : -1
        fighter.knockbackRemaining = Math.abs(push)
        if (fighter.hearts === 0) { victim.state.status = 'dead'; victim.state.deathReason = 'arrow' }
      }
      return false
    }
    arrow.x += dx; arrow.y += dy; arrow.life -= dt
    return arrow.life > 0
  })
  for (const run of session.runs) run.state.goalUnlocked = skeleton.hearts === 0
}
