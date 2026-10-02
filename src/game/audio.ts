export class GameAudio {
  enabled = false
  private context: AudioContext | null = null
  unlock() { this.context ??= new AudioContext(); void this.context.resume() }
  play(kind: 'jump' | 'slime' | 'dead' | 'win' | 'start') {
    if (!this.enabled) return
    this.unlock()
    const ctx = this.context!
    const notes = kind === 'win' ? [523, 659, 784, 1047] : kind === 'dead' ? [220, 140, 80] : kind === 'slime' ? [200, 400, 650] : kind === 'jump' ? [320, 460] : [440, 660]
    notes.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain()
      const start = ctx.currentTime + i * .075
      oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(.055, start); gain.gain.exponentialRampToValueAtTime(.001, start + .13)
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + .14)
    })
  }
}
