export type BlockKind = 'grass' | 'dirt' | 'stone' | 'wood' | 'leaf' | 'slime'
export interface Motion { axis: 'x' | 'y'; range: number; speed: number; phase: number }
export interface Block { id: string; x: number; y: number; kind: BlockKind; solid: boolean; width?: number; height?: number; motion?: Motion }
export interface Spike { x: number; y: number }
export interface Checkpoint { id: string; x: number; y: number }
export type CharacterId = 'steve' | 'alex'
export type GameMode = 'solo' | 'duo'
export interface FlightCourse { ceiling: number; floor: number }
export interface Level {
  number: number; length: number; name: string; subtitle: string;
  spawn: { x: number; y: number }; flag: { x: number; y: number };
  blocks: Block[]; spikes: Spike[]; checkpoints?: Checkpoint[];
  kind?: 'parkour' | 'elytra'; flight?: FlightCourse;
}
export type GameStatus = 'ready' | 'playing' | 'paused' | 'dead' | 'won'
export interface Player {
  x: number; y: number; vx: number; vy: number; width: number; height: number;
  grounded: boolean; groundKind: BlockKind | null; groundId: string | null;
  facing: 1 | -1; walkTime: number; sneaking: boolean; sprinting: boolean;
}
export interface Input { left: boolean; right: boolean; jump: boolean; sprint?: boolean; sneak?: boolean }
export interface GameState {
  level: Level; player: Player; status: GameStatus; time: number;
  elapsed: number; deathReason: 'spike' | 'void' | 'collision' | null; jumps: number;
  coyote: number; jumpBuffer: number; jumpWasPressed: boolean;
}
export interface PlayerRun {
  id: CharacterId; state: GameState; checkpoint: Checkpoint | null;
  deaths: number; respawnIn: number;
}
export interface GameSession {
  level: Level; mode: GameMode; runs: PlayerRun[]; status: GameStatus;
  time: number; elapsed: number;
}
