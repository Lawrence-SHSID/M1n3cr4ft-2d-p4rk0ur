export const WALLET_KEY = 'skybound.wallet.v1'
export type ItemId = 'scaffolding' | 'teleport' | 'potion'
export const SHOP: { id: ItemId; name: string; price: number; icon: string; description: string }[] = [
  { id: 'scaffolding', name: 'Scaffolding block', price: 2, icon: '▤', description: 'One block to build a step or bridge. Place it within 4 blocks of your player.' },
  { id: 'teleport', name: 'Teleport pearl', price: 8, icon: '✦', description: 'Teleport once to a safe landing up to 10 blocks away. Click where you want to go.' },
  { id: 'potion', name: 'Healing potion', price: 5, icon: '♥', description: 'Restore 6 hearts in a bonus skeleton fight. One drink per potion.' },
]
export interface Wallet { version: 1; coins: number; completed: number[]; inventory: Record<ItemId, number> }
export const emptyWallet = (): Wallet => ({ version: 1, coins: 0, completed: [], inventory: { scaffolding: 0, teleport: 0, potion: 0 } })
const copy = (wallet: Wallet): Wallet => ({ ...wallet, completed: [...wallet.completed], inventory: { ...wallet.inventory } })
const integer = (n: unknown, max = 1_000_000) => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= max
export function rewardForLevel(level: number): number {
  return Number.isInteger(level) && level >= 1 && level <= 1000 ? 5 + 3 * Math.floor((level - 1) / 5) : 0
}
export function readWallet(storage: Pick<Storage, 'getItem'>): Wallet {
  const raw = storage.getItem(WALLET_KEY)
  if (raw === null) return emptyWallet()
  const data = JSON.parse(raw) as Wallet
  if (!data || data.version !== 1 || !integer(data.coins) || !Array.isArray(data.completed)
    || data.completed.length > 1000 || data.completed.some(n => !integer(n, 1000) || n === 0)
    || new Set(data.completed).size !== data.completed.length || !data.inventory
    || SHOP.some(item => !integer(data.inventory[item.id], 100_000))) throw new Error('Your saved coins could not be read. The saved data has been kept.')
  return copy(data)
}
export function saveWallet(storage: Pick<Storage, 'setItem'>, wallet: Wallet): void {
  storage.setItem(WALLET_KEY, JSON.stringify(wallet))
}
export function awardLevel(wallet: Wallet, level: number): { wallet: Wallet; earned: number } {
  const earned = wallet.completed.includes(level) ? 0 : rewardForLevel(level)
  const next = copy(wallet)
  if (earned) { next.coins += earned; next.completed.push(level) }
  return { wallet: next, earned }
}
export function buyItem(wallet: Wallet, id: ItemId): Wallet {
  const item = SHOP.find(item => item.id === id)
  if (!item || wallet.coins < item.price) throw new Error('Not enough coins. Finish a new level to earn more!')
  if (wallet.inventory[id] >= 100_000) throw new Error('Your bag is full of this item.')
  const next = copy(wallet); next.coins -= item.price; next.inventory[id] += 1
  return next
}
export function consumeItem(wallet: Wallet, id: ItemId): Wallet {
  if (!SHOP.some(item => item.id === id) || wallet.inventory[id] < 1) throw new Error('You have none of this item. Visit the shop first.')
  const next = copy(wallet); next.inventory[id] -= 1
  return next
}
