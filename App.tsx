
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Direction, Ghost, GhostState, Position, MapTile } from './types';
import { PACMAN_SPEED, GHOST_SPEED, FRIGHTENED_SPEED, EATEN_SPEED, LEVELS, TILE_SIZE, POWER_MODE_DURATION } from './constants';

const GHOST_COLORS = ['#FF0000', '#FFB8FF', '#00FFFF', '#FFB852'];

// Retro Sound Manager using Web Audio API
class SoundManager {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number, slideTo?: number) {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
    }
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playPellet() { this.playTone(600, 'square', 0.05, 0.05, 800); }
  playPower() { this.playTone(200, 'sawtooth', 0.2, 0.1, 1200); }
  playEatGhost() { this.playTone(800, 'square', 0.3, 0.1, 100); }
  playCaught() { this.playTone(400, 'sawtooth', 0.8, 0.1, 50); }
  playRespawn() { this.playTone(100, 'triangle', 0.5, 0.1, 1000); }
  playFruit() {
    this.playTone(880, 'square', 0.1, 0.1);
    setTimeout(() => this.playTone(1100, 'square', 0.1, 0.1), 100);
    setTimeout(() => this.playTone(1320, 'square', 0.2, 0.1), 200);
  }
}

const sounds = new SoundManager();

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    lives: 3,
    level: 0,
    isPaused: true,
    isGameOver: false,
    isLevelComplete: false,
    powerModeTime: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pacmanRef = useRef({
    pos: { x: 0, y: 0 },
    dir: Direction.NONE,
    nextDir: Direction.NONE,
    mouth: 0,
    mouthDir: 1
  });

  const ghostsRef = useRef<Ghost[]>([]);
  const mapRef = useRef<MapTile[][]>([]);
  const requestRef = useRef<number>(0);

  const initLevel = useCallback((levelIdx: number, keepScore: boolean = false) => {
    const rawMap = LEVELS[levelIdx % LEVELS.length];
    const map = rawMap.map(row => [...row]);
    
    // Spawn a random fruit (Tile 6) in place of a pellet
    const pelletPositions: {x: number, y: number}[] = [];
    map.forEach((row, y) => {
      row.forEach((tile, x) => {
        if (tile === 2) pelletPositions.push({ x, y });
      });
    });
    if (pelletPositions.length > 0) {
      const randomPellet = pelletPositions[Math.floor(Math.random() * pelletPositions.length)];
      map[randomPellet.y][randomPellet.x] = 6;
    }

    mapRef.current = map;

    let pacStart = { x: 1, y: 1 };
    const ghosts: Ghost[] = [];

    map.forEach((row, y) => {
      row.forEach((tile, x) => {
        if (tile === 5) {
          pacStart = { x: x * TILE_SIZE, y: y * TILE_SIZE };
          map[y][x] = 0;
        } else if (tile === 4) {
          if (ghosts.length < 4) {
            ghosts.push({
              id: ghosts.length,
              pos: { x: x * TILE_SIZE, y: y * TILE_SIZE },
              homePos: { x: x * TILE_SIZE, y: y * TILE_SIZE },
              dir: Direction.LEFT,
              nextDir: Direction.LEFT,
              speed: GHOST_SPEED,
              color: GHOST_COLORS[ghosts.length],
              state: GhostState.CHASE,
              target: { x: 0, y: 0 }
            });
            map[y][x] = 0;
          }
        }
      });
    });

    pacmanRef.current = {
      pos: pacStart,
      dir: Direction.NONE,
      nextDir: Direction.NONE,
      mouth: 0,
      mouthDir: 1
    };
    ghostsRef.current = ghosts;

    setGameState(prev => ({
      ...prev,
      level: levelIdx,
      score: keepScore ? prev.score : 0,
      lives: keepScore ? prev.lives : 3,
      isPaused: true,
      isGameOver: false,
      isLevelComplete: false,
      powerModeTime: 0,
    }));
  }, []);

  useEffect(() => {
    initLevel(0);
  }, [initLevel]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (e.key === 'Enter') {
      if (gameState.isGameOver || gameState.isLevelComplete) {
        initLevel(gameState.isLevelComplete ? gameState.level + 1 : 0, gameState.isLevelComplete);
      } else {
        setGameState(prev => ({ ...prev, isPaused: false }));
      }
    } else if (e.key === ' ' || key === 'p') {
      setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }));
    }

    if (gameState.isPaused || gameState.isGameOver) return;

    switch (e.key) {
      case 'ArrowUp': case 'w': pacmanRef.current.nextDir = Direction.UP; break;
      case 'ArrowDown': case 's': pacmanRef.current.nextDir = Direction.DOWN; break;
      case 'ArrowLeft': case 'a': pacmanRef.current.nextDir = Direction.LEFT; break;
      case 'ArrowRight': case 'd': pacmanRef.current.nextDir = Direction.RIGHT; break;
    }
  }, [gameState.isPaused, gameState.isGameOver, gameState.isLevelComplete, gameState.level, initLevel]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const canMove = (pos: Position, dir: Direction): boolean => {
    const map = mapRef.current;
    let nextX = pos.x;
    let nextY = pos.y;
    const buffer = 2;
    switch (dir) {
      case Direction.UP: nextY -= buffer; break;
      case Direction.DOWN: nextY += TILE_SIZE + buffer - 1; break;
      case Direction.LEFT: nextX -= buffer; break;
      case Direction.RIGHT: nextX += TILE_SIZE + buffer - 1; break;
      default: return true;
    }
    const gridX = Math.floor(nextX / TILE_SIZE);
    const gridY = Math.floor(nextY / TILE_SIZE);

    const mapWidth = (map[0]?.length || 0);
    const mapHeight = map.length;

    // Portals
    if (gridX < 0 || gridX >= mapWidth || gridY < 0 || gridY >= mapHeight) return true;

    return map[gridY][gridX] !== 1;
  };

  const moveEntity = (entity: { pos: Position, dir: Direction, nextDir: Direction }, speed: number, isGhost: boolean = false) => {
    const mapWidth = (mapRef.current[0]?.length || 0) * TILE_SIZE;
    const mapHeight = mapRef.current.length * TILE_SIZE;
    
    const inHorizTunnel = entity.pos.x < 0 || entity.pos.x >= mapWidth - TILE_SIZE;
    const inVertTunnel = entity.pos.y < 0 || entity.pos.y >= mapHeight - TILE_SIZE;
    const inTunnel = inHorizTunnel || inVertTunnel;

    const inCenter = !inTunnel && entity.pos.x % TILE_SIZE === 0 && entity.pos.y % TILE_SIZE === 0;
    
    if (inCenter && entity.nextDir !== Direction.NONE && canMove(entity.pos, entity.nextDir)) {
      entity.dir = entity.nextDir;
    }

    if (canMove(entity.pos, entity.dir)) {
      switch (entity.dir) {
        case Direction.UP: entity.pos.y -= speed; break;
        case Direction.DOWN: entity.pos.y += speed; break;
        case Direction.LEFT: entity.pos.x -= speed; break;
        case Direction.RIGHT: entity.pos.x += speed; break;
      }
    } else if (!inTunnel) {
      entity.dir = Direction.NONE;
    }

    if (entity.pos.x < -TILE_SIZE) entity.pos.x = mapWidth - speed;
    if (entity.pos.x >= mapWidth) entity.pos.x = speed - TILE_SIZE;
    if (entity.pos.y < -TILE_SIZE) entity.pos.y = mapHeight - speed;
    if (entity.pos.y >= mapHeight) entity.pos.y = speed - TILE_SIZE;
  };

  const update = useCallback(() => {
    if (gameState.isPaused || gameState.isGameOver || gameState.isLevelComplete) return;

    const pac = pacmanRef.current;
    moveEntity(pac, PACMAN_SPEED);
    pac.mouth += 0.1 * pac.mouthDir;
    if (pac.mouth > 0.4 || pac.mouth < 0) pac.mouthDir *= -1;

    const gridX = Math.round(pac.pos.x / TILE_SIZE);
    const gridY = Math.round(pac.pos.y / TILE_SIZE);
    const map = mapRef.current;

    if (map[gridY] && map[gridY][gridX] === 2) {
      map[gridY][gridX] = 0;
      sounds.playPellet();
      setGameState(prev => ({ ...prev, score: prev.score + 10 }));
    } else if (map[gridY] && map[gridY][gridX] === 3) {
      map[gridY][gridX] = 0;
      sounds.playPower();
      setGameState(prev => ({ ...prev, score: prev.score + 50, powerModeTime: POWER_MODE_DURATION }));
      ghostsRef.current.forEach(g => { if (g.state !== GhostState.EATEN) g.state = GhostState.FRIGHTENED; });
    } else if (map[gridY] && map[gridY][gridX] === 6) {
      map[gridY][gridX] = 0;
      sounds.playFruit();
      setGameState(prev => ({ ...prev, score: prev.score + 100 }));
    }

    if (gameState.powerModeTime > 0) {
      setGameState(prev => ({ ...prev, powerModeTime: prev.powerModeTime - 1 }));
      if (gameState.powerModeTime === 1) {
        ghostsRef.current.forEach(g => { if (g.state === GhostState.FRIGHTENED) g.state = GhostState.CHASE; });
      }
    }

    ghostsRef.current.forEach(ghost => {
      let gSpeed = GHOST_SPEED;
      if (ghost.state === GhostState.FRIGHTENED) gSpeed = FRIGHTENED_SPEED;
      if (ghost.state === GhostState.EATEN) gSpeed = EATEN_SPEED;

      const inCenter = ghost.pos.x % TILE_SIZE === 0 && ghost.pos.y % TILE_SIZE === 0;
      
      if (ghost.dir === Direction.NONE || inCenter) {
        const directions = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
        const validDirs = directions.filter(d => {
          const reverse = (d === Direction.UP && ghost.dir === Direction.DOWN) ||
                          (d === Direction.DOWN && ghost.dir === Direction.UP) ||
                          (d === Direction.LEFT && ghost.dir === Direction.RIGHT) ||
                          (d === Direction.RIGHT && ghost.dir === Direction.LEFT);
          
          const isAtWall = !canMove(ghost.pos, d);
          return ghost.dir === Direction.NONE ? !isAtWall : (!reverse && !isAtWall);
        });

        const finalValidDirs = validDirs.length > 0 ? validDirs : directions.filter(d => canMove(ghost.pos, d));

        if (finalValidDirs.length > 0) {
          let target = { ...pac.pos };
          
          if (ghost.state === GhostState.EATEN) {
            target = { ...ghost.homePos };
          } else if (ghost.state === GhostState.FRIGHTENED) {
            const corners = [{x:0, y:0}, {x:500, y:0}, {x:0, y:500}, {x:500, y:500}];
            target = corners[ghost.id % 4];
          } else {
            switch (ghost.id) {
              case 0: target = pac.pos; break;
              case 1: 
                if (pac.dir === Direction.UP) target = { x: pac.pos.x - 4 * TILE_SIZE, y: pac.pos.y - 4 * TILE_SIZE };
                else if (pac.dir === Direction.DOWN) target = { x: pac.pos.x, y: pac.pos.y + 4 * TILE_SIZE };
                else if (pac.dir === Direction.LEFT) target = { x: pac.pos.x - 4 * TILE_SIZE, y: pac.pos.y };
                else target = { x: pac.pos.x + 4 * TILE_SIZE, y: pac.pos.y };
                break;
              case 2:
                const blinky = ghostsRef.current[0];
                target = { x: pac.pos.x + (pac.pos.x - (blinky?.pos.x || 0)), y: pac.pos.y + (pac.pos.y - (blinky?.pos.y || 0)) };
                break;
              case 3:
                const d = Math.sqrt((ghost.pos.x - pac.pos.x)**2 + (ghost.pos.y - pac.pos.y)**2);
                target = d < 8 * TILE_SIZE ? { x: 0, y: 500 } : pac.pos;
                break;
            }
          }

          finalValidDirs.sort((a, b) => {
            const getDist = (d: Direction) => {
              let nx = ghost.pos.x, ny = ghost.pos.y;
              if (d === Direction.UP) ny -= TILE_SIZE;
              else if (d === Direction.DOWN) ny += TILE_SIZE;
              else if (d === Direction.LEFT) nx -= TILE_SIZE;
              else if (d === Direction.RIGHT) nx += TILE_SIZE;
              return Math.sqrt((nx - target.x)**2 + (ny - target.y)**2);
            };
            return getDist(a) - getDist(b);
          });
          ghost.nextDir = finalValidDirs[0];
          if (ghost.dir === Direction.NONE) ghost.dir = ghost.nextDir;
        } else {
          ghost.dir = Direction.RIGHT; 
        }
      }

      moveEntity(ghost, gSpeed, true);

      const dist = Math.sqrt((ghost.pos.x - pac.pos.x)**2 + (ghost.pos.y - pac.pos.y)**2);
      if (dist < TILE_SIZE * 0.8) {
        if (ghost.state === GhostState.FRIGHTENED) {
          ghost.state = GhostState.EATEN;
          sounds.playEatGhost();
          setGameState(prev => ({ ...prev, score: prev.score + 200 }));
          
          const ghostId = ghost.id;
          setTimeout(() => {
            const targetGhost = ghostsRef.current.find(g => g.id === ghostId);
            if (targetGhost && targetGhost.state === GhostState.EATEN) {
              targetGhost.state = GhostState.CHASE;
              sounds.playRespawn();
            }
          }, 7000);

        } else if (ghost.state === GhostState.CHASE) {
          sounds.playCaught();
          setGameState(prev => {
            const nextLives = prev.lives - 1;
            if (nextLives <= 0) return { ...prev, isGameOver: true, lives: 0 };
            return { ...prev, lives: nextLives, isPaused: true };
          });
          // Find Pac-Man spawn position in current level
          const currentRawMap = LEVELS[gameState.level % LEVELS.length];
          currentRawMap.forEach((row, y) => {
            row.forEach((tile, x) => {
              if (tile === 5) pacmanRef.current.pos = { x: x * TILE_SIZE, y: y * TILE_SIZE };
            });
          });
          ghostsRef.current.forEach((g) => { 
            g.pos = { ...g.homePos }; 
            g.dir = Direction.LEFT; 
            g.state = GhostState.CHASE; 
          });
        }
      }
    });

    if (!map.some(row => row.some(t => t === 2 || t === 3))) setGameState(prev => ({ ...prev, isLevelComplete: true }));
  }, [gameState.isPaused, gameState.isGameOver, gameState.isLevelComplete, gameState.powerModeTime, gameState.level]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const map = mapRef.current;
    map.forEach((row, y) => {
      row.forEach((tile, x) => {
        if (tile === 1) {
          ctx.strokeStyle = '#2121ff';
          ctx.lineWidth = 2;
          ctx.strokeRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        } else if (tile === 2) {
          ctx.fillStyle = '#ffb8ae';
          ctx.beginPath(); ctx.arc(x * TILE_SIZE + TILE_SIZE/2, y * TILE_SIZE + TILE_SIZE/2, 2, 0, Math.PI * 2); ctx.fill();
        } else if (tile === 3) {
          ctx.fillStyle = '#ffb8ae';
          ctx.beginPath(); ctx.arc(x * TILE_SIZE + TILE_SIZE/2, y * TILE_SIZE + TILE_SIZE/2, 6, 0, Math.PI * 2); ctx.fill();
        } else if (tile === 6) {
          ctx.fillStyle = '#ff0000';
          ctx.beginPath(); ctx.arc(x * TILE_SIZE + TILE_SIZE/2 - 4, y * TILE_SIZE + TILE_SIZE/2 + 4, 4, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x * TILE_SIZE + TILE_SIZE/2 + 4, y * TILE_SIZE + TILE_SIZE/2 + 2, 4, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x * TILE_SIZE + TILE_SIZE/2 - 4, y * TILE_SIZE + TILE_SIZE/2); ctx.quadraticCurveTo(x * TILE_SIZE + TILE_SIZE/2, y * TILE_SIZE + 4, x * TILE_SIZE + TILE_SIZE/2 + 6, y * TILE_SIZE + 4); ctx.stroke();
        }
      });
    });

    const pac = pacmanRef.current;
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    const centerX = pac.pos.x + TILE_SIZE / 2;
    const centerY = pac.pos.y + TILE_SIZE / 2;
    let rotation = 0;
    if (pac.dir === Direction.DOWN) rotation = Math.PI / 2;
    else if (pac.dir === Direction.LEFT) rotation = Math.PI;
    else if (pac.dir === Direction.UP) rotation = -Math.PI / 2;

    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, TILE_SIZE/2 - 2, rotation + pac.mouth * Math.PI, rotation + (2 - pac.mouth) * Math.PI);
    ctx.fill();

    ghostsRef.current.forEach(ghost => {
      const isEaten = ghost.state === GhostState.EATEN;
      const isFrightened = ghost.state === GhostState.FRIGHTENED;
      
      ctx.fillStyle = isEaten ? 'transparent' : isFrightened ? (gameState.powerModeTime < 180 && gameState.powerModeTime % 20 < 10 ? '#fff' : '#2121ff') : ghost.color;
      
      const gx = ghost.pos.x + TILE_SIZE / 2;
      const gy = ghost.pos.y + TILE_SIZE / 2;
      const r = TILE_SIZE / 2 - 2;

      if (!isEaten) {
        ctx.beginPath(); ctx.arc(gx, gy - 2, r, Math.PI, 0); ctx.lineTo(gx + r, gy + r);
        for (let i = 0; i < 3; i++) ctx.lineTo(gx + r - (i * 2 + 1) * (r/3), gy + r - (i % 2 === 0 ? 4 : 0));
        ctx.lineTo(gx - r, gy + r); ctx.fill();
      }

      ctx.fillStyle = isFrightened ? '#ffb8ae' : '#fff';
      ctx.beginPath(); 
      ctx.arc(gx - 4, gy - 4, 3, 0, Math.PI * 2); 
      ctx.arc(gx + 4, gy - 4, 3, 0, Math.PI * 2); 
      ctx.fill();
      
      if (!isFrightened) {
        ctx.fillStyle = '#000';
        ctx.beginPath(); 
        ctx.arc(gx - 4, gy - 4, 1.5, 0, Math.PI * 2); 
        ctx.arc(gx + 4, gy - 4, 1.5, 0, Math.PI * 2); 
        ctx.fill();
      }
    });

    update();
    requestRef.current = requestAnimationFrame(draw);
  }, [update, gameState.powerModeTime]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(draw);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [draw]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
      <div className="mb-6 text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-widest text-yellow-400 drop-shadow-[0_0_10px_rgba(255,255,0,0.5)]">PAC-MAN</h1>
        <div className="flex justify-between w-full max-w-md px-4 py-2 border-2 border-blue-600 rounded-lg bg-blue-900/20">
          <div className="flex flex-col items-start"><span className="text-xs text-blue-300">SCORE</span><span className="text-xl text-yellow-400">{gameState.score.toString().padStart(6, '0')}</span></div>
          <div className="flex flex-col items-center"><span className="text-xs text-blue-300">LEVEL</span><span className="text-xl text-white">{gameState.level + 1}</span></div>
          <div className="flex flex-col items-end"><span className="text-xs text-blue-300">LIVES</span><div className="flex gap-1 mt-1">{[...Array(gameState.lives)].map((_, i) => (<div key={i} className="w-4 h-4 rounded-full bg-yellow-400 border-2 border-black" />))}</div></div>
        </div>
      </div>
      <div className="relative border-4 border-blue-700 shadow-[0_0_30px_rgba(33,33,255,0.4)] rounded-sm overflow-hidden" style={{ width: 19 * TILE_SIZE, height: 20 * TILE_SIZE }}>
        <canvas ref={canvasRef} width={19 * TILE_SIZE} height={20 * TILE_SIZE} className="block" />
        {(gameState.isPaused || gameState.isGameOver || gameState.isLevelComplete) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="text-center p-8 bg-blue-900/40 border-2 border-blue-500 rounded-xl shadow-2xl">
              <h2 className="text-2xl mb-6 font-bold animate-pulse">{gameState.isGameOver ? 'GAME OVER' : gameState.isLevelComplete ? 'LEVEL COMPLETE' : 'READY?'}</h2>
              <p className="text-sm mb-8 text-blue-200 leading-relaxed whitespace-pre-line">{gameState.isGameOver ? 'Final Score: ' + gameState.score : gameState.isLevelComplete ? 'Ready for Level ' + (gameState.level + 2) + '?' : 'Use ARROW KEYS or WASD\nOpen Symmetrical Maze!'}</p>
              <button onClick={() => { if (gameState.isGameOver || gameState.isLevelComplete) initLevel(gameState.isLevelComplete ? gameState.level + 1 : 0, gameState.isLevelComplete); else setGameState(prev => ({ ...prev, isPaused: false })); }} className="px-6 py-3 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-400 active:scale-95 transition-all shadow-lg shadow-yellow-500/20">{gameState.isGameOver ? 'RESTART' : gameState.isLevelComplete ? 'NEXT LEVEL' : 'START'}</button>
              <div className="mt-6 text-[10px] text-gray-400 uppercase tracking-widest">Or Press ENTER</div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 text-[10px] text-gray-500 uppercase tracking-tighter max-w-lg w-full px-4">
         <div className="flex items-center gap-3"><div className="w-4 h-4 bg-red-500 rounded-sm"></div><span>Blinky: Chaser</span></div>
         <div className="flex items-center gap-3"><div className="w-4 h-4 bg-pink-400 rounded-sm"></div><span>Pinky: Ambusher</span></div>
         <div className="flex items-center gap-3"><div className="w-4 h-4 bg-cyan-400 rounded-sm"></div><span>Inky: Flanker</span></div>
         <div className="flex items-center gap-3"><div className="w-4 h-4 bg-orange-400 rounded-sm"></div><span>Clyde: Random</span></div>
      </div>
      <div className="mt-auto pt-8 pb-4 text-[10px] text-gray-600 font-sans uppercase">Improved Maze Accessibility & Flow.</div>
    </div>
  );
};

export default App;
