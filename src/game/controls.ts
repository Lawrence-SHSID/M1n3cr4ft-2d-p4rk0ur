import type { CharacterId, GameMode, Input } from '../../shared/types'

type Action = 'left' | 'right' | 'jump' | 'sneak' | 'attack'
type Binding = { id: CharacterId; action: Action }
type Tap = { atMs: number; released: boolean }

const ARROW_KEYS: Readonly<Record<string, Action>> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'sneak',
}
const WASD_KEYS: Readonly<Record<string, Action>> = {
  KeyA: 'left', KeyD: 'right', KeyW: 'jump', KeyS: 'sneak',
}
const DOUBLE_TAP_MS = 250

/**
 * Tracks physical keys independently, including a jump tapped between simulation frames.
 * Sprint requires two keydowns within 250 ms with a release between them.
 */
export class KeyboardControls {
  private readonly held = new Set<string>()
  private readonly taps = new Map<string, Tap>()
  private readonly sprintKeys = new Map<CharacterId, string>()
  private readonly queuedJumps = new Set<CharacterId>()
  private readonly queuedAttacks = new Set<CharacterId>()

  constructor(private readonly mode: GameMode, private autoSprint = false) {}

  setAutoSprint(enabled: boolean): void {
    this.autoSprint = enabled
    this.sprintKeys.clear()
  }

  press(code: string, repeat = false, atMs = performance.now()): CharacterId | null {
    const binding = this.binding(code)
    if (!binding) return null
    if (repeat || this.held.has(code)) return binding.id

    this.held.add(code)
    if (binding.action === 'jump') this.queuedJumps.add(binding.id)
    if (binding.action === 'attack') this.queuedAttacks.add(binding.id)
    if (binding.action === 'sneak') this.sprintKeys.delete(binding.id)

    if (binding.action === 'left' || binding.action === 'right') {
      const opposite = binding.action === 'left' ? 'right' : 'left'
      const blocked = this.isHeld(binding.id, opposite) || this.isHeld(binding.id, 'sneak')
      if (blocked) this.sprintKeys.delete(binding.id)

      const previous = this.taps.get(code)
      const elapsed = previous ? atMs - previous.atMs : Infinity
      if (!blocked && previous?.released && elapsed >= 0 && elapsed <= DOUBLE_TAP_MS) {
        this.sprintKeys.set(binding.id, code)
      }
      this.taps.set(code, { atMs, released: false })
    }
    return binding.id
  }

  release(code: string): void {
    if (!this.held.delete(code)) return
    const tap = this.taps.get(code)
    if (tap) tap.released = true
    const binding = this.binding(code)
    if (binding && this.sprintKeys.get(binding.id) === code) this.sprintKeys.delete(binding.id)
  }

  /** Use on blur, pause, or a restart so no held key or pending tap survives. */
  clear(): void {
    this.held.clear()
    this.taps.clear()
    this.sprintKeys.clear()
    this.queuedJumps.clear()
    this.queuedAttacks.clear()
  }

  inputs(): Partial<Record<CharacterId, Input>> {
    const ids: CharacterId[] = this.mode === 'duo' ? ['steve', 'alex'] : ['steve']
    const inputs: Partial<Record<CharacterId, Input>> = {}
    for (const id of ids) {
      const left = this.isHeld(id, 'left'), right = this.isHeld(id, 'right')
      const sneak = this.isHeld(id, 'sneak')
      inputs[id] = {
        left,
        right,
        jump: this.isHeld(id, 'jump') || this.queuedJumps.has(id),
        sprint: (this.autoSprint || this.sprintKeys.has(id)) && left !== right && !sneak,
        sneak,
        ...(this.isHeld(id, 'attack') || this.queuedAttacks.has(id) ? { attack: true } : {}),
      }
    }
    this.queuedJumps.clear()
    this.queuedAttacks.clear()
    return inputs
  }

  private binding(code: string): Binding | null {
    if (code === 'KeyK') return { id: 'steve', action: 'attack' }
    if (code === 'KeyF') return { id: this.mode === 'duo' ? 'alex' : 'steve', action: 'attack' }
    const arrow = Object.hasOwn(ARROW_KEYS, code) ? ARROW_KEYS[code] : undefined
    if (arrow) return { id: 'steve', action: arrow }
    const wasd = Object.hasOwn(WASD_KEYS, code) ? WASD_KEYS[code] : undefined
    if (wasd) return { id: this.mode === 'duo' ? 'alex' : 'steve', action: wasd }
    return null
  }

  private isHeld(id: CharacterId, action: Action): boolean {
    for (const code of this.held) {
      const binding = this.binding(code)
      if (binding?.id === id && binding.action === action) return true
    }
    return false
  }
}
