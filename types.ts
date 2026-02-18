
export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  NONE = 'NONE'
}

export enum GhostState {
  CHASE = 'CHASE',
  SCATTER = 'SCATTER',
  FRIGHTENED = 'FRIGHTENED',
  EATEN = 'EATEN'
}

export interface Position {
  x: number;
  y: number;
}

export interface Entity {
  pos: Position;
  dir: Direction;
  nextDir: Direction;
  speed: number;
}

export interface Ghost extends Entity {
  id: number;
  color: string;
  state: GhostState;
  homePos: Position;
  target: Position;
}

export interface GameState {
  score: number;
  lives: number;
  level: number;
  isPaused: boolean;
  isGameOver: boolean;
  isLevelComplete: boolean;
  powerModeTime: number;
}

export type MapTile = 0 | 1 | 2 | 3 | 4 | 5; 
// 0: Empty, 1: Wall, 2: Pellet, 3: Power Pellet, 4: Ghost Spawn, 5: Pacman Spawn
