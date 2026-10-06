import type { BlockKind, CharacterId, GameStatus, Player } from '../../shared/types'

export interface DustParticle { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: string }
type Actor = { id: CharacterId; player: Player; status: GameStatus }
const palettes: Record<BlockKind, string[]> = {
  grass: ['#92704c', '#ab875b', '#7eaa55'], dirt: ['#92704c', '#b28b61', '#785738'],
  stone: ['#9aa09b', '#bfc6bd', '#7d8985'], wood: ['#a17b49', '#765631'],
  leaf: ['#799b4f', '#a4b56d'], slime: ['#8bc854', '#b4db7b'], ice: ['#a7c9fa', '#c4e3ff', '#ffffff'],
  netherrack: ['#733d38', '#9b6159', '#4c201f'], 'nether-brick': ['#512826', '#7a4140', '#361616'],
  'end-stone': ['#e2e6ac', '#c6cb91', '#f1f4bf'], purpur: ['#b18bb8', '#cbabcd', '#8b638f'],
  scaffolding: ['#ba9147', '#ecd18b'],
}

/** Footstep crumbs live in world coordinates, so cameras never drag their trail. */
export class WalkingParticles {
  particles: DustParticle[] = []
  private actors = new Map<CharacterId, { x: number; y: number; fraction: number }>()
  reset() { this.particles = []; this.actors.clear() }
  update(actors: Actor[], dt: number, active: boolean) {
    if (!active || !Number.isFinite(dt) || dt <= 0) return
    dt = Math.min(dt, .1)
    for (const particle of this.particles) {
      particle.age += dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 3.4 * dt
    }
    this.particles = this.particles.filter(particle => particle.age < particle.life)
    for (const actor of actors) {
      const p = actor.player, feet = p.y + p.height
      const previous = this.actors.get(actor.id)
      const jumped = previous && (Math.abs(previous.x - p.x) > 2 || Math.abs(previous.y - feet) > 2)
      let fraction = previous?.fraction ?? 0
      if (!jumped && actor.status === 'playing' && p.grounded && Math.abs(p.vx) > .1) {
        fraction += dt * (p.sprinting ? 28 : p.sneaking ? 6 : 14)
        while (fraction >= 1) {
          fraction -= 1
          const palette = palettes[p.groundKind ?? 'dirt']
          this.particles.push({ x: p.x + p.width * .5 - p.facing * .16, y: feet - .02, vx: -p.vx * .13 + (Math.random() - .5) * .45, vy: -.5 - Math.random() * .9,
            age: 0, life: .3 + Math.random() * .25, size: .035 + Math.random() * .03, color: palette[Math.floor(Math.random() * palette.length)]! })
        }
      } else fraction = 0
      this.actors.set(actor.id, { x: p.x, y: feet, fraction })
    }
    const present = new Set(actors.map(actor => actor.id))
    for (const id of this.actors.keys()) if (!present.has(id)) this.actors.delete(id)
    if (this.particles.length > 120) this.particles.splice(0, this.particles.length - 120)
  }
}
