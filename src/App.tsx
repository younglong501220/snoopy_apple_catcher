/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Heart,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Info
} from 'lucide-react';
import { soundManager } from './utils/audio';

type ItemType = 'red_apple' | 'green_apple' | 'cookie' | 'golden_star';

interface FallingItem {
  id: number;
  x: number;
  y: number;
  type: ItemType;
  points: number;
  speed: number;
  angle: number;
  rotSpeed: number;
  radius: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  dy: number;
  scale: number;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  scale: number;
}

interface Woodstock {
  x: number;
  y: number;
  speedX: number;
  flapTimer: number;
  active: boolean;
  hasDropped: boolean;
}

interface GameStats {
  redApples: number;
  greenApples: number;
  cookies: number;
  stars: number;
  maxCombo: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Game UI States
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('START');
  const [score, setScore] = useState<number>(0);
  const [bestScore, setBestScore] = useState<number>(() => {
    return parseInt(localStorage.getItem('snoopy_best_score') || '0', 10);
  });
  const [lives, setLives] = useState<number>(3);
  const [combo, setCombo] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundManager.enabled);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [stats, setStats] = useState<GameStats>({
    redApples: 0,
    greenApples: 0,
    cookies: 0,
    stars: 0,
    maxCombo: 0
  });

  // Mutable game loop references to avoid closure stales
  const loopRef = useRef<{
    gameRunning: boolean;
    isPaused: boolean;
    score: number;
    lives: number;
    combo: number;
    maxCombo: number;
    stats: GameStats;
    player: {
      x: number;
      y: number;
      width: number;
      height: number;
      speed: number;
      targetX: number;
      earBounce: number;
      happyTimer: number;
    };
    keys: { left: boolean; right: boolean };
    items: FallingItem[];
    particles: Particle[];
    clouds: Cloud[];
    woodstock: Woodstock;
    spawnTimer: number;
    spawnInterval: number;
    nextItemId: number;
    nextParticleId: number;
    animFrameId: number | null;
    width: number;
    height: number;
    idleTimer: number;
  }>({
    gameRunning: false,
    isPaused: false,
    score: 0,
    lives: 3,
    combo: 0,
    maxCombo: 0,
    stats: { redApples: 0, greenApples: 0, cookies: 0, stars: 0, maxCombo: 0 },
    player: {
      x: 200,
      y: 500,
      width: 100,
      height: 72,
      speed: 9,
      targetX: 200,
      earBounce: 0,
      happyTimer: 0
    },
    keys: { left: false, right: false },
    items: [],
    particles: [],
    clouds: [
      { x: 30, y: 70, speed: 0.2, scale: 0.8 },
      { x: 220, y: 120, speed: 0.15, scale: 0.6 },
      { x: 380, y: 80, speed: 0.3, scale: 0.95 }
    ],
    woodstock: {
      x: -50,
      y: 60,
      speedX: 1.8,
      flapTimer: 0,
      active: false,
      hasDropped: false
    },
    spawnTimer: 0,
    spawnInterval: 65,
    nextItemId: 1,
    nextParticleId: 1,
    animFrameId: null,
    width: 440,
    height: 700,
    idleTimer: 0
  });

  // Sound toggle handler
  const handleToggleSound = () => {
    const newState = soundManager.toggleSound();
    setSoundEnabled(newState);
  };

  // Add floating text particle
  const addParticle = useCallback((x: number, y: number, text: string, color: string) => {
    const g = loopRef.current;
    g.particles.push({
      id: g.nextParticleId++,
      x,
      y,
      text,
      color,
      alpha: 1.0,
      dy: -1.8,
      scale: 1.1
    });
  }, []);

  // Spawn falling objects
  const spawnItem = useCallback(() => {
    const g = loopRef.current;
    const rand = Math.random();
    let type: ItemType = 'red_apple';
    let points = 10;
    let radius = 16;

    if (rand < 0.46) {
      type = 'red_apple';
      points = 10;
    } else if (rand < 0.76) {
      type = 'green_apple';
      points = 5;
    } else {
      type = 'cookie';
      points = 30;
      radius = 18;
    }

    // Slightly increase falling speed as score progresses
    const speedBoost = Math.min(g.score * 0.022, 4.2);
    const speed = 2.8 + Math.random() * 1.5 + speedBoost;
    const margin = 35;
    const x = margin + Math.random() * (g.width - margin * 2);

    g.items.push({
      id: g.nextItemId++,
      x,
      y: -25,
      type,
      points,
      speed,
      angle: (Math.random() - 0.5) * 0.4,
      rotSpeed: (Math.random() - 0.5) * 0.04,
      radius
    });
  }, []);

  // Spawn Woodstock Golden Star
  const spawnStar = useCallback((x: number, y: number) => {
    const g = loopRef.current;
    g.items.push({
      id: g.nextItemId++,
      x,
      y,
      type: 'golden_star',
      points: 50,
      speed: 2.2,
      angle: 0,
      rotSpeed: 0.06,
      radius: 18
    });
  }, []);

  // Draw background elements (sky, clouds, grass, flowers)
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const g = loopRef.current;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#8ecae6');
    sky.addColorStop(0.65, '#cbf3f0');
    sky.addColorStop(1, '#e8f8f5');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Charlie brown style sun
    ctx.fillStyle = '#ffb703';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(width - 50, 60, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Floating Clouds (always drift smoothly)
    ctx.fillStyle = '#ffffff';
    g.clouds.forEach(c => {
      c.x += c.speed;
      if (c.x > width + 80) c.x = -80;

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.scale, c.scale);
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.arc(22, -10, 28, 0, Math.PI * 2);
      ctx.arc(46, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Woodstock flying in sky occasionally
    const ws = g.woodstock;
    if (ws.active) {
      ws.x += ws.speedX;
      ws.flapTimer += 0.2;
      // Drop star in middle of screen if game is running
      if (g.gameRunning && !g.isPaused && !ws.hasDropped && ws.x > width * 0.45 && ws.x < width * 0.6) {
        ws.hasDropped = true;
        spawnStar(ws.x, ws.y + 10);
      }
      if (ws.x > width + 50) {
        ws.active = false;
      }

      // Draw cute Woodstock
      ctx.save();
      ctx.translate(ws.x, ws.y + Math.sin(ws.flapTimer * 2) * 4);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2.2;
      ctx.fillStyle = '#ffdd00';

      // Body & Head
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tuft of hair on head
      ctx.beginPath();
      ctx.moveTo(-2, -6);
      ctx.lineTo(-4, -11);
      ctx.moveTo(1, -6);
      ctx.lineTo(2, -12);
      ctx.moveTo(4, -6);
      ctx.lineTo(7, -10);
      ctx.stroke();

      // Wing (flapping)
      const wingAngle = Math.sin(ws.flapTimer * 3) * 0.7;
      ctx.save();
      ctx.translate(-2, 0);
      ctx.rotate(wingAngle);
      ctx.beginPath();
      ctx.ellipse(0, -3, 6, 3, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Beak
      ctx.fillStyle = '#fb8500';
      ctx.beginPath();
      ctx.moveTo(8, -1);
      ctx.lineTo(13, 0);
      ctx.lineTo(8, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Eye
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(5, -2, 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Musical note or sparkle trail behind Woodstock
      ctx.fillStyle = '#e63946';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('♪', -14, -2);

      ctx.restore();
    } else if (Math.random() < 0.0025) {
      // Chance to start Woodstock flight
      ws.active = true;
      ws.x = -40;
      ws.y = 50 + Math.random() * 80;
      ws.hasDropped = false;
    }

    // Grass ground
    const grassH = 40;
    ctx.fillStyle = '#6ab43e';
    ctx.fillRect(0, height - grassH, width, grassH);

    // Comic ink border line
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, height - grassH);
    ctx.lineTo(width, height - grassH);
    ctx.stroke();

    // Grass clumps & flowers
    ctx.fillStyle = '#4f8c2b';
    for (let x = 12; x < width; x += 42) {
      ctx.beginPath();
      ctx.arc(x, height - grassH + 5, 8, Math.PI, 0);
      ctx.fill();
    }

    // Cute small daisy flowers on the lawn
    const flowers = [25, 120, 240, 350, 420];
    flowers.forEach((fx, idx) => {
      if (fx < width - 15) {
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#ffd166';
        ctx.beginPath();
        ctx.arc(fx, height - grassH + 18, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e63946';
        ctx.beginPath();
        ctx.arc(fx, height - grassH + 18, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [spawnStar]);

  // Draw Snoopy and his classic Red Doghouse
  const drawPlayer = useCallback((ctx: CanvasRenderingContext2D) => {
    const g = loopRef.current;
    const p = g.player;

    ctx.save();
    ctx.translate(p.x, p.y);

    const w = p.width;
    const h = p.height;
    const hw = w / 2;

    // Doghouse Red Body
    ctx.fillStyle = '#d90429';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';

    // 1. Doghouse Main Box
    ctx.beginPath();
    ctx.rect(-hw + 8, 12, w - 16, h - 12);
    ctx.fill();
    ctx.stroke();

    // Doghouse wood plank vertical line
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-hw + 30, 14);
    ctx.lineTo(-hw + 30, h);
    ctx.moveTo(hw - 30, 14);
    ctx.lineTo(hw - 30, h);
    ctx.stroke();

    // 2. Doghouse Arched Doorway
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(0, h - 4, 15, Math.PI, 0);
    ctx.fill();

    // 3. Sloped Roof (Triangle / Gable)
    ctx.fillStyle = '#ef233c';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(-hw - 4, 12);
    ctx.lineTo(0, -20);
    ctx.lineTo(hw + 4, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. SNOOPY resting peacefully on top of the roof!
    // Ear bounce angle when catching
    const earWiggle = Math.sin(p.earBounce) * 0.35;
    if (p.earBounce > 0) p.earBounce -= 0.15;
    if (p.happyTimer > 0) p.happyTimer -= 1;

    // Body (white ellipse lying flat)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(-4, -20, 19, 9.5, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Snoopy's classic black spot on the back
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(-10, -22, 5, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Snoopy's little tail
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const tailWag = p.happyTimer > 0 ? Math.sin(Date.now() * 0.02) * 5 : 0;
    ctx.moveTo(-22, -18);
    ctx.quadraticCurveTo(-27, -26 + tailWag, -26, -28 + tailWag);
    ctx.stroke();

    // Head (rounded snout)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(12, -25, 12, 9, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Snoopy's round black button nose
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(23, -24, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Sleeping eye or joyful catch expression
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    if (p.happyTimer > 0) {
      // Joyful open happy curved eye ^_^
      ctx.beginPath();
      ctx.arc(12, -26, 3, Math.PI, 0);
      ctx.stroke();
      // Little happy mouth
      ctx.beginPath();
      ctx.arc(14, -21, 2.5, 0, Math.PI);
      ctx.stroke();
    } else {
      // Relaxed resting line eye
      ctx.beginPath();
      ctx.moveTo(10, -26);
      ctx.lineTo(15, -25);
      ctx.stroke();
    }

    // Red Collar
    ctx.strokeStyle = '#d90429';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(5, -19);
    ctx.lineTo(9, -17);
    ctx.stroke();

    // Classic black floppy ear
    ctx.save();
    ctx.translate(3, -24);
    ctx.rotate(0.35 + earWiggle);
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(0, 6, 4.5, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Little front paw dangling
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(16, -14, 4, 3, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Little back paw resting
    ctx.beginPath();
    ctx.ellipse(-14, -13, 4, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Idle Zzz when on start menu or paused
    if (!g.gameRunning || g.isPaused) {
      ctx.fillStyle = '#4361ee';
      ctx.font = 'bold 15px "Balsamiq Sans", sans-serif';
      const zOffset = (Date.now() % 2000) / 2000;
      ctx.globalAlpha = 1 - zOffset;
      ctx.fillText('Z', 22 + zOffset * 10, -34 - zOffset * 20);
      ctx.font = 'bold 11px "Balsamiq Sans", sans-serif';
      ctx.fillText('z', 28 + zOffset * 8, -42 - zOffset * 24);
      ctx.globalAlpha = 1.0;
    }

    ctx.restore();
  }, []);

  // Draw falling items: Red Apple, Green Apple, Cookie, Golden Star
  const drawItem = useCallback((ctx: CanvasRenderingContext2D, item: FallingItem) => {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.angle);

    ctx.lineWidth = 2.8;
    ctx.strokeStyle = '#1a1a1a';

    if (item.type === 'red_apple' || item.type === 'green_apple') {
      const isRed = item.type === 'red_apple';

      // Stem
      ctx.strokeStyle = '#5c3a21';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.quadraticCurveTo(3, -19, 7, -21);
      ctx.stroke();

      // Little leaf
      ctx.fillStyle = '#52b788';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(5, -16, 6, 3.2, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Apple Body
      ctx.fillStyle = isRed ? '#e63946' : '#68b030';
      ctx.beginPath();
      ctx.arc(-6, -2, 11, 0, Math.PI * 2);
      ctx.arc(6, -2, 11, 0, Math.PI * 2);
      ctx.arc(0, 3, 11.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Gloss highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.beginPath();
      ctx.arc(-6, -6, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.type === 'cookie') {
      // Golden Baked Chocolate Chip Cookie
      ctx.fillStyle = '#e09f3e';
      ctx.beginPath();
      ctx.arc(0, 0, 16.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cookie texture dots
      ctx.fillStyle = '#432818';
      const chips = [
        [-6, -5],
        [5, -4],
        [0, 3],
        [-6, 6],
        [6, 5],
        [-1, -7]
      ];
      chips.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (item.type === 'golden_star') {
      // Woodstock's Golden Star
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      const spikes = 5;
      const outerR = 17;
      const innerR = 8;
      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;

      ctx.moveTo(0, -outerR);
      for (let i = 0; i < spikes; i++) {
        let sx = Math.cos(rot) * outerR;
        let sy = Math.sin(rot) * outerR;
        ctx.lineTo(sx, sy);
        rot += step;

        sx = Math.cos(rot) * innerR;
        sy = Math.sin(rot) * innerR;
        ctx.lineTo(sx, sy);
        rot += step;
      }
      ctx.lineTo(0, -outerR);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Star inner sparkle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, []);

  // Draw floating particles and text
  const drawParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    const g = loopRef.current;
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i];
      p.y += p.dy;
      p.alpha -= 0.022;

      if (p.alpha <= 0) {
        g.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 3.5;
      ctx.font = '900 20px "Balsamiq Sans", "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }, []);

  // Resize canvas according to container
  const updateCanvasDimensions = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width) || 400;
    const h = Math.floor(rect.height) || 600;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const g = loopRef.current;
    g.width = w;
    g.height = h;

    // Scale player proportionally
    g.player.width = Math.min(110, Math.max(88, w * 0.26));
    g.player.height = g.player.width * 0.72;
    g.player.y = h - g.player.height - 24;

    if (g.player.x <= 0 || g.player.x > w) {
      g.player.x = w / 2;
    }
    if (g.player.targetX <= 0 || g.player.targetX > w) {
      g.player.targetX = g.player.x;
    }
  }, []);

  // Main animation / update loop (always alive so background, clouds, doghouse, Woodstock, and items animate smoothly)
  useEffect(() => {
    let animId: number;

    const gameLoop = () => {
      const g = loopRef.current;
      const canvas = canvasRef.current;

      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // If in active gameplay (not paused), process physics and rules
          if (g.gameRunning && !g.isPaused) {
            // Keyboard controls
            if (g.keys.left) g.player.targetX -= g.player.speed;
            if (g.keys.right) g.player.targetX += g.player.speed;

            // Bound target within canvas walls
            const halfW = g.player.width / 2;
            g.player.targetX = Math.max(halfW, Math.min(g.width - halfW, g.player.targetX));

            // Smooth lerp movement
            g.player.x += (g.player.targetX - g.player.x) * 0.28;

            // Spawn items
            g.spawnTimer++;
            const currentInterval = Math.max(30, g.spawnInterval - Math.floor(g.score / 50) * 3);
            if (g.spawnTimer >= currentInterval) {
              spawnItem();
              g.spawnTimer = 0;
            }

            // Update items
            for (let i = g.items.length - 1; i >= 0; i--) {
              const item = g.items[i];
              item.y += item.speed;
              item.angle += item.rotSpeed;

              // Roof catch collision boundary
              const catchY = g.player.y - 12;
              const catchDistX = Math.abs(item.x - g.player.x);

              if (
                item.y >= catchY - 14 &&
                item.y <= catchY + 28 &&
                catchDistX < g.player.width * 0.52
              ) {
                // ITEM CAUGHT!
                g.player.earBounce = Math.PI;
                g.player.happyTimer = 18;

                g.combo++;
                if (g.combo > g.maxCombo) {
                  g.maxCombo = g.combo;
                }
                setCombo(g.combo);

                const multiplier = g.combo >= 10 ? 2 : g.combo >= 5 ? 1.5 : 1;
                const gainedPoints = Math.round(item.points * multiplier);
                g.score += gainedPoints;
                setScore(g.score);

                if (item.type === 'red_apple') {
                  g.stats.redApples++;
                  soundManager.playCatchApple(false);
                  addParticle(item.x, item.y - 12, `+${gainedPoints}`, '#e63946');
                } else if (item.type === 'green_apple') {
                  g.stats.greenApples++;
                  soundManager.playCatchApple(true);
                  addParticle(item.x, item.y - 12, `+${gainedPoints}`, '#2a9d8f');
                } else if (item.type === 'cookie') {
                  g.stats.cookies++;
                  soundManager.playCatchCookie();
                  addParticle(item.x, item.y - 12, `+${gainedPoints} 🍪`, '#e76f51');
                } else if (item.type === 'golden_star') {
                  g.stats.stars++;
                  soundManager.playCatchStar();
                  if (g.lives < 3) {
                    g.lives++;
                    setLives(g.lives);
                    addParticle(item.x, item.y - 12, `+${gainedPoints} ❤️+1`, '#e63946');
                  } else {
                    addParticle(item.x, item.y - 12, `+${gainedPoints} ⭐`, '#f4a261');
                  }
                }

                if (g.combo === 5) {
                  addParticle(g.width / 2, g.height * 0.35, 'COMBO 5x! 🔥', '#ffb703');
                } else if (g.combo === 10) {
                  addParticle(g.width / 2, g.height * 0.35, 'SUPER 10x!! 🌟', '#d90429');
                }

                g.items.splice(i, 1);
                continue;
              }

              // Missed item (hits bottom ground)
              if (item.y > g.height - 38) {
                if (item.type === 'red_apple' || item.type === 'green_apple') {
                  g.lives--;
                  setLives(g.lives);
                  g.combo = 0;
                  setCombo(0);

                  soundManager.playMiss();
                  addParticle(item.x, g.height - 52, 'MISS!', '#d90429');

                  if (g.lives <= 0) {
                    g.gameRunning = false;
                    soundManager.playGameOver();

                    const currentBest = parseInt(localStorage.getItem('snoopy_best_score') || '0', 10);
                    if (g.score > currentBest) {
                      setBestScore(g.score);
                      localStorage.setItem('snoopy_best_score', String(g.score));
                    }

                    setStats({ ...g.stats, maxCombo: g.maxCombo });
                    setGameState('GAMEOVER');
                  }
                }
                g.items.splice(i, 1);
              }
            }
          }

          // Always Render Canvas
          ctx.clearRect(0, 0, g.width, g.height);
          drawBackground(ctx, g.width, g.height);
          g.items.forEach(item => drawItem(ctx, item));
          drawPlayer(ctx);
          drawParticles(ctx);
        }
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, [addParticle, drawBackground, drawItem, drawParticles, drawPlayer, spawnItem]);

  // Start / Restart game handler
  const handleStartGame = () => {
    soundManager.playClick();
    const g = loopRef.current;
    g.gameRunning = true;
    g.isPaused = false;
    g.score = 0;
    g.lives = 3;
    g.combo = 0;
    g.maxCombo = 0;
    g.items = [];
    g.particles = [];
    g.spawnTimer = 0;
    g.stats = { redApples: 0, greenApples: 0, cookies: 0, stars: 0, maxCombo: 0 };
    g.player.x = g.width / 2;
    g.player.targetX = g.width / 2;

    setScore(0);
    setLives(3);
    setCombo(0);
    setGameState('PLAYING');
  };

  // Pause / Resume game handler
  const handleTogglePause = () => {
    soundManager.playClick();
    const g = loopRef.current;
    if (gameState === 'PLAYING') {
      g.isPaused = true;
      setGameState('PAUSED');
    } else if (gameState === 'PAUSED') {
      g.isPaused = false;
      setGameState('PLAYING');
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const g = loopRef.current;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        g.keys.left = true;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        g.keys.right = true;
      } else if (e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (g.gameRunning) {
          handleTogglePause();
        } else if (gameState === 'START' || gameState === 'GAMEOVER') {
          handleStartGame();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const g = loopRef.current;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        g.keys.left = false;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        g.keys.right = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // Pointer movement (mouse / touch)
  const handlePointer = useCallback((clientX: number) => {
    const g = loopRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    g.player.targetX = relativeX;
  }, []);

  // Set up resize listener
  useEffect(() => {
    updateCanvasDimensions();
    const handleResize = () => {
      updateCanvasDimensions();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateCanvasDimensions]);

  // Move buttons for mobile touch taps
  const handleMoveLeft = () => {
    const g = loopRef.current;
    g.player.targetX -= 40;
  };
  const handleMoveRight = () => {
    const g = loopRef.current;
    g.player.targetX += 40;
  };

  return (
    <div className="min-h-screen bg-[#243342] text-slate-800 flex items-center justify-center p-2 sm:p-4 select-none">
      {/* Outer Comic Stage */}
      <div className="w-full max-w-[480px] h-[96vh] max-h-[820px] flex flex-col relative rounded-2xl overflow-hidden border-4 border-[#1a1a1a] shadow-[0_12px_40px_rgba(0,0,0,0.55)] bg-[#8ecae6]">

        {/* Top Comic Book HUD Bar */}
        <header className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between px-3 py-2 bg-white/95 backdrop-blur-sm border-3 border-[#1a1a1a] rounded-xl shadow-[0_4px_0_#1a1a1a]">
          {/* Score & Combo */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 font-black text-lg text-slate-900">
              <span className="text-xl">🍎</span>
              <span className="font-mono tracking-tight">{score}</span>
            </div>
            {combo >= 3 && (
              <span className="text-xs font-black text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 animate-pulse">
                {combo}連擊!
              </span>
            )}
          </div>

          {/* Trophy Best Score */}
          <div className="hidden sm:flex items-center gap-1 text-xs font-bold text-slate-600">
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-mono">{bestScore}</span>
          </div>

          {/* Hearts Life counter */}
          <div className="flex items-center gap-1">
            {[1, 2, 3].map(h => (
              <Heart
                key={h}
                className={`w-5 h-5 transition-transform ${
                  h <= lives
                    ? 'text-red-500 fill-red-500 scale-100'
                    : 'text-slate-300 fill-slate-200 scale-90'
                }`}
              />
            ))}
          </div>

          {/* Utility Action Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToggleSound}
              aria-label={soundEnabled ? '靜音' : '開啟音效'}
              className="p-1.5 rounded-lg border-2 border-[#1a1a1a] bg-slate-100 hover:bg-slate-200 active:translate-y-0.5 transition-colors cursor-pointer"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-slate-800" />
              ) : (
                <VolumeX className="w-4 h-4 text-red-500" />
              )}
            </button>

            {gameState === 'PLAYING' && (
              <button
                onClick={handleTogglePause}
                aria-label="暫停遊戲"
                className="p-1.5 rounded-lg border-2 border-[#1a1a1a] bg-amber-300 hover:bg-amber-400 active:translate-y-0.5 transition-colors cursor-pointer"
              >
                <Pause className="w-4 h-4 text-slate-900" />
              </button>
            )}

            <button
              onClick={() => setShowHelp(prev => !prev)}
              aria-label="遊戲說明"
              className="p-1.5 rounded-lg border-2 border-[#1a1a1a] bg-sky-200 hover:bg-sky-300 active:translate-y-0.5 transition-colors cursor-pointer"
            >
              <Info className="w-4 h-4 text-slate-900" />
            </button>
          </div>
        </header>

        {/* Interactive Canvas */}
        <div
          ref={containerRef}
          className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing"
          onMouseMove={e => handlePointer(e.clientX)}
          onTouchMove={e => {
            if (e.touches.length > 0) handlePointer(e.touches[0].clientX);
          }}
          onTouchStart={e => {
            if (e.touches.length > 0) handlePointer(e.touches[0].clientX);
          }}
        >
          <canvas ref={canvasRef} className="w-full h-full block" />

          {/* Touch arrow controls on mobile screens */}
          {gameState === 'PLAYING' && (
            <div className="sm:hidden absolute bottom-12 left-4 right-4 flex justify-between pointer-events-auto">
              <button
                onClick={handleMoveLeft}
                aria-label="向左移動"
                className="w-14 h-14 bg-white/80 active:bg-white border-3 border-[#1a1a1a] rounded-full shadow-[0_4px_0_#1a1a1a] flex items-center justify-center text-slate-900 active:translate-y-1 transition-all"
              >
                <ArrowLeft className="w-7 h-7" />
              </button>
              <button
                onClick={handleMoveRight}
                aria-label="向右移動"
                className="w-14 h-14 bg-white/80 active:bg-white border-3 border-[#1a1a1a] rounded-full shadow-[0_4px_0_#1a1a1a] flex items-center justify-center text-slate-900 active:translate-y-1 transition-all"
              >
                <ArrowRight className="w-7 h-7" />
              </button>
            </div>
          )}
        </div>

        {/* MODAL 1: START SCREEN */}
        {gameState === 'START' && (
          <div className="absolute inset-0 z-30 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#fffdf7] border-4 border-[#1a1a1a] rounded-2xl p-6 w-full max-w-[340px] shadow-[6px_6px_0_#1a1a1a] text-center">
              <div className="inline-block px-3 py-1 bg-amber-300 border-2 border-[#1a1a1a] rounded-md font-black text-xs text-slate-900 mb-2">
                PEANUTS TRIBUTE GAME
              </div>
              <h1 className="text-2xl font-black text-[#d90429] tracking-tight mb-1">
                史努比接蘋果
              </h1>
              <p className="text-xs font-bold text-slate-600 mb-3">
                秋天豐收了！移動狗屋幫趴在屋頂上的史努比接美味點心
              </p>

              {/* Charlie Brown yellow zigzag chevron */}
              <div
                className="h-2.5 w-full rounded my-3 border border-[#1a1a1a]"
                style={{
                  background:
                    'repeating-linear-gradient(-45deg, #f8c51c 0, #f8c51c 8px, #1a1a1a 8px, #1a1a1a 12px)'
                }}
              />

              {/* Point Values Grid */}
              <div className="bg-amber-50/70 border-2 border-dashed border-[#1a1a1a] rounded-xl p-3 my-3 grid grid-cols-3 gap-1 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-2xl">🍎</span>
                  <span className="text-xs font-bold text-slate-800">+10分</span>
                  <span className="text-[10px] text-slate-500">紅蘋果</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl">🍏</span>
                  <span className="text-xs font-bold text-slate-800">+5分</span>
                  <span className="text-[10px] text-slate-500">青蘋果</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl">🍪</span>
                  <span className="text-xs font-bold text-slate-800">+30分</span>
                  <span className="text-[10px] text-slate-500">巧克力餅乾</span>
                </div>
              </div>

              <div className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 mb-4">
                ⚠️ 蘋果落地會扣除 1 顆愛心！
                <br />
                <span className="text-amber-700">🕊️ 留意偶爾飛過的小黃鳥糊塗塌客！</span>
              </div>

              <button
                onClick={handleStartGame}
                className="w-full py-3 px-6 bg-[#ef233c] hover:bg-[#d90429] text-white font-black text-xl rounded-full border-3 border-[#1a1a1a] shadow-[0_5px_0_#1a1a1a] active:translate-y-1 active:shadow-[0_1px_0_#1a1a1a] transition-all cursor-pointer"
              >
                開始遊戲 START
              </button>

              <div className="mt-3 text-[11px] text-slate-500 font-medium">
                支援鍵盤 ← → / AD、滑鼠移動與觸控操作
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: PAUSED SCREEN */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 z-30 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#fffdf7] border-4 border-[#1a1a1a] rounded-2xl p-6 w-full max-w-[320px] shadow-[6px_6px_0_#1a1a1a] text-center">
              <h2 className="text-2xl font-black text-slate-900 mb-2">遊戲暫停</h2>
              <p className="text-sm font-bold text-slate-600 mb-4">
                史努比正在狗屋上伸懶腰...
              </p>

              <div className="space-y-3">
                <button
                  onClick={handleTogglePause}
                  className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-500 text-slate-900 font-black text-lg rounded-xl border-3 border-[#1a1a1a] shadow-[0_4px_0_#1a1a1a] active:translate-y-1 active:shadow-[0_1px_0_#1a1a1a] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-slate-900" /> 繼續遊戲 RESUME
                </button>

                <button
                  onClick={handleStartGame}
                  className="w-full py-2 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-sm rounded-xl border-2 border-[#1a1a1a] active:translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> 重新開始 RESTART
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: GAME OVER SCREEN */}
        {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 z-30 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#fffdf7] border-4 border-[#1a1a1a] rounded-2xl p-6 w-full max-w-[340px] shadow-[6px_6px_0_#1a1a1a] text-center">
              <h2 className="text-2xl font-black text-[#457b9d] mb-1">GAME OVER</h2>
              <p className="text-xs font-bold text-slate-500 mb-3">愛心用光了，下次接得更準！</p>

              {/* Scores summary */}
              <div className="bg-amber-50/80 border-2 border-[#1a1a1a] rounded-xl p-3 my-2 text-center">
                <div className="text-xs text-slate-600 font-bold">本次得分</div>
                <div className="text-3xl font-black text-[#e63946] font-mono tracking-tight">
                  {score}
                </div>
                <div className="flex items-center justify-center gap-1 text-xs text-slate-600 font-bold mt-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  歷史最高：<span className="font-mono text-slate-900">{bestScore}</span>
                </div>
              </div>

              {/* Item catching statistics */}
              <div className="grid grid-cols-4 gap-1 text-center py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg my-2">
                <div>
                  <div>🍎</div>
                  <div className="font-mono text-[11px]">{stats.redApples}</div>
                </div>
                <div>
                  <div>🍏</div>
                  <div className="font-mono text-[11px]">{stats.greenApples}</div>
                </div>
                <div>
                  <div>🍪</div>
                  <div className="font-mono text-[11px]">{stats.cookies}</div>
                </div>
                <div>
                  <div>🔥連擊</div>
                  <div className="font-mono text-[11px]">{stats.maxCombo}</div>
                </div>
              </div>

              <div
                className="h-2 w-full rounded my-3 border border-[#1a1a1a]"
                style={{
                  background:
                    'repeating-linear-gradient(-45deg, #f8c51c 0, #f8c51c 8px, #1a1a1a 8px, #1a1a1a 12px)'
                }}
              />

              <button
                onClick={handleStartGame}
                className="w-full py-3 px-6 bg-[#ef233c] hover:bg-[#d90429] text-white font-black text-xl rounded-full border-3 border-[#1a1a1a] shadow-[0_5px_0_#1a1a1a] active:translate-y-1 active:shadow-[0_1px_0_#1a1a1a] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-5 h-5" /> 再玩一次 RESTART
              </button>
            </div>
          </div>
        )}

        {/* MODAL 4: HELP / ABOUT POPUP */}
        {showHelp && (
          <div className="absolute inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#fffdf7] border-4 border-[#1a1a1a] rounded-2xl p-5 w-full max-w-[340px] shadow-[6px_6px_0_#1a1a1a]">
              <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2 mb-3">
                <div className="font-black text-slate-900 text-lg flex items-center gap-1.5">
                  <Sparkles className="w-5 h-5 text-amber-500" /> 玩法與規則
                </div>
                <button
                  onClick={() => setShowHelp(false)}
                  className="font-black text-slate-500 hover:text-slate-900 text-lg px-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs space-y-2 text-slate-700 leading-relaxed font-medium">
                <p>
                  • <strong>移動操作</strong>：使用鍵盤左右鍵（← / → 或 A / D），或者在畫面左右拖曳滑鼠/手指。
                </p>
                <p>
                  • <strong>紅蘋果 🍎</strong>：+10分；<strong>青蘋果 🍏</strong>：+5分。兩者若漏接落地會各扣 1 顆愛心！
                </p>
                <p>
                  • <strong>巧克力餅乾 🍪</strong>：+30分。漏接不會扣心。
                </p>
                <p>
                  • <strong>黃金星星 ⭐</strong>：糊塗塌客（Woodstock）飛過時隨機掉落，可獲得 +50分，並能恢復 1 顆已失去的愛心！
                </p>
                <p>
                  • <strong>連續接中 Combo</strong>：連續接物無失誤會累計連擊倍率，分數翻倍跳！
                </p>
              </div>

              <button
                onClick={() => setShowHelp(false)}
                className="w-full mt-4 py-2 bg-slate-800 text-white font-bold rounded-xl text-sm hover:bg-slate-700 cursor-pointer"
              >
                我知道了 GOT IT
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
