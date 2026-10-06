import type { BlockKind, CharacterId, CombatState, GameState, Player, PlayerRun, SkinId } from '../../shared/types'
import { blockPosition, blockSize } from './physics'
import { WalkingParticles } from './particles'
import { SharedCamera } from './camera'

const colors: Record<BlockKind, string> = { grass: '#8aaa5c', dirt: '#856243', stone: '#91958c', wood: '#846840', leaf: '#446a32', slime: '#85c759', ice: '#a7c9fa', netherrack: '#79443e', 'nether-brick': '#4a2222', 'end-stone': '#dce29e', purpur: '#af88b3', scaffolding: '#e7c77b' }
type Sprite = { image: HTMLImageElement; sx?: number; sy?: number; sw?: number; sh?: number }
interface RenderOptions { character?: CharacterId; companions?: PlayerRun[]; checkpointId?: string | null; worldTime?: number; active?: boolean; combat?: CombatState; itemTarget?: { x: number; y: number; valid: boolean; block: boolean } }
export class Renderer {
  private ctx: CanvasRenderingContext2D
  private textures: Partial<Record<BlockKind, Sprite>> = {}
  private netherBackground: HTMLImageElement | null = null
  private endBackground: HTMLImageElement | null = null
  private skeletonImage: HTMLImageElement | null = null
  private skins: Partial<Record<SkinId, HTMLImageElement>> = {}
  private width = 1000
  private height = 510
  private camera = 0
  private tile = 64
  private nominalTile = 64
  private configuredLevel = 0
  private originY = -170
  private originX = 0
  private baseY = -170
  private cameraLift = 0
  private cameraSnap = true
  private lastPlayerX = 0
  private lastPlayerY = 0
  private dpr = 1
  private dust = new WalkingParticles()
  private lastWorldTime: number | null = null
  private sharedCamera = new SharedCamera()
  private lastDrawTime: number | null = null
  constructor(private canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')! }
  async load() {
    await Promise.all(['grass', 'dirt', 'stone', 'slime', 'ice', 'tree', 'netherrack', 'nether-brick', 'nether-background', 'end-stone', 'purpur', 'end-background', 'skeleton'].map(async name => {
      const image = new Image(); image.src = `/textures/${name === 'skeleton' ? 'skeleton-cutout' : name}.png`; await image.decode()
      if (name === 'nether-background') this.netherBackground = image
      else if (name === 'end-background') this.endBackground = image
      else if (name === 'skeleton') this.skeletonImage = image
      else if (name === 'tree') {
        this.textures.wood = { image, sx: 229, sy: 216, sw: 28, sh: 28 }
        this.textures.leaf = { image, sx: 200, sy: 157, sw: 28, sh: 28 }
      } else this.textures[name as BlockKind] = { image }
    }))
    await Promise.all(['dream', 'skeppy'].map(async name => {
      const image = new Image(); image.src = `/skins/${name}-sheet.png`; await image.decode()
      this.skins[name as SkinId] = image
    }))
  }
  resize() {
    const bounds = this.canvas.getBoundingClientRect()
    if (bounds.width < 1 || bounds.height < 1) return
    this.width = bounds.width; this.height = bounds.height
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = false
    this.nominalTile = this.width < 600 ? 44 : this.width < 900 ? 56 : 68
    this.tile = this.nominalTile
    this.configuredLevel = 0
    this.cameraSnap = true
    this.sharedCamera.reset()
    this.baseY = this.height - this.tile * 11.7
    this.originY = this.baseY
  }
  resetCamera() { this.camera = 0; this.cameraLift = 0; this.configuredLevel = 0; this.cameraSnap = true; this.dust.reset(); this.lastWorldTime = null; this.sharedCamera.reset(); this.lastDrawTime = null }
  worldPoint(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect()
    return { x: ((clientX - bounds.left) * this.width / bounds.width - this.originX) / this.tile,
      y: ((clientY - bounds.top) * this.height / bounds.height - this.originY) / this.tile }
  }
  private rect(x: number, y: number, w: number, h: number, fill: string) { this.ctx.fillStyle = fill; this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)) }
  private cloud(x: number, y: number, scale: number, opacity: number) {
    this.ctx.save(); this.ctx.globalAlpha = opacity
    const s = scale
    this.rect(x, y + s * 12, s * 96, s * 18, '#ffffff')
    this.rect(x + s * 15, y, s * 35, s * 16, '#ffffff')
    this.rect(x + s * 50, y + s * 6, s * 26, s * 15, '#ffffff')
    this.rect(x + s * 8, y + s * 30, s * 78, s * 5, '#cae0d2')
    this.ctx.restore()
  }
  private block(kind: BlockKind, x: number, y: number, size: number, width = 1, height = 1, alpha = 1) {
    const ctx = this.ctx, sprite = this.textures[kind]
    const w = size * width, h = size * height
    ctx.save(); ctx.globalAlpha = alpha
    if (kind === 'scaffolding') {
      this.rect(x, y, w, h, '#e7c77b')
      this.rect(x + size * .1, y + size * .15, w - size * .2, h - size * .22, '#b29257')
      this.rect(x + size * .1, y + size * .45, w - size * .2, size * .08, '#f4d893')
      this.rect(x, y, w, size * .12, '#f4d893'); this.rect(x + size * .45, y, size * .1, h, '#dfb660')
      ctx.restore(); return
    }
    this.rect(x, y, w, h, colors[kind])
    if (sprite) {
      for (let column = 0; column < width; column++) for (let row = 0; row < height; row++) {
        const cw = Math.min(1, width - column), rh = Math.min(1, height - row)
        ctx.drawImage(sprite.image, sprite.sx ?? 0, sprite.sy ?? 0, (sprite.sw ?? sprite.image.width) * cw, (sprite.sh ?? sprite.image.height) * rh, Math.round(x + column * size), Math.round(y + row * size), Math.ceil(size * cw), Math.ceil(size * rh))
      }
    }
    this.rect(x, y, w, 3, kind === 'grass' ? '#abd576' : 'rgba(255,255,255,.22)')
    this.rect(x + w - 3, y + 3, 3, h - 3, 'rgba(42,45,27,.14)')
    this.rect(x, y + h - 3, w, 3, 'rgba(42,45,27,.18)')
    ctx.restore()
  }
  private character(p: Player, id: CharacterId, ox: number) {
    const ctx = this.ctx, t = this.tile, skinId = p.skin ?? id, alex = skinId === 'alex'
    const skin = alex ? '#dfb18c' : '#bc8d70', hair = alex ? '#b56636' : '#46372e'
    const shirt = alex ? '#85a760' : '#40a4aa', darkShirt = alex ? '#607b46' : '#2e868e'
    const x = ox + (p.x + p.width / 2) * t, feet = this.originY + (p.y + p.height) * t
    const u = t / 32
    const stride = p.climbing ? Math.sin(p.walkTime * 12) * .5 : p.grounded && Math.abs(p.vx) > .1 ? Math.sin(p.walkTime * (p.sprinting ? 20 : p.sneaking ? 9 : 14)) * (p.sneaking ? .22 : p.sprinting ? .82 : .62) : p.grounded ? 0 : .35
    const legTop = p.sneaking ? -12 : -16, torsoTop = p.sneaking ? -22 : -29
    const torsoHeight = p.sneaking ? 10 : 14, headTop = p.sneaking ? -32 : -40
    ctx.save(); ctx.translate(Math.round(x), Math.round(feet)); ctx.scale(p.facing * u, u)
    if (p.horse) {
      if (p.sneaking) ctx.scale(1, .75)
      this.horse(p)
      ctx.translate(0, -23); ctx.scale(.68, .68)
    }
    if (this.skins[skinId]) {
      this.skinSprite(skinId, stride, p.sneaking, Boolean(p.horse))
      ctx.restore(); return
    }
    const limb = (pivotX: number, pivotY: number, width: number, height: number, angle: number, color: string, foot?: string) => {
      ctx.save(); ctx.translate(pivotX, pivotY); ctx.rotate(angle)
      this.rect(-width / 2, 0, width, height, color)
      this.rect(width / 2 - 1.5, 0, 1.5, height, 'rgba(0,0,0,.13)')
      if (foot) this.rect(-width / 2, height - 3, width, 3, foot)
      ctx.restore()
    }
    limb(-1, legTop, 5, -legTop, -stride, alex ? '#584735' : '#33417d', '#40484a')
    limb(-1, torsoTop, alex ? 3 : 5, torsoHeight, stride, skin)
    if (alex) { this.rect(-5, headTop + 6, 3, 12, hair); this.rect(-5, headTop + 16, 2, 3, '#8e4e2a') }
    this.rect(-4, torsoTop, 8, torsoHeight, shirt); this.rect(2, torsoTop, 2, torsoHeight, darkShirt)
    this.rect(-4, torsoTop, 8, 4, alex ? '#98b776' : '#4fbbc1'); this.rect(-2, legTop, 5, 2, darkShirt)
    limb(2, legTop, 5, -legTop, stride, alex ? '#776048' : '#454e93', '#475353')
    ctx.save(); ctx.translate(2, torsoTop + 2); ctx.rotate(-stride + (p.sneaking ? -.25 : 0))
    const armWidth = alex ? 3 : 5
    this.rect(-armWidth / 2, 0, armWidth, 5, shirt); this.rect(-armWidth / 2, 5, armWidth, 9, skin); this.rect(armWidth / 2 - 1, 5, 1, 9, alex ? '#bc9070' : '#a77c61')
    ctx.restore()
    this.rect(-5, headTop, 11, 11, skin)
    this.rect(-5, headTop, 11, 4, hair); this.rect(-5, headTop + 4, 3, 4, hair)
    this.rect(4, headTop + 4, 2, 2, alex ? hair : '#704d37'); this.rect(2, headTop + 5, 3, 2, '#eee8d7'); this.rect(4, headTop + 5, 1, 2, alex ? '#577647' : '#5765a0')
    this.rect(3, headTop + 8, 3, 1, alex ? '#b27b5d' : '#93644b')
    if (!alex) { this.rect(1, headTop + 9, 5, 2, '#674638'); this.rect(2, headTop + 9, 3, 1, '#ac7a5c') }
    else this.rect(3, headTop + 9, 2, 1, '#c28665')
    ctx.restore()
  }
  private horse(p: Player) {
    const ctx = this.ctx
    const gallop = p.grounded && Math.abs(p.vx) > .1 ? Math.sin(p.walkTime * 22) * .45 : 0
    for (const [x, angle] of [[-9, gallop], [8, -gallop]]) {
      ctx.save(); ctx.translate(x!, -13); ctx.rotate(angle!)
      this.rect(-2, 0, 4, 13, '#70482d'); this.rect(-2, 10, 4, 3, '#302c28'); ctx.restore()
    }
    this.rect(-13, -26, 25, 14, '#95643f'); this.rect(-13, -26, 25, 3, '#b27b4b')
    this.rect(-16, -23, 3, 17, '#382a22'); this.rect(7, -34, 7, 16, '#95643f')
    this.rect(9, -37, 12, 10, '#a36d44'); this.rect(15, -30, 8, 6, '#b4845e')
    this.rect(9, -41, 3, 6, '#70482d'); this.rect(6, -36, 3, 16, '#382a22')
    this.rect(17, -35, 2, 2, '#171d1c'); this.rect(18, -29, 5, 2, '#453426')
    this.rect(-6, -27, 13, 4, '#5b3528'); this.rect(-2, -23, 3, 11, '#c09b53')
  }
  private skinSprite(id: SkinId, stride: number, crouching: boolean, riding = false) {
    const image = this.skins[id]!, ctx = this.ctx
    // Use the second, right-facing side view from each supplied reference sheet.
    // character() mirrors it when moving left; flight and riding reuse these parts.
    const sheet = id === 'dream' ? { head: [205, 30, 70, 70], body: [223, 100, 35, 110], arm: [223, 100, 35, 110], leg: [223, 210, 35, 102] }
      : { head: [201, 25, 80, 75], body: [223, 100, 35, 106], arm: [223, 100, 35, 106], leg: [223, 206, 35, 105] }
    const drawPart = (source: number[], x: number, y: number, width: number, height: number) =>
      ctx.drawImage(image, source[0]!, source[1]!, source[2]!, source[3]!, x, y, width, height)
    const legTop = riding ? -9 : crouching ? -12 : -16, torsoTop = legTop - (crouching ? 10 : 14)
    const limb = (source: number[], x: number, y: number, width: number, height: number, angle: number) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); drawPart(source, -width / 2, 0, width, height); ctx.restore()
    }
    limb(sheet.leg, -1, legTop, 5, -legTop, riding ? -.6 : -stride)
    limb(sheet.arm, -1, torsoTop, 5, 14, stride)
    drawPart(sheet.body, -2.5, torsoTop, 5, legTop - torsoTop)
    limb(sheet.leg, 1, legTop, 5, -legTop, riding ? .6 : stride)
    limb(sheet.arm, 1, torsoTop, 5, 14, -stride)
    drawPart(sheet.head, -5.5, torsoTop - 11, 11, 11)
  }
  private flyingCharacter(p: Player, id: CharacterId, ox: number, time: number, active: boolean) {
    const ctx = this.ctx, t = this.tile, skinId = p.skin ?? id, alex = skinId === 'alex', u = t / 32
    const x = ox + (p.x + p.width / 2) * t, y = this.originY + (p.y + p.height / 2) * t
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(Math.max(-.3, Math.min(.3, p.vy * .03))); ctx.scale(u, u)
    if (active) for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = .12 + (3 - i) * .06
      this.rect(-22 - i * 8 - (time * (p.vx > 6 ? 15 : 9)) % 7, -2 + (i % 2) * 4, p.vx > 6 ? 7 : 4, 2, '#ffffff')
    }
    ctx.globalAlpha = 1
    const flap = Math.sin(time * 9) * 1.5
    ctx.fillStyle = '#8890a6'; ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(-17, -12 - flap); ctx.lineTo(-14, 0); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill()
    this.rect(-13, -8 - flap, 8, 2, '#bdc3d1'); this.rect(-9, -5 - flap, 10, 2, '#a9b0c3')
    if (!this.skins[skinId]) {
    this.rect(-16, -3, 10, 5, alex ? '#746047' : '#454e93'); this.rect(-17, -3, 3, 5, '#465052')
    this.rect(-7, -5, 17, 10, alex ? '#87a762' : '#42a6ad'); this.rect(-7, 3, 17, 2, alex ? '#668246' : '#2e838a')
    this.rect(4, 3, 10, 3, alex ? '#dfb18c' : '#bc8d70')
    this.rect(8, -7, 10, 10, alex ? '#dfb18c' : '#bc8d70'); this.rect(8, -7, 10, 3, alex ? '#b56636' : '#46372e')
    this.rect(8, -4, 2, 4, alex ? '#b56636' : '#46372e'); this.rect(15, -3, 3, 2, '#eee8d7'); this.rect(17, -3, 1, 2, alex ? '#577647' : '#5765a0')
    this.rect(16, 1, 2, 1, '#946b53')
    }
    if (this.skins[skinId]) {
      // Reuse the chosen skin in flight, rotated into the horizontal glide pose.
      ctx.save(); ctx.translate(-17, 0); ctx.rotate(Math.PI / 2); ctx.scale(.8, .8)
      this.skinSprite(skinId, 0, false); ctx.restore()
    }
    ctx.fillStyle = '#a5acc0'; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-16, 11 + flap); ctx.lineTo(-1, 7); ctx.lineTo(7, 2); ctx.closePath(); ctx.fill()
    this.rect(-9, 4 + flap / 2, 7, 2, '#c4cad7'); this.rect(-11, 7 + flap / 2, 6, 2, '#e0e3e8')
    ctx.restore()
  }
  draw(game: GameState, now: number, options: RenderOptions = {}) {
    const worldTime = options.worldTime ?? game.time, character = options.character ?? 'steve'
    const flight = game.level.kind === 'elytra'
    const nether = game.level.theme === 'nether'
    const end = game.level.theme === 'end'
    const actors = [...(options.companions ?? []).map(run => ({ id: run.id, state: run.state })), { id: character, state: game }]
    const active = options.active ?? game.status === 'playing'
    this.dust.update(actors.map(actor => ({ id: actor.id, player: actor.state.player, status: actor.state.status })), this.lastWorldTime === null ? 0 : worldTime - this.lastWorldTime, active)
    this.lastWorldTime = worldTime
    if (this.configuredLevel !== game.level.number) {
      if (flight && game.level.flight) {
        const { ceiling, floor } = game.level.flight
        this.tile = Math.min(this.nominalTile, Math.floor((this.height - 64) / (floor - ceiling)))
        this.baseY = (this.height - (floor - ceiling) * this.tile) / 2 - ceiling * this.tile
      } else {
      const start = game.level.blocks.filter(block => block.x < 4 && !block.motion
        && (game.level.layout !== 'vertical' || block.y >= game.level.spawn.y))
      const bottom = Math.max(...start.map(block => block.y + blockSize(block).height))
      const top = Math.min(...start.map(block => block.y))
      this.tile = Math.min(this.nominalTile, Math.floor((this.height - 80) / (bottom - top)))
      this.baseY = this.height - 40 - bottom * this.tile
      }
      this.configuredLevel = game.level.number
    }
    const ctx = this.ctx, w = this.width, h = this.height
    const dt = this.lastDrawTime === null ? 0 : Math.min(.1, Math.max(0, (now - this.lastDrawTime) / 1000))
    this.lastDrawTime = now
    let ox: number
    if (actors.length > 1) {
      const subjects = actors.map(actor => {
        if (actor.state.status !== 'dead') return { player: actor.state.player, status: actor.state.status }
        const saved = actor.id === character ? (game.level.checkpoints ?? []).find(cp => cp.id === options.checkpointId) : options.companions?.find(run => run.id === actor.id)?.checkpoint
        const spawn = saved ?? actor.state.level.spawn
        return { player: { ...actor.state.player, x: spawn.x, y: spawn.y - actor.state.player.height }, status: 'playing' as const, predicted: true }
      })
      // Prepare for a fallen player's respawn during their recovery delay.
      const shared = this.sharedCamera.update(game.level, subjects, w, h, this.nominalTile, dt)
      this.tile = shared.tile; this.originY = shared.originY; ox = shared.originX
      this.camera = -ox / this.tile
    } else {
      const t = this.tile
      const snap = this.cameraSnap || Math.abs(game.player.x - this.lastPlayerX) > 4.5 || Math.abs(game.player.y - this.lastPlayerY) > 2.5
      const lift = flight ? 0 : Math.max(0, Math.min(215, h * .4) - (this.baseY + game.player.y * t))
      this.cameraLift = snap ? lift : this.cameraLift + (lift - this.cameraLift) * .16
      this.originY = this.baseY + this.cameraLift
      const visible = w / t, centerOffset = Math.max(1.1, (visible - (game.level.width ?? game.level.length)) / 2)
      const target = Math.max(0, Math.min((game.level.width ?? game.level.length) - visible + 2.2, game.player.x - visible * .36))
      this.camera = snap ? Math.max(0, target) : this.camera + (Math.max(0, target) - this.camera) * .10
      ox = ((game.level.width ?? game.level.length) < visible - 2 ? centerOffset : 1.1) * t - this.camera * t
    }
    const t = this.tile
    this.originX = ox
    this.cameraSnap = false; this.lastPlayerX = game.player.x; this.lastPlayerY = game.player.y
    ctx.clearRect(0, 0, w, h)
    const visible = w / t
    if (end) {
      this.rect(0, 0, w, h, '#302638')
      if (this.endBackground) ctx.drawImage(this.endBackground, 0, 0, w, h)
      this.rect(0, 0, w, h, 'rgba(30,20,40,.28)')
      for (let i = 0; i < 16; i++) {
        const moteX = (i * 109 + now * .004) % w
        const moteY = (i * 79 + now * .006) % h
        this.rect(moteX, moteY, 2, 2, i % 2 ? '#c49add' : '#e8d3f5')
      }
    } else if (nether) {
      this.rect(0, 0, w, h, '#290604')
      if (this.netherBackground) ctx.drawImage(this.netherBackground, 0, 0, w, h)
      this.rect(0, 0, w, h, 'rgba(29,3,2,.38)')
      for (let i = 0; i < 18; i++) {
        const emberX = (i * 97 + now * .008) % w
        const emberY = h - ((i * 61 + now * .012) % h)
        this.rect(emberX, emberY, 2, 2, i % 2 ? '#ee874a' : '#ffcb70')
      }
    } else {
    const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, flight ? '#dfe6f4' : '#d8eee6'); sky.addColorStop(.7, flight ? '#e9ebf4' : '#e6f1e4'); sky.addColorStop(1, flight ? '#f3efdf' : '#f1f3d8')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h)
    // Clouds and distant islands drift slowly behind the fixed, uneditable course.
    for (let i = 0; i < 7; i++) {
      const x = (((i * 237 + w - this.camera * t * .18 + now * .003) % (w + 190) + w + 190) % (w + 190)) - 110
      this.cloud(x, 55 + (i * 73) % 190, .6 + (i % 3) * .3, .52 + (i % 2) * .2)
    }
    ctx.save(); ctx.globalAlpha = .17
    for (let i = 0; i < 5; i++) {
      const x = (((i * 340 + 70 - this.camera * t * .1) % (w + 230) + w + 230) % (w + 230)) - 100
      const y = h * .77 + (i % 3) * 19
      this.rect(x, y, 145, 9, '#7fa893'); this.rect(x + 12, y + 9, 120, 22, '#9fb3a0'); this.rect(x + 31, y + 31, 70, 14, '#9fb3a0')
      this.rect(x + 94, y - 25, 6, 25, '#7fa893'); this.rect(x + 81, y - 39, 32, 21, '#7fa893')
    }
    ctx.restore()
    }
    if (flight && game.level.flight) {
      ctx.save(); ctx.strokeStyle = 'rgba(125,137,161,.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 8])
      for (const boundary of [game.level.flight.ceiling, game.level.flight.floor]) {
        const y = this.originY + boundary * t; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
      ctx.restore()
    }
    // Ground shadows add depth without changing the supplied pixel textures.
    game.level.blocks.filter(b => b.solid).forEach(b => {
      const pos = blockPosition(b, worldTime), x = ox + pos.x * t, y = this.originY + pos.y * t
      const size = blockSize(b)
      if (x > -t * 4 && x < w + t) this.rect(x + 7, y + 9, t * size.width, t * size.height, 'rgba(71,94,65,.075)')
    })
    for (const b of game.level.blocks) {
      const pos = blockPosition(b, worldTime), x = ox + pos.x * t, y = this.originY + pos.y * t
      const size = blockSize(b)
      if (x + size.width * t < -t || x > w + t || y > h + t) continue
      if (b.motion) {
        ctx.save(); ctx.strokeStyle = 'rgba(72,90,64,.24)'; ctx.lineWidth = 2; ctx.setLineDash([3, 6])
        ctx.beginPath(); ctx.moveTo(ox + (b.x - (b.motion.axis === 'x' ? b.motion.range : 0) + size.width / 2) * t, this.originY + (b.y - (b.motion.axis === 'y' ? b.motion.range : 0) + size.height / 2) * t)
        ctx.lineTo(ox + (b.x + (b.motion.axis === 'x' ? b.motion.range : 0) + size.width / 2) * t, this.originY + (b.y + (b.motion.axis === 'y' ? b.motion.range : 0) + size.height / 2) * t); ctx.stroke(); ctx.restore()
      }
      if (b.color) this.rect(x, y, t * size.width, t * size.height, b.color)
      else this.block(b.kind, x, y, t, size.width, size.height)
      if (b.kind === 'slime') {
        const pulse = .5 + .5 * Math.sin(now * .004)
        ctx.save(); ctx.strokeStyle = `rgba(108,170,52,${.22 + pulse * .25})`; ctx.lineWidth = 2
        ctx.strokeRect(x - 4 - pulse * 2, y - 4 - pulse * 2, t + 8 + pulse * 4, t + 8 + pulse * 4); ctx.restore()
        this.rect(x + t * .24, y + t * .42, t * .12, t * .12, 'rgba(55,111,41,.48)')
        this.rect(x + t * .64, y + t * .42, t * .12, t * .12, 'rgba(55,111,41,.48)')
        this.rect(x + t * .42, y + t * .66, t * .16, t * .07, 'rgba(55,111,41,.35)')
        if (game.status === 'ready') this.label('5× JUMP', x + t / 2, y - 18, '#557b34', '#f1f7df')
      }
    }
    for (const ladder of game.level.ladders ?? []) {
      const x = ox + ladder.x * t, y = this.originY + ladder.y * t
      const width = (ladder.width ?? .84) * t, height = ladder.height * t
      if (x + width < 0 || x > w) continue
      this.rect(x + width * .08, y, Math.max(3, t * .1), height, '#bd8748')
      this.rect(x + width * .78, y, Math.max(3, t * .1), height, '#bd8748')
      for (let rung = .12; rung < ladder.height; rung += .35) {
        this.rect(x + width * .08, y + rung * t, width * .8, Math.max(3, t * .09), '#e5b66d')
        this.rect(x + width * .08, y + rung * t + 3, width * .8, 2, '#885728')
      }
      if (game.status === 'ready') this.label('↑ CLIMB ↓', x + width / 2, y - 12, '#6b4229', '#ffdf9b')
    }
    for (const hazard of game.level.hazards ?? []) {
      this.rect(ox + hazard.x * t, this.originY + hazard.y * t, hazard.width * t, hazard.height * t, hazard.color)
    }
    for (const spike of game.level.spikes) {
      const x = ox + spike.x * t, y = this.originY + spike.y * t
      this.rect(x + t * .06, y - 4, t * .88, 5, '#697474')
      for (let i = 0; i < 3; i++) {
        const sx = x + t * (.06 + i * .29), sw = t * .29
        ctx.fillStyle = '#788784'; ctx.beginPath(); ctx.moveTo(sx, y - 3); ctx.lineTo(sx + sw / 2, y - t * .38); ctx.lineTo(sx + sw, y - 3); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#c9d6c9'; ctx.beginPath(); ctx.moveTo(sx + 2, y - 5); ctx.lineTo(sx + sw / 2, y - t * .38); ctx.lineTo(sx + sw / 2, y - 5); ctx.closePath(); ctx.fill()
      }
    }
    for (const [index, checkpoint] of (game.level.checkpoints ?? []).entries()) {
      const x = ox + (checkpoint.x + (flight ? .55 : .24)) * t, y = this.originY + (checkpoint.y - (flight ? .3 : 0)) * t
      if (x < -t || x > w + t) continue
      const savedBy = [options.checkpointId === checkpoint.id ? character : null, ...(options.companions ?? []).filter(run => run.checkpoint?.id === checkpoint.id).map(run => run.id)].filter(Boolean)
      const active = savedBy.length > 0
      const checkpointLabel = `${active ? '✓ ' : ''}CP ${index + 1}${actors.length > 1 && active ? ` · ${savedBy.map(id => id === 'steve' ? 'S' : 'A').join('+')}` : ''}`
      if (flight) {
        ctx.save(); ctx.strokeStyle = active ? '#59a788' : '#88baad'; ctx.lineWidth = 3; ctx.setLineDash(active ? [] : [5, 5])
        ctx.beginPath(); ctx.ellipse(x, y, t * .46, t * 1.05, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
        this.label(checkpointLabel, x, y - t * 1.2, '#518b75', '#f3fff3')
        continue
      }
      this.rect(x - 2, y - t * 1.2, 4, t * 1.2, '#7e8c74')
      this.rect(x + 2, y - t * 1.15, t * .42, t * .34, active ? '#54a583' : '#80b8ab')
      this.rect(x - t * .22, y - 3, t * .44, 4, active ? '#6dbb8b' : '#b1d7bd')
      this.label(checkpointLabel, x + 5, y - t * 1.42, '#518b75', '#f3fff3')
    }
    const flagX = ox + game.level.flag.x * t, flagY = this.originY + game.level.flag.y * t
    this.rect(flagX - 3, flagY - t * 1.63, 5, t * 1.63, '#7c6c52')
    this.rect(flagX - 4, flagY - t * 1.65, 7, 6, '#e8d2a2')
    const wave = Math.round(Math.sin(now * .005) * 3)
    ctx.fillStyle = '#dc6350'; ctx.beginPath(); ctx.moveTo(flagX + 2, flagY - t * 1.56); ctx.lineTo(flagX + t * .63, flagY - t * 1.56 + wave); ctx.lineTo(flagX + t * .49, flagY - t * 1.34 + wave); ctx.lineTo(flagX + t * .63, flagY - t * 1.12 + wave); ctx.lineTo(flagX + 2, flagY - t * 1.12); ctx.closePath(); ctx.fill()
    this.rect(flagX + 3, flagY - t * 1.56, 4, t * .44, '#b74839')
    if (game.status === 'ready' && flagY >= 0 && flagY < h + t * 2) this.label('FINISH', flagX + 10, Math.max(16, flagY - t * 1.72), '#99774d', '#fff8e6')
    // Small pixel particles around the boost and finish.
    if (game.status === 'won') for (let i = 0; i < 32; i++) {
      const age = (now * .0003 + i * .071) % 1
      this.rect(flagX + Math.sin(i * 24) * t * 2.8 * age, flagY - t * 2.5 + age * t * 3, 5, 5, ['#e7b653', '#83a654', '#dc7863', '#f8f7e5'][i % 4]!)
    }
    for (const particle of this.dust.particles) {
      ctx.save(); ctx.globalAlpha = (1 - particle.age / particle.life) * .85
      this.rect(ox + particle.x * t, this.originY + particle.y * t, Math.max(2, particle.size * t), Math.max(2, particle.size * t), particle.color); ctx.restore()
    }
    if (options.combat) {
      const skeleton = options.combat.skeleton
      const x = ox + (skeleton.x + skeleton.width / 2) * t, y = this.originY + skeleton.y * t
      if (skeleton.hearts > 0 && x >= -t * .5 && x <= w + t * .5) {
        if (this.skeletonImage) {
          ctx.save(); ctx.translate(x, y); ctx.scale(skeleton.facing === -1 ? 1 : -1, 1)
          ctx.drawImage(this.skeletonImage, -t * .49, 0, t * .98, skeleton.height * t)
          ctx.restore()
        }
        this.hearts(skeleton.hearts, 15, x, y - this.heartHeight(15) - 8)
        this.label(`SKELLY · ${skeleton.hearts}/15`, x, y - this.heartHeight(15) - 30, '#5c4844', '#fff5e6')
      }
      for (const arrow of options.combat.arrows) {
        ctx.save(); ctx.translate(ox + arrow.x * t, this.originY + arrow.y * t)
        ctx.rotate(Math.atan2(arrow.vy, arrow.vx))
        this.rect(-t * .3, -1, t * .3, 3, '#8d643d')
        this.rect(-t * .3, -4, 4, 9, '#e6dfcb')
        ctx.fillStyle = '#727b7d'; ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill()
        ctx.restore()
      }
    }
    for (const actor of actors) {
      const p = actor.state.player, x = ox + (p.x + p.width / 2) * t
      const heartOffset = actor.id === 'alex' && actor.state.combat && actors.some(other => other.id !== actor.id
        && Math.abs(other.state.player.x - p.x) * t < 110 * this.heartSize() && Math.abs(other.state.player.y - p.y) * t < 45) ? this.heartHeight(20) + 30 : 0
      if (x < -t || x > w + t || (actor.state.status === 'dead' && Math.sin(now * .012) <= -.4)) continue
      if (flight) this.flyingCharacter(p, actor.id, ox, worldTime, active && actor.state.status === 'playing')
      else this.character(p, actor.id, ox)
      if (actor.state.combat) {
        const fighter = actor.state.combat
        ctx.save(); ctx.translate(x + p.facing * t * .22, this.originY + (p.y + p.height * .6) * t)
        ctx.scale(p.facing, 1); ctx.rotate(fighter.swing > 0 ? -.8 + (1 - fighter.swing / .18) * 1.5 : -.7)
        this.rect(0, -2, t * .15, 5, '#6c4b2e')
        this.rect(t * .12, -7, 4, 15, '#484b4a')
        this.rect(t * .17, -4, t * .43, 8, '#727b7d')
        this.rect(t * .17, -4, t * .43, 2, '#bdc5bd')
        this.rect(t * .6, -2, 4, 4, '#bdc5bd'); ctx.restore()
        this.hearts(fighter.hearts, 20, x, this.originY + p.y * t - this.heartHeight(20) - 8 - heartOffset)
      }
      if (options.companions?.length || game.status === 'ready' || actor.state.combat) this.label(`${actor.id.toUpperCase()}${!options.companions?.length && p.skin && p.skin !== actor.id ? ` · ${p.skin.toUpperCase()}` : ''}${p.horse ? flight ? ' · HORSE IN STABLE' : ' · HORSE' : ''}${actor.state.combat ? ` · ${actor.state.combat.hearts}/20` : ''}${actor.state.status === 'won' ? ' ✓' : ''}`, x, this.originY + p.y * t - (actor.state.combat ? this.heartHeight(20) + 30 + heartOffset : 18), actor.id === 'alex' ? '#a27345' : '#487a88', '#ffffff')
    }
    // Screen-edge fog helps the long courses fade naturally into the distance.
    if (options.itemTarget) {
      const target = options.itemTarget
      ctx.save(); ctx.strokeStyle = target.valid ? '#4e9c64' : '#d45b44'; ctx.fillStyle = target.valid ? '#4e9c6433' : '#d45b4433'; ctx.lineWidth = 2
      const x = ox + target.x * t, y = this.originY + target.y * t
      if (target.block) { ctx.fillRect(x, y, t, t); ctx.strokeRect(x, y, t, t) }
      else { ctx.beginPath(); ctx.arc(x, y, t * .25, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
      ctx.restore()
    }
    if ((game.level.width ?? game.level.length) > visible) {
      const fog = ctx.createLinearGradient(w - 45, 0, w, 0); fog.addColorStop(0, end ? 'rgba(30,20,40,0)' : nether ? 'rgba(29,3,2,0)' : 'rgba(230,241,228,0)'); fog.addColorStop(1, end ? 'rgba(30,20,40,.6)' : nether ? 'rgba(29,3,2,.65)' : 'rgba(230,241,228,.6)'); ctx.fillStyle = fog; ctx.fillRect(w - 45, 0, 45, h)
    }
  }
  private heartSize() { return this.tile >= 48 ? 2 : 1 }
  private heartHeight(maximum: number) { return (Math.ceil(maximum / 10) * 11 - 2) * this.heartSize() }
  private hearts(hearts: number, maximum: number, x: number, y: number) {
    // Nine-pixel outlines and shaded red interiors match the full/half references.
    const pixels = ['..##.##..', '.#rr#rr#.', '#rsrrrsr#', '#rssrssr#', '#srsrrsr#', '.#srrrs#.', '..#srs#..', '...#s#...', '....#....']
    const size = this.heartSize(), step = 11 * size, width = 10 * step - 2 * size
    const left = Math.max(4, Math.min(this.width - width - 4, x - width / 2))
    for (let i = 0; i < maximum; i++) for (let row = 0; row < pixels.length; row++) {
      for (let col = 0; col < 9; col++) {
        const pixel = pixels[row]![col]
        if (pixel === '.') continue
        const full = hearts - i >= 1, half = hearts - i >= .5 && col <= 4
        const color = pixel === '#' ? '#090000' : !(full || half) ? '#404040'
          : pixel === 's' ? '#960a00' : row >= 6 ? '#c5150a' : '#ff0800'
        this.rect(left + (i % 10) * step + col * size, y + Math.floor(i / 10) * step + row * size, size, size, color)
      }
    }
  }
  private label(text: string, x: number, y: number, color: string, background: string) {
    const ctx = this.ctx; ctx.font = '700 10px "Trebuchet MS", sans-serif'; const width = ctx.measureText(text).width + 17
    ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(x - width / 2, y - 14, width, 23, 6); ctx.fill()
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 1)
  }
}
