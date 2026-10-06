export type BlockKind = 'grass' | 'dirt' | 'stone' | 'wood' | 'leaf' | 'slime' | 'ice' | 'netherrack' | 'nether-brick' | 'end-stone' | 'purpur' | 'scaffolding'
export interface Motion { axis: 'x' | 'y'; range: number; speed: number; phase: number }
export interface Block { id: string; x: number; y: number; kind: BlockKind; solid: boolean; width?: number; height?: number; motion?: Motion; color?: string }
export interface Spike { x: number; y: number }
export interface Ladder { id: string; x: number; y: number; height: number; width?: number }
export interface Checkpoint { id: string; x: number; y: number; progress?: number }
export type CharacterId = 'steve' | 'alex'
export type SkinId = CharacterId | 'dream' | 'skeppy'
export type GameMode = 'solo' | 'duo'
export type MultiplayerMode = 'teamwork' | 'pk'
export type RaceResult = CharacterId | 'draw' | null
export interface FlightCourse { ceiling: number; floor: number }
export interface SkeletonSpawn { x: number; y: number }
export interface Skeleton { x: number; y: number; width: number; height: number; facing: 1 | -1; hearts: number; shootIn: number }
export interface Arrow { id: number; x: number; y: number; vx: number; vy: number; life: number }
export interface CombatState { skeleton: Skeleton; arrows: Arrow[]; nextArrowId: number }
export interface PlayerCombat { hearts: number; attackCooldown: number; swing: number; knockbackRemaining: number; knockbackDirection: 1 | -1 }
export interface Level {
  number: number; length: number; width?: number; layout?: 'vertical'; name: string; subtitle: string;
  spawn: { x: number; y: number }; flag: { x: number; y: number };
  blocks: Block[]; spikes: Spike[]; checkpoints?: Checkpoint[];
  kind?: 'parkour' | 'elytra'; theme?: 'overworld' | 'nether' | 'end'; flight?: FlightCourse; ladders?: Ladder[];
  bonus?: { skeleton: SkeletonSpawn };
  hazards?: { x: number; y: number; width: number; height: number; color: string }[];
}
export type GameStatus = 'ready' | 'playing' | 'paused' | 'dead' | 'won'
export interface Player {
  skin?: SkinId; horse?: boolean;
  x: number; y: number; vx: number; vy: number; width: number; height: number;
  grounded: boolean; groundKind: BlockKind | null; groundId: string | null;
  facing: 1 | -1; walkTime: number; sneaking: boolean; sprinting: boolean; iceMomentum: boolean; climbing: boolean;
}
export interface Input { left: boolean; right: boolean; jump: boolean; sprint?: boolean; sneak?: boolean; attack?: boolean }
export interface GameState {
  level: Level; player: Player; status: GameStatus; time: number;
  elapsed: number; deathReason: 'spike' | 'void' | 'collision' | 'arrow' | null; jumps: number;
  coyote: number; jumpBuffer: number; jumpWasPressed: boolean;
  combat?: PlayerCombat; goalUnlocked?: boolean;
}
export interface PlayerRun {
  id: CharacterId; state: GameState; checkpoint: Checkpoint | null;
  deaths: number; respawnIn: number;
}
export interface GameSession {
  level: Level; mode: GameMode; multiplayerMode: MultiplayerMode; result: RaceResult;
  runs: PlayerRun[]; status: GameStatus;
  time: number; elapsed: number;
  combat?: CombatState;
}
