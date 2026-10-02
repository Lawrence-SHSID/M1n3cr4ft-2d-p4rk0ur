import type { BlockKind, CharacterId, GameState, Player, PlayerRun } from '../../shared/types'
import { blockPosition, blockSize } from './physics'
import { WalkingParticles } from './particles'

const colors: Record<BlockKind, string> = { grass: '#8aaa5c', dirt: '#856243', stone: '#91958c', wood: '#846840', leaf: '#446a32', slime: '#85c759' }
type Sprite = { image: HTMLImageElement; sx?: number; sy?: number; sw?: number; sh?: number }
interface RenderOptions { character?: CharacterId; companions?: PlayerRun[]; checkpointId?: string | null; worldTime?: number; active?: boolean }
export class Renderer {
  private ctx: CanvasRenderingContext2D
  private textures: Partial<Record<BlockKind, Sprite>> = {}
  private width = 1000
  private height = 510
  private camera = 0
  private tile = 64
  private nominalTile = 64
  private configuredLevel = 0
  private originY = -170
  private baseY = -170
  private cameraLift = 0
  private cameraSnap = true
  private lastPlayerX = 0
  private lastPlayerY = 0
  private dpr = 1
  private dust = new WalkingParticles()
  private lastWorldTime: number | null = null
  constructor(private canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')! }
  async load() {
    await Promise.all(['grass', 'dirt', 'stone', 'slime', 'tree'].map(async name => {
      const image = new Image(); image.src = `/textures/${name}.png`; await image.decode()
      if (name === 'tree') {
        this.textures.wood = { image, sx: 229, sy: 216, sw: 28, sh: 28 }
        this.textures.leaf = { image, sx: 200, sy: 157, sw: 28, sh: 28 }
      } else this.textures[name as BlockKind] = { image }
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
    this.baseY = this.height - this.tile * 11.7
    this.originY = this.baseY
  }
  resetCamera() { this.camera = 0; this.cameraLift = 0; this.configuredLevel = 0; this.cameraSnap = true; this.dust.reset(); this.lastWorldTime = null }
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
    const ctx = this.ctx, t = this.tile, alex = id === 'alex'
    const skin = alex ? '#dfb18c' : '#bc8d70', hair = alex ? '#b56636' : '#46372e'
    const shirt = alex ? '#85a760' : '#40a4aa', darkShirt = alex ? '#607b46' : '#2e868e'
    const x = ox + (p.x + p.width / 2) * t, feet = this.originY + (p.y + p.height) * t
    const u = t / 32
    const stride = p.grounded && Math.abs(p.vx) > .1 ? Math.sin(p.walkTime * (p.sprinting ? 20 : p.sneaking ? 9 : 14)) * (p.sneaking ? .22 : p.sprinting ? .82 : .62) : p.grounded ? 0 : .35
    const legTop = p.sneaking ? -12 : -16, torsoTop = p.sneaking ? -22 : -29
    const torsoHeight = p.sneaking ? 10 : 14, headTop = p.sneaking ? -32 : -40
    ctx.save(); ctx.translate(Math.round(x), Math.round(feet)); ctx.scale(p.facing * u, u)
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
  private flyingCharacter(p: Player, id: CharacterId, ox: number, time: number, active: boolean) {
    const ctx = this.ctx, t = this.tile, alex = id === 'alex', u = t / 32
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
    this.rect(-16, -3, 10, 5, alex ? '#746047' : '#454e93'); this.rect(-17, -3, 3, 5, '#465052')
    this.rect(-7, -5, 17, 10, alex ? '#87a762' : '#42a6ad'); this.rect(-7, 3, 17, 2, alex ? '#668246' : '#2e838a')
    this.rect(4, 3, 10, 3, alex ? '#dfb18c' : '#bc8d70')
    this.rect(8, -7, 10, 10, alex ? '#dfb18c' : '#bc8d70'); this.rect(8, -7, 10, 3, alex ? '#b56636' : '#46372e')
    this.rect(8, -4, 2, 4, alex ? '#b56636' : '#46372e'); this.rect(15, -3, 3, 2, '#eee8d7'); this.rect(17, -3, 1, 2, alex ? '#577647' : '#5765a0')
    this.rect(16, 1, 2, 1, '#946b53')
    ctx.fillStyle = '#a5acc0'; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-16, 11 + flap); ctx.lineTo(-1, 7); ctx.lineTo(7, 2); ctx.closePath(); ctx.fill()
    this.rect(-9, 4 + flap / 2, 7, 2, '#c4cad7'); this.rect(-11, 7 + flap / 2, 6, 2, '#e0e3e8')
    ctx.restore()
  }
  draw(game: GameState, now: number, options: RenderOptions = {}) {
    const worldTime = options.worldTime ?? game.time, character = options.character ?? 'steve'
    const flight = game.level.kind === 'elytra'
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
      const start = game.level.blocks.filter(block => block.x < 4 && !block.motion)
      const bottom = Math.max(...start.map(block => block.y + blockSize(block).height))
      const top = Math.min(...start.map(block => block.y))
      this.tile = Math.min(this.nominalTile, Math.floor((this.height - 80) / (bottom - top)))
      this.baseY = this.height - 40 - bottom * this.tile
      }
      this.configuredLevel = game.level.number
    }
    const ctx = this.ctx, w = this.width, h = this.height, t = this.tile
    const snap = this.cameraSnap || Math.abs(game.player.x - this.lastPlayerX) > 4.5 || Math.abs(game.player.y - this.lastPlayerY) > 2.5
    // Follow boosted jumps upward so Steve stays visible at the five-block apex.
    const lift = flight ? 0 : Math.max(0, Math.min(215, h * .4) - (this.baseY + game.player.y * t))
    this.cameraLift = snap ? lift : this.cameraLift + (lift - this.cameraLift) * .16
    this.originY = this.baseY + this.cameraLift
    ctx.clearRect(0, 0, w, h)
    const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, flight ? '#dfe6f4' : '#d8eee6'); sky.addColorStop(.7, flight ? '#e9ebf4' : '#e6f1e4'); sky.addColorStop(1, flight ? '#f3efdf' : '#f1f3d8')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h)
    const visible = w / t, centerOffset = Math.max(1.1, (visible - game.level.length) / 2)
    const target = Math.max(0, Math.min(game.level.length - visible + 2.2, game.player.x - visible * .36))
    this.camera = snap ? Math.max(0, target) : this.camera + (Math.max(0, target) - this.camera) * .10
    this.cameraSnap = false; this.lastPlayerX = game.player.x; this.lastPlayerY = game.player.y
    const ox = (game.level.length < visible - 2 ? centerOffset : 1.1) * t - this.camera * t
    // Clouds and distant islands drift slowly behind the fixed, uneditable course.
    for (let i = 0; i < 7; i++) {
      const x = ((i * 237 + w - this.camera * t * .18 + now * .003) % (w + 190)) - 110
      this.cloud(x, 55 + (i * 73) % 190, .6 + (i % 3) * .3, .52 + (i % 2) * .2)
    }
    ctx.save(); ctx.globalAlpha = .17
    for (let i = 0; i < 5; i++) {
      const x = ((i * 340 + 70 - this.camera * t * .1) % (w + 230)) - 100
      const y = h * .77 + (i % 3) * 19
      this.rect(x, y, 145, 9, '#7fa893'); this.rect(x + 12, y + 9, 120, 22, '#9fb3a0'); this.rect(x + 31, y + 31, 70, 14, '#9fb3a0')
      this.rect(x + 94, y - 25, 6, 25, '#7fa893'); this.rect(x + 81, y - 39, 32, 21, '#7fa893')
    }
    ctx.restore()
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
      this.block(b.kind, x, y, t, size.width, size.height)
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
      const active = options.checkpointId === checkpoint.id
      if (flight) {
        ctx.save(); ctx.strokeStyle = active ? '#59a788' : '#88baad'; ctx.lineWidth = 3; ctx.setLineDash(active ? [] : [5, 5])
        ctx.beginPath(); ctx.ellipse(x, y, t * .46, t * 1.05, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
        this.label(`${active ? '✓ ' : ''}CP ${index + 1}`, x, y - t * 1.2, '#518b75', '#f3fff3')
        continue
      }
      this.rect(x - 2, y - t * 1.2, 4, t * 1.2, '#7e8c74')
      this.rect(x + 2, y - t * 1.15, t * .42, t * .34, active ? '#54a583' : '#80b8ab')
      this.rect(x - t * .22, y - 3, t * .44, 4, active ? '#6dbb8b' : '#b1d7bd')
      this.label(`${active ? '✓ ' : ''}CP ${index + 1}`, x + 5, y - t * 1.42, '#518b75', '#f3fff3')
    }
    const flagX = ox + game.level.flag.x * t, flagY = this.originY + game.level.flag.y * t
    this.rect(flagX - 3, flagY - t * 1.63, 5, t * 1.63, '#7c6c52')
    this.rect(flagX - 4, flagY - t * 1.65, 7, 6, '#e8d2a2')
    const wave = Math.round(Math.sin(now * .005) * 3)
    ctx.fillStyle = '#dc6350'; ctx.beginPath(); ctx.moveTo(flagX + 2, flagY - t * 1.56); ctx.lineTo(flagX + t * .63, flagY - t * 1.56 + wave); ctx.lineTo(flagX + t * .49, flagY - t * 1.34 + wave); ctx.lineTo(flagX + t * .63, flagY - t * 1.12 + wave); ctx.lineTo(flagX + 2, flagY - t * 1.12); ctx.closePath(); ctx.fill()
    this.rect(flagX + 3, flagY - t * 1.56, 4, t * .44, '#b74839')
    if (game.status === 'ready') this.label('FINISH', flagX + 10, flagY - t * 1.72, '#99774d', '#fff8e6')
    // Small pixel particles around the boost and finish.
    if (game.status === 'won') for (let i = 0; i < 32; i++) {
      const age = (now * .0003 + i * .071) % 1
      this.rect(flagX + Math.sin(i * 24) * t * 2.8 * age, flagY - t * 2.5 + age * t * 3, 5, 5, ['#e7b653', '#83a654', '#dc7863', '#f8f7e5'][i % 4]!)
    }
    for (const particle of this.dust.particles) {
      ctx.save(); ctx.globalAlpha = (1 - particle.age / particle.life) * .85
      this.rect(ox + particle.x * t, this.originY + particle.y * t, Math.max(2, particle.size * t), Math.max(2, particle.size * t), particle.color); ctx.restore()
    }
    for (const actor of actors) {
      const p = actor.state.player, x = ox + (p.x + p.width / 2) * t
      if (x < -t || x > w + t || (actor.state.status === 'dead' && Math.sin(now * .012) <= -.4)) continue
      if (flight) this.flyingCharacter(p, actor.id, ox, worldTime, active && actor.state.status === 'playing')
      else this.character(p, actor.id, ox)
      if (options.companions?.length || game.status === 'ready') this.label(`${actor.id.toUpperCase()}${actor.state.status === 'won' ? ' ✓' : ''}`, x, this.originY + p.y * t - 18, actor.id === 'alex' ? '#a27345' : '#487a88', '#ffffff')
    }
    // Screen-edge fog helps the long courses fade naturally into the distance.
    if (game.level.length > visible) {
      const fog = ctx.createLinearGradient(w - 45, 0, w, 0); fog.addColorStop(0, 'rgba(230,241,228,0)'); fog.addColorStop(1, 'rgba(230,241,228,.6)'); ctx.fillStyle = fog; ctx.fillRect(w - 45, 0, 45, h)
    }
  }
  private label(text: string, x: number, y: number, color: string, background: string) {
    const ctx = this.ctx; ctx.font = '700 10px "Trebuchet MS", sans-serif'; const width = ctx.measureText(text).width + 17
    ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(x - width / 2, y - 14, width, 23, 6); ctx.fill()
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 1)
  }
}
