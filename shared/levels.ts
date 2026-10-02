import type { Block, BlockKind, Level } from './types'

type SurfaceKind = 'grass' | 'slime'

function generateFlightLevel(number: number): Level {
  const length = 10 + (number - 1) * 5
  const ceiling = 1
  const floor = 10
  const level: Level = {
    number, length, kind: 'elytra', flight: { ceiling, floor },
    name: number === 10 ? 'Elytra: First glide' : number === 20 ? 'Elytra: Canyon weave' : `Elytra: Sky passage ${number / 10}`,
    subtitle: 'Fly forward. Hold Up or W to climb, release to descend, and hold Right or D to boost.',
    spawn: { x: 0.8, y: 6 }, flag: { x: length - 0.65, y: 6 },
    blocks: [], spikes: [], checkpoints: [],
  }
  const gates: { x: number; end: number }[] = []
  const gate = (x: number, fromTop: boolean, boundary: number, width = 1.25) => {
    level.blocks.push({
      id: `level-${number}-gate-${gates.length + 1}`, kind: 'stone', solid: true,
      x, y: fromTop ? ceiling : boundary, width,
      height: fromTop ? boundary - ceiling : floor - boundary,
    })
    gates.push({ x, end: x + width })
  }

  if (number === 10) {
    // The first flight has long steering windows and a generous clear finish.
    gate(10, true, 5.5)
    gate(21, false, 6.5)
    gate(32, true, 6)
    gate(43, false, 7)
  } else {
    let seed = (number * 0x85ebca6b) >>> 0
    const random = () => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return (seed >>> 0) / 4294967296
    }
    let x = 9 + Math.floor(random() * 3)
    let fromTop = random() < 0.5
    while (x < length - 8) {
      const boundary = fromTop ? 5 + Math.floor(random() * 3) * 0.5 : 6 + Math.floor(random() * 3) * 0.5
      gate(x, fromTop, boundary, 1 + Math.floor(random() * 3) * 0.25)
      x += 10 + Math.floor(random() * 4)
      fromTop = !fromTop
    }
  }

  // Airborne recovery points belong in the roomy space between columns. Their
  // respawn footprint is 1.1 blocks wide and 0.6 high. Leave five blocks from
  // its left edge to the next gate: even a boosting pilot starting at vy=0 has
  // time to descend below a high column or climb above a low one.
  const openGaps = [
    { start: 4, end: gates[0]!.x },
    ...gates.map((current, index) => ({ start: current.end, end: gates[index + 1]?.x ?? length - 3 })),
  ]
  for (let target = 20; target < length - 5; target += 20) {
    const candidate = openGaps.filter(gap => gap.end - gap.start >= 7).map(gap => {
      const x = Math.max(gap.start + 2, Math.min(target, gap.end - 5))
      return { x, distance: Math.abs(x - target) }
    }).sort((a, b) => a.distance - b.distance || a.x - b.x)[0]!
    level.checkpoints!.push({ id: `level-${number}-checkpoint-${level.checkpoints!.length + 1}`, x: candidate.x, y: 6 })
  }
  return level
}

/** Coordinates are in blocks; Y points down and spawn/flag Y is feet height. */
export function generateLevel(number: number): Level {
  if (!Number.isInteger(number) || number < 1 || number > 1000) {
    throw new RangeError('Level number must be an integer between 1 and 1000.')
  }
  if (number % 10 === 0) return generateFlightLevel(number)

  const length = 10 + (number - 1) * 5
  const level: Level = {
    number, length, kind: 'parkour', name: '', subtitle: '',
    spawn: { x: 0.8, y: 9 }, flag: { x: length - 0.65, y: 6 },
    blocks: [], spikes: [],
  }

  const add = (kind: BlockKind, x: number, y: number, solid = true): Block => {
    const block: Block = { id: `level-${number}-block-${level.blocks.length}`, kind, x, y, solid }
    level.blocks.push(block)
    return block
  }
  const tile = (x: number, y: number, kind: SurfaceKind = 'grass', depth = 1) => {
    add(kind, x, y)
    for (let row = 1; row <= depth; row++) add('dirt', x, y + row)
  }
  const island = (start: number, width: number, y: number, depth = 1) => {
    for (let x = start; x < start + width; x++) tile(x, y, 'grass', depth)
  }
  const spring = (x: number, y: number) => {
    const surface = level.blocks.find(block => block.x === x && block.y === y && block.kind === 'grass')
    if (surface) surface.kind = 'slime'
    else tile(x, y, 'slime')
  }
  const spike = (x: number, y: number) => level.spikes.push({ x, y })
  const tree = (x: number, surfaceY: number) => {
    // Trunks and leaves are background decoration, never collision surfaces.
    add('wood', x, surfaceY - 1, false)
    add('wood', x, surfaceY - 2, false)
    add('leaf', x, surfaceY - 3, false)
    if (x >= 1) add('leaf', x - 1, surfaceY - 3, false)
    if (x + 1 < length) add('leaf', x + 1, surfaceY - 3, false)
    add('leaf', x, surfaceY - 4, false)
  }
  const ferry = (x: number, y: number, width: number, range: number, speed = 0.8, phase = -Math.PI / 2) => {
    const block = add('stone', x, y)
    block.width = width
    block.height = 0.5
    block.motion = { axis: 'x', range, speed, phase }
  }
  const elevator = (x: number, y: number, width: number, range: number, speed = 0.8) => {
    const block = add('stone', x, y)
    block.width = width
    block.height = 0.5
    block.motion = { axis: 'y', range, speed, phase: Math.PI / 2 }
  }
  const describe = (name: string, subtitle: string, startY: number, finishY: number) => {
    level.name = name
    level.subtitle = subtitle
    level.spawn.y = startY
    level.flag.y = finishY
  }

  // These are six independently authored courses, rather than extensions of
  // one repeated course. The jump controls are introduced by the route itself.
  switch (number) {
    case 1:
      describe('First flight', 'Jump the little gap, then use slime to reach the high flag.', 9, 6)
      island(0, 3, 9)
      island(4, 3, 9)
      spring(5, 9)
      spike(6, 9)
      ferry(7, 7.5, 1, 1, 1)
      island(8, 2, 6, 2)
      tree(1, 9)
      break
    case 2:
      describe('The long leap', 'Double-tap a direction to sprint, then jump across the four-block gap.', 8, 6.5)
      island(0, 4, 8, 2)
      island(8, 4, 8)
      spike(10, 8)
      spring(11, 8)
      ferry(12, 7, 1, 1, 0.9)
      island(13, 2, 6.5, 2)
      tree(1, 8)
      break
    case 3:
      describe('Forest steps', 'Climb the small forest islands. Slime launches you to the treetops.', 9.5, 5.5)
      island(0, 3, 9.5, 2)
      island(4, 2, 9)
      island(8, 2, 8.5)
      island(11, 3, 8)
      spike(12, 8)
      spring(13, 8)
      elevator(15, 7, 1.5, 1.5)
      island(17, 3, 5.5, 2)
      tree(1, 9.5)
      tree(9, 8.5)
      tree(18, 5.5)
      break
    case 4:
      describe('Stone ferry', 'Board the stone slab, ride across the channel, then jump to shore.', 9, 8.5)
      island(0, 5, 9, 2)
      ferry(8.5, 9, 2, 3, 0.7)
      island(13, 4, 9)
      spike(15, 9)
      spring(16, 9)
      island(20, 5, 8.5, 2)
      tree(2, 9)
      tree(22, 8.5)
      break
    case 5:
      describe('Up, then down', 'Sprint up half-block steps, spring onto the ridge, and follow the descent.', 9.5, 7.5)
      island(0, 4, 9.5, 2)
      island(6, 2, 9)
      island(9, 2, 8.5)
      island(13, 3, 8)
      spring(15, 8)
      island(18, 3, 5, 2)
      spike(19, 5)
      elevator(22, 6.5, 1.5, 1.5, 0.85)
      island(24, 3, 8)
      spring(26, 8)
      island(28, 2, 7.5, 2)
      tree(1, 9.5)
      tree(14, 8)
      break
    case 6:
      describe('Skyline circuit', 'A sprint leap, a ferry ride, and two green springs lead to the summit.', 8.5, 5)
      island(0, 4, 8.5, 2)
      island(8, 3, 8.5)
      ferry(15.5, 8.5, 2, 3, 0.72)
      island(20, 3, 8.5)
      spring(22, 8.5)
      island(25, 3, 6.5)
      spike(26, 6.5)
      island(29, 2, 7)
      spring(30, 7)
      island(33, 2, 5, 2)
      tree(1, 8.5)
      tree(21, 8.5)
      tree(27, 6.5)
      break
    default: {
      // A stable level-specific seed mixes variable-length motifs. In addition
      // to order, the gaps, heights, ferry spans, and island widths all change.
      let seed = (number * 0x9e3779b1) >>> 0
      const random = () => {
        seed ^= seed << 13
        seed ^= seed >>> 17
        seed ^= seed << 5
        return (seed >>> 0) / 4294967296
      }
      const integer = (minimum: number, maximum: number) => minimum + Math.floor(random() * (maximum - minimum + 1))
      const names = ['Faraway forest', 'Cloud crossings', 'Floating stairway', 'Green horizons', 'Slab expedition']
      let y = 7.5 + integer(0, 4) * 0.5
      let cursor = 4
      island(0, cursor, y, 2)
      tree(1, y)
      level.spawn.y = y
      level.name = `${names[(number - 7) % names.length]} ${number}`
      level.subtitle = 'Read the islands: sprint over gaps, ride stone slabs, and use slime for high ledges.'
      const gaps: { start: number; width: number; y: number; spring: boolean; ferry: boolean }[] = []

      while (cursor < length) {
        const remaining = length - cursor
        if (remaining <= 4) {
          island(cursor, remaining, y)
          cursor = length
          break
        }
        let motif = integer(0, 4)
        if (motif === 3 && remaining < 9) motif = 0
        let gap = motif === 3 ? integer(6, 8) : motif === 1 ? integer(1, 2) : integer(2, 4)
        let width = motif === 4 ? 4 : integer(2, 4)
        if (gap + width > remaining) {
          width = 2
          gap = remaining - width
          if (gap > 4 && motif !== 3) gap = 4
        }
        if (motif === 3 && gap < 6) motif = 0
        const start = cursor + gap
        let nextY = y
        if (motif === 1) nextY = Math.max(4, Math.min(10, y + (random() < 0.5 ? -0.5 : 0.5)))
        if (motif === 2) {
          spring(cursor - 1, y)
          nextY = Math.max(3.5, y - integer(3, 6) * 0.5)
        }
        if (motif === 3) {
          // At the endpoints the slab's edges meet both shores. The 6–8 block
          // channel cannot be replaced by an ordinary four-block sprint jump.
          ferry(cursor + gap / 2 - 1, y, 2, gap / 2 - 1, 0.65 + random() * 0.3)
        }
        gaps.push({ start: cursor, width: gap, y, spring: motif === 2, ferry: motif === 3 })
        island(start, width, nextY, motif === 4 ? 2 : 1)
        if (width >= 3 && start + width < length && random() < 0.28) spike(start + width - 2, nextY)
        if (motif === 4) tree(start + 1, nextY)
        cursor = start + width
        y = nextY
      }

      // Courses without a ferry motif still offer a moving half-slab at a gap.
      if (!level.blocks.some(block => block.motion)) {
        const gap = gaps.find(item => item.width >= 2)!
        ferry(gap.start + gap.width / 2 - 0.5, gap.y + 0.5, 1, 1, 0.9)
      }
      const springGaps = gaps.filter(gap => gap.spring)
      if (springGaps.length) {
        // Slime jumps pass over these optional elevators. A rider can instead
        // board at surface height and rise three blocks toward the next ledge.
        for (let index = 0; index < springGaps.length; index += 2) {
          const gap = springGaps[index]!
          elevator(gap.start + gap.width / 2 - 0.5, gap.y - 1.5, 1, 1.5, 0.75)
        }
      } else {
        // Stay below the ordinary jump arc when no spring gap is available.
        const gap = gaps.find(item => !item.ferry && item.width >= 2) ?? gaps[0]!
        elevator(gap.start + gap.width / 2 - 0.5, gap.y + 1.5, 1, 1, 0.75)
      }
      level.flag.y = y
      break
    }
  }

  if (length > 45) {
    const hazardTiles = new Set(level.spikes.map(spike => `${spike.x}:${spike.y}`))
    const safeGrass = level.blocks.filter(block => block.kind === 'grass' && block.solid && !block.motion
      && !hazardTiles.has(`${block.x}:${block.y}`))
    const grassAt = new Set(safeGrass.map(block => `${block.x}:${block.y}`))
    // A respawn fits wholly within a grass tile, with another safe grass tile
    // beside it. Single-tile ledges and tiles beside slime/spike-only landings
    // do not become checkpoints.
    const candidates = safeGrass.filter(block => grassAt.has(`${block.x - 1}:${block.y}`)
      || grassAt.has(`${block.x + 1}:${block.y}`)).map(block => ({ x: block.x + 0.25, y: block.y }))
    const checkpoints: NonNullable<Level['checkpoints']> = []
    let previous = 0
    for (let target = 20; target < length - 6; target = previous + 20) {
      const candidate = candidates.filter(point => point.x >= previous + 14 && point.x < length - 4)
        .sort((a, b) => Math.abs(a.x - target) - Math.abs(b.x - target) || a.x - b.x)[0]
      if (!candidate) break
      checkpoints.push({ id: `level-${number}-checkpoint-${checkpoints.length + 1}`, ...candidate })
      previous = candidate.x
    }
    if (!checkpoints.length) {
      // The final island always has at least two safe tiles. Its first tile is
      // still outside the flag trigger, so even an unusually sparse course has
      // a useful recovery point without creating a narrow landing.
      const candidate = candidates.find(point => point.x >= length - 3 && point.x < length - 1)
      if (candidate) checkpoints.push({ id: `level-${number}-checkpoint-1`, ...candidate })
    }
    level.checkpoints = checkpoints
  }

  return level
}
