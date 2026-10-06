import type { CharacterId, SkinId } from '../../shared/types'

export const SKINS: { id: SkinId; name: string; image?: string }[] = [
  { id: 'steve', name: 'Steve' }, { id: 'alex', name: 'Alex' },
  { id: 'dream', name: 'Dream', image: '/skins/dream.png' },
  { id: 'skeppy', name: 'Skeppy', image: '/skins/skeppy.png' },
]
export const HORSE = Object.freeze({ chance: .05, jumpHeight: 2.5, speedMultiplier: 1.3, width: .8, height: 1.75, crouchHeight: 1.25 })
export function readSkin(value: string | null, fallback: CharacterId): SkinId {
  return SKINS.some(skin => skin.id === value) ? value as SkinId : fallback
}
export interface Appearance { skin?: SkinId; horse?: boolean }
