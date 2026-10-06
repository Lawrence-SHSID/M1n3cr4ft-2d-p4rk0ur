import type { BlockKind, Level } from './types'

/** [empty gap, landing width, rise]; positive rise points upward. */
type Leap = readonly [gap: number, width: number, rise: number]

const routes: readonly { name: string; subtitle: string; leaps: readonly Leap[] }[] = [
  {
    name: 'Shattered archipelago',
    subtitle: 'Sprint across broken End islands. Save your jump for the very edge.',
    leaps: [[4,3,0],[3,2,0.5],[3,3,0],[2,4,3],[4,2,-1.5],[4,3,-2],
      [3,2,0.5],[4,4,0],[3,2,0.5],[3,3,-0.5],[2,3,3.5],[4,3,-2],
      [4,2,-1.5],[3,4,0],[4,2,0],[3,3,0.5],[4,2,-0.5]],
  },
  {
    name: 'Purpur staircase',
    subtitle: 'Link narrow rising steps, then spring up to the purpur towers.',
    leaps: [[3,3,0.5],[3,2,0.5],[3,2,0.5],[4,4,-1.5],[2,3,4],
      [4,2,-1],[4,3,-1.5],[3,2,-1.5],[3,4,0.5],[3,2,0.5],
      [3,2,0.5],[4,3,-1.5],[2,4,3.5],[4,2,-2],[4,2,-1.5],
      [3,3,0.5],[4,3,-0.5],[4,2,0],[3,2,0.5]],
  },
  {
    name: 'Crystal ridges',
    subtitle: 'Small ledges change height. Aim each landing before the next leap.',
    leaps: [[2,2,0.75],[4,3,-0.75],[3,2,0.5],[3,4,-0.5],[2,3,3.5],
      [3,2,0.5],[4,2,-2],[4,4,-2],[2,2,0.75],[4,3,-0.75],
      [3,2,0.5],[3,4,-0.5],[2,3,4],[4,2,-1.5],[4,3,-2.5],
      [2,2,0.75],[4,2,-0.75],[3,3,0.5],[4,2,-0.5]],
  },
  {
    name: 'Void needles',
    subtitle: 'Two-block islands leave little room. Sprint, land, and line up again.',
    leaps: [[4,2,0],[4,2,0],[3,3,0.5],[4,2,-0.5],[4,4,0],
      [2,2,4],[4,2,-1.5],[4,3,-2.5],[4,2,0],[3,2,0.5],
      [4,4,-0.5],[4,2,0],[2,3,3.5],[4,2,-1.5],[4,2,-2],
      [4,3,0],[3,2,0.5],[4,2,-0.5],[4,2,0],[3,3,0]],
  },
  {
    name: 'End citadel',
    subtitle: 'The final challenge mixes long gaps, tiny landings, and four-block towers.',
    leaps: [[4,2,0],[3,2,0.5],[4,3,-0.5],[2,2,4],[4,2,-1],
      [3,2,0.5],[4,3,-2],[4,2,-1.5],[4,4,0],[3,2,0.5],
      [3,2,0.5],[4,2,-1],[2,3,4],[4,2,-2],[4,2,-2],
      [4,3,0],[3,2,0.5],[4,2,-0.5],[4,2,0],[3,2,0.5],[4,3,-0.5]],
  },
]

/** Five authored accuracy courses use the same normal/slime jump rules as the Overworld. */
export function generateEndLevel(number: number): Level {
  if (!Number.isInteger(number) || number < 21 || number > 25) {
    throw new RangeError('End levels run from 21 to 25.')
  }
  const route = routes[number - 21]!
  const length = 10 + (number - 1) * 5
  const level: Level = {
    number, length, kind: 'parkour', theme: 'end', name: 'End: ' + route.name,
    subtitle: route.subtitle, spawn: { x: 0.8, y: 9 }, flag: { x: length - 0.65, y: 9 },
    blocks: [], spikes: [], checkpoints: [],
  }
  const islands: { start: number; end: number; y: number; moving: boolean }[] = []
  const island = (start: number, width: number, y: number, kind: BlockKind, moving = false, index = 0) => {
    islands.push({ start, end: start + width, y, moving })
    if (moving) {
      // These are mandatory landings, not shortcuts inside an existing gap.
      level.blocks.push({ id: 'end-' + number + '-lift-' + index, kind: 'end-stone',
        x: start, y, width, height: 0.5, solid: true,
        motion: { axis: 'y', range: 1.4 + (number - 21) * 0.1,
          speed: 0.8 + (number - 21) * 0.1, phase: index * 0.91 + number * 0.37 },
      })
      return
    }
    for (let x = start; x < start + width; x++) {
      const tileWidth = Math.min(1, start + width - x)
      level.blocks.push({ id: 'end-' + number + '-block-' + level.blocks.length, x, y,
        width: tileWidth, kind, solid: true })
      if (width >= 3 && x > start && x + tileWidth < start + width) {
        level.blocks.push({ id: 'end-' + number + '-block-' + level.blocks.length,
          x, y: y + 1, width: tileWidth, kind: 'end-stone', solid: true })
      }
    }
  }
  island(0, 5, 9, 'end-stone')
  let cursor = 5, y = 9
  for (const [index, [authoredGap, authoredWidth, rise]] of route.leaps.entries()) {
    const gap = Math.max(3.5, authoredGap)
    const moving = index % 4 === 1 && (route.leaps[index + 1]?.[2] ?? 0) <= 1.2
    const width = moving ? 1.5 : index % 4 === 3 ? 3 : authoredWidth === 2 ? 1.5 : authoredWidth === 3 ? 2 : 3
    if (cursor + gap + width > length - 7) break
    if (rise > 1.2) {
      const launch = level.blocks.filter(block => !block.motion && block.y === y
        && block.x + (block.width ?? 1) === cursor).at(-1)
      if (!launch) throw new Error('High End leap needs a static slime launch')
      launch.kind = 'slime'
    }
    y -= rise
    island(cursor + gap, width, y, index % 2 === 0 ? 'purpur' : 'end-stone', moving, index)
    cursor += gap + width
  }
  const finishGap = 4
  island(cursor + finishGap, length - cursor - finishGap, y, 'purpur')
  level.flag.y = y
  level.subtitle = 'Expert End: 3.5–4 block gaps, tiny landings, and rising End-stone slabs. Wait, then leap.'
  // Recovery flags belong to static rest islands, never an oscillating lift.
  let previous = 0
  while (previous + 20 < length - 6) {
    const target = previous + 20
    const candidate = islands.filter(item => !item.moving && item.start >= previous + 14
      && item.start < length - 5 && item.end - item.start >= 3)
      .sort((a,b) => Math.abs(a.start - target) - Math.abs(b.start - target) || a.start - b.start)[0]
    if (!candidate) break
    const x = candidate.start + 0.25
    level.checkpoints!.push({ id: 'end-' + number + '-checkpoint-' + level.checkpoints!.length, x, y: candidate.y })
    previous = x
  }
  return level
}
