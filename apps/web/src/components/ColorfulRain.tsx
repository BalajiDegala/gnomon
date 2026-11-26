import { useEffect, useRef, useState } from 'react';
import { useDeveloperMode } from '../lib/developer-mode';

// ============== OVERVIEW PAGE: Runaway Button ==============
function useRunawayButton(active: boolean) {
  const buttonRef = useRef<HTMLElement | null>(null);
  const currentOffset = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!active) return;

    const findButton = () => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('start workday') || text.includes('start another')) {
          return btn as HTMLElement;
        }
      }
      return null;
    };

    const button = findButton();
    if (!button) return;

    buttonRef.current = button;
    button.style.position = 'relative';
    button.style.zIndex = '10000';
    button.style.transition = 'box-shadow 0.2s';

    const ESCAPE_DISTANCE = 120;
    const ESCAPE_SPEED = 20;
    const FRICTION = 0.88;

    let mouseX = -1000;
    let mouseY = -1000;
    let animationFrame = 0;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      if (!buttonRef.current) return;

      const button = buttonRef.current;
      const rect = button.getBoundingClientRect();
      const buttonCenterX = rect.left + rect.width / 2;
      const buttonCenterY = rect.top + rect.height / 2;

      const dx = mouseX - buttonCenterX;
      const dy = mouseY - buttonCenterY;
      const distance = Math.hypot(dx, dy);

      if (distance < ESCAPE_DISTANCE && distance > 0) {
        const angle = Math.atan2(dy, dx);
        const escapeForce = (1 - distance / ESCAPE_DISTANCE) * ESCAPE_SPEED;
        velocity.current.x -= Math.cos(angle) * escapeForce;
        velocity.current.y -= Math.sin(angle) * escapeForce;
        velocity.current.x += (Math.random() - 0.5) * 2;
        velocity.current.y += (Math.random() - 0.5) * 2;
        button.style.boxShadow = '0 0 30px rgba(255, 100, 100, 0.6)';
      } else {
        button.style.boxShadow = '';
      }

      currentOffset.current.x += velocity.current.x;
      currentOffset.current.y += velocity.current.y;
      velocity.current.x *= FRICTION;
      velocity.current.y *= FRICTION;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const minX = -rect.left + 10;
      const maxX = vw - rect.right - 10;
      const minY = -rect.top + 80;
      const maxY = vh - rect.bottom - 10;

      if (currentOffset.current.x < minX) { currentOffset.current.x = minX; velocity.current.x *= -0.5; }
      if (currentOffset.current.x > maxX) { currentOffset.current.x = maxX; velocity.current.x *= -0.5; }
      if (currentOffset.current.y < minY) { currentOffset.current.y = minY; velocity.current.y *= -0.5; }
      if (currentOffset.current.y > maxY) { currentOffset.current.y = maxY; velocity.current.y *= -0.5; }

      const rotation = velocity.current.x * 0.3;
      button.style.transform = `translate(${currentOffset.current.x}px, ${currentOffset.current.y}px) rotate(${rotation}deg)`;
    };

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      velocity.current.x = (Math.random() - 0.5) * 60;
      velocity.current.y = (Math.random() - 0.5) * 60;
      return false;
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    button.addEventListener('click', onClick, { capture: true });
    button.addEventListener('mousedown', onClick, { capture: true });
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('mousemove', onMouseMove);
      if (buttonRef.current) {
        buttonRef.current.removeEventListener('click', onClick, { capture: true });
        buttonRef.current.removeEventListener('mousedown', onClick, { capture: true });
        buttonRef.current.style.position = '';
        buttonRef.current.style.transform = '';
        buttonRef.current.style.zIndex = '';
        buttonRef.current.style.boxShadow = '';
      }
    };
  }, [active]);
}

// ============== TIMECARD PAGE: Falling Cards ==============
function useFallingCards(active: boolean) {
  useEffect(() => {
    if (!active) return;

    interface FallingElement {
      element: HTMLElement;
      originalStyles: {
        position: string;
        transform: string;
        transition: string;
        zIndex: string;
      };
      y: number;
      vy: number;
      rotation: number;
      vr: number;
      fallen: boolean;
    }

    const fallingElements: FallingElement[] = [];
    const gravity = 0.8;
    const bounceDamping = 0.3;
    const groundY = window.innerHeight - 50;

    // Find all card-like elements on the page
    const findCards = () => {
      const selectors = [
        '[class*="card"]',
        '[class*="Card"]',
        '[class*="paper"]',
        '[class*="Paper"]',
        '[class*="MuiPaper"]',
        '[class*="MuiCard"]',
        '[class*="box"]',
        '[class*="Box"]',
        'table',
        '[role="grid"]',
      ];

      const elements = new Set<HTMLElement>();

      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          const htmlEl = el as HTMLElement;
          const rect = htmlEl.getBoundingClientRect();
          // Only get visible, reasonably sized elements
          if (rect.width > 100 && rect.height > 50 && rect.top < window.innerHeight) {
            elements.add(htmlEl);
          }
        });
      });

      return Array.from(elements);
    };

    const cards = findCards();

    // Setup each card for falling
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();

      fallingElements.push({
        element: card,
        originalStyles: {
          position: card.style.position,
          transform: card.style.transform,
          transition: card.style.transition,
          zIndex: card.style.zIndex,
        },
        y: 0,
        vy: 0,
        rotation: 0,
        vr: (Math.random() - 0.5) * 5,
        fallen: false,
      });

      // Apply initial styles
      card.style.position = 'relative';
      card.style.zIndex = String(1000 + index);
      card.style.transition = 'none';
    });

    // Stagger the falling - each card starts falling after a delay
    const startTimes = fallingElements.map((_, i) => Date.now() + i * 200);

    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = Date.now();

      fallingElements.forEach((item, index) => {
        // Don't start falling until it's this card's turn
        if (now < startTimes[index]!) return;

        const rect = item.element.getBoundingClientRect();
        const elementBottom = rect.top + rect.height + item.y;

        // Apply gravity
        item.vy += gravity;
        item.y += item.vy;
        item.rotation += item.vr;

        // Ground collision
        if (elementBottom >= groundY) {
          item.y = groundY - rect.top - rect.height;

          if (Math.abs(item.vy) > 2) {
            item.vy *= -bounceDamping;
            item.vr *= 0.8;
          } else {
            item.vy = 0;
            item.vr *= 0.95;
            item.fallen = true;
          }
        }

        // Slow down rotation when settled
        if (item.fallen) {
          item.vr *= 0.95;
          if (Math.abs(item.vr) < 0.1) item.vr = 0;
        }

        // Apply transform
        item.element.style.transform = `translateY(${item.y}px) rotate(${item.rotation}deg)`;
      });

      // Check if all cards have settled
      const allSettled = fallingElements.every(item =>
        item.fallen && Math.abs(item.vy) < 0.1 && Math.abs(item.vr) < 0.1
      );

      if (allSettled) {
        // Keep the final state, stop animating
        cancelAnimationFrame(raf);
      }
    };

    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);

      // Restore original styles
      fallingElements.forEach((item) => {
        item.element.style.position = item.originalStyles.position;
        item.element.style.transform = item.originalStyles.transform;
        item.element.style.transition = item.originalStyles.transition;
        item.element.style.zIndex = item.originalStyles.zIndex;
      });
    };
  }, [active]);
}

// ============== CALENDAR PAGE: Mario Game (Transparent) ==============
function useMarioGame(active: boolean) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 99999;
    `;
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d')!;
    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    // Mario state
    let marioX = 50;
    let marioY = h - 150;
    let marioVy = 0;
    let marioVx = 0;
    let marioFrame = 0;
    let marioDir = 1;
    let isJumping = false;
    let isOnGround = true;
    let totalCoins = 0;
    let currentStage = 1;
    let stageCoins = 0;
    let transitioning = false;
    let transitionAlpha = 0;
    let autoWalk = false;
    let reachedTop = false;
    let stageComplete = false;

    // Bricks and coins
    interface Brick {
      x: number;
      y: number;
      width: number;
      height: number;
      broken: boolean;
      isQuestion: boolean;
      hasCoin: boolean;
      particles: { x: number; y: number; vx: number; vy: number; rot: number }[];
    }

    interface Coin {
      x: number;
      y: number;
      collected: boolean;
      bobPhase: number;
      popping: boolean;
      popY: number;
    }

    interface Ladder {
      x: number;
      y: number;
      height: number;
    }

    let bricks: Brick[] = [];
    let coins: Coin[] = [];
    let ladders: Ladder[] = [];

    // Create stage layout
    const createStage = (stage: number) => {
      bricks = [];
      coins = [];
      ladders = [];
      stageCoins = 0;
      reachedTop = false;
      stageComplete = false;
      autoWalk = false;
      marioX = 50;
      marioY = h - 150;

      const brickSize = 40;

      // GROUND BRICKS
      for (let x = 0; x < w; x += brickSize) {
        bricks.push({
          x,
          y: h - 60,
          width: brickSize,
          height: 60,
          broken: false,
          isQuestion: false,
          hasCoin: false,
          particles: [],
        });
      }

      // Stage-specific layouts
      if (stage === 1) {
        // Stage 1: SUPER EASY - One big ladder straight to top!

        // One long ladder on the left - goes all the way up
        ladders.push({
          x: 150,
          y: 100,
          height: h - 180,
        });

        // A few platforms to rest on while climbing
        for (let i = 1; i <= 4; i++) {
          const platY = h - 100 - i * 150;
          for (let b = 0; b < 5; b++) {
            bricks.push({
              x: 100 + b * brickSize,
              y: platY,
              width: brickSize,
              height: brickSize / 2,
              broken: false,
              isQuestion: false,
              hasCoin: false,
              particles: [],
            });
          }
          // Coins on each platform
          coins.push({
            x: 200,
            y: platY - 30,
            collected: false,
            bobPhase: i,
            popping: false,
            popY: 0,
          });
        }

        // Top platform - stretches across to the exit
        for (let x = 100; x < w; x += brickSize) {
          bricks.push({
            x,
            y: 100,
            width: brickSize,
            height: brickSize / 2,
            broken: false,
            isQuestion: false,
            hasCoin: false,
            particles: [],
          });
        }

        // Coins leading to exit on top
        for (let i = 0; i < 10; i++) {
          coins.push({
            x: 300 + i * 60,
            y: 60,
            collected: false,
            bobPhase: i * 0.3,
            popping: false,
            popY: 0,
          });
        }

      } else if (stage === 2) {
        // Stage 2: THE TREASURE ROOM - HUGE GOLD!

        // Platform in the center
        for (let x = w / 2 - 200; x < w / 2 + 200; x += brickSize) {
          bricks.push({
            x,
            y: h / 2,
            width: brickSize,
            height: brickSize / 2,
            broken: false,
            isQuestion: false,
            hasCoin: false,
            particles: [],
          });
        }

        // Ladder from ground to platform
        ladders.push({
          x: w / 2 - 20,
          y: h / 2,
          height: h / 2 - 60,
        });

        // MASSIVE COIN COLLECTION - treasure everywhere!
        // Giant circle of coins
        for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
          const radius = 150;
          coins.push({
            x: w / 2 + Math.cos(angle) * radius,
            y: h / 2 - 150 + Math.sin(angle) * radius * 0.5,
            collected: false,
            bobPhase: angle,
            popping: false,
            popY: 0,
          });
        }

        // Inner ring of coins
        for (let angle = 0; angle < Math.PI * 2; angle += 0.5) {
          const radius = 80;
          coins.push({
            x: w / 2 + Math.cos(angle) * radius,
            y: h / 2 - 150 + Math.sin(angle) * radius * 0.5,
            collected: false,
            bobPhase: angle + 1,
            popping: false,
            popY: 0,
          });
        }

        // Center mega coin will be drawn specially
        coins.push({
          x: w / 2,
          y: h / 2 - 150,
          collected: false,
          bobPhase: 0,
          popping: false,
          popY: 0,
        });

        // Rain of coins on sides
        for (let i = 0; i < 15; i++) {
          coins.push({
            x: 50 + Math.random() * 150,
            y: 100 + Math.random() * (h - 300),
            collected: false,
            bobPhase: Math.random() * 10,
            popping: false,
            popY: 0,
          });
          coins.push({
            x: w - 200 + Math.random() * 150,
            y: 100 + Math.random() * (h - 300),
            collected: false,
            bobPhase: Math.random() * 10,
            popping: false,
            popY: 0,
          });
        }

        // Top platform to exit (victory!)
        for (let x = w - 250; x < w; x += brickSize) {
          bricks.push({
            x,
            y: 80,
            width: brickSize,
            height: brickSize / 2,
            broken: false,
            isQuestion: false,
            hasCoin: false,
            particles: [],
          });
        }

        // Ladder to top exit
        ladders.push({
          x: w - 200,
          y: 80,
          height: h / 2 - 80,
        });

      } else {
        // Stage 3+: Victory lap - even more treasure
        // Fill screen with coins!
        for (let x = 100; x < w - 100; x += 60) {
          for (let y = 150; y < h - 150; y += 80) {
            coins.push({
              x: x + Math.random() * 20,
              y: y + Math.random() * 20,
              collected: false,
              bobPhase: Math.random() * Math.PI * 2,
              popping: false,
              popY: 0,
            });
          }
        }

        // Simple platform path
        for (let i = 0; i < 5; i++) {
          const platX = 100 + i * 180;
          const platY = h - 150 - i * 80;

          for (let b = 0; b < 3; b++) {
            bricks.push({
              x: platX + b * brickSize,
              y: platY,
              width: brickSize,
              height: brickSize / 2,
              broken: false,
              isQuestion: false,
              hasCoin: false,
              particles: [],
            });
          }

          if (i < 4) {
            ladders.push({
              x: platX + 40,
              y: platY - 80,
              height: 80,
            });
          }
        }

        // Top exit
        for (let x = w - 300; x < w; x += brickSize) {
          bricks.push({
            x,
            y: 80,
            width: brickSize,
            height: brickSize / 2,
            broken: false,
            isQuestion: false,
            hasCoin: false,
            particles: [],
          });
        }

        ladders.push({
          x: w - 250,
          y: 80,
          height: 200,
        });
      }

      // Flag pole at the end (all stages)
      bricks.push({
        x: w - 50,
        y: 80,
        width: 15,
        height: h - 140,
        broken: false,
        isQuestion: false,
        hasCoin: false,
        particles: [],
      });
    };

    createStage(currentStage);

    // Ground level
    const groundY = h - 80;

    // Keyboard controls
    const keys: { [key: string]: boolean } = {};
    let isOnLadder = false;

    const checkOnLadder = () => {
      const marioCenter = marioX + 25;
      const marioBottom = marioY + 50;

      for (const ladder of ladders) {
        if (
          marioCenter > ladder.x - 10 &&
          marioCenter < ladder.x + 50 &&
          marioBottom > ladder.y &&
          marioY < ladder.y + ladder.height
        ) {
          return true;
        }
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key] = true;
      if (e.key === ' ' || e.key === 'ArrowUp') {
        if (isOnGround && !isOnLadder) {
          marioVy = -18;
          isJumping = true;
          isOnGround = false;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      createBricks();
    };
    window.addEventListener('resize', resize);

    const drawBrick = (brick: Brick) => {
      if (brick.broken) {
        // Draw particles
        brick.particles.forEach((p) => {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(-8, -8, 16, 16);
          ctx.strokeStyle = '#5D3A1A';
          ctx.strokeRect(-8, -8, 16, 16);
          ctx.restore();
        });
        return;
      }

      // Flag pole
      if (brick.width === 20 && brick.height > 100) {
        // Pole
        ctx.fillStyle = '#228B22';
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
        // Flag
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.moveTo(brick.x + brick.width, brick.y);
        ctx.lineTo(brick.x + brick.width + 50, brick.y + 25);
        ctx.lineTo(brick.x + brick.width, brick.y + 50);
        ctx.closePath();
        ctx.fill();
        // Ball on top
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(brick.x + brick.width / 2, brick.y - 10, 12, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      // Question block
      if (brick.isQuestion && brick.hasCoin) {
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 3;
        ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
        ctx.fillStyle = '#8B4513';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', brick.x + brick.width / 2, brick.y + brick.height / 2);
        return;
      }

      // Empty question block
      if (brick.isQuestion && !brick.hasCoin) {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
        ctx.strokeStyle = '#5D3A1A';
        ctx.lineWidth = 2;
        ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
        return;
      }

      // Ground bricks
      if (brick.y > h - 100) {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
        ctx.strokeStyle = '#5D3A1A';
        ctx.lineWidth = 1;
        ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
        // Grass on top
        ctx.fillStyle = '#228B22';
        ctx.fillRect(brick.x, brick.y, brick.width, 10);
        return;
      }

      // Regular brick pattern
      ctx.fillStyle = '#CD853F';
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 2;
      ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);

      // Brick lines for larger bricks
      if (brick.height > 25) {
        ctx.beginPath();
        ctx.moveTo(brick.x, brick.y + brick.height / 2);
        ctx.lineTo(brick.x + brick.width, brick.y + brick.height / 2);
        ctx.stroke();
      }
    };

    const drawLadder = (ladder: Ladder) => {
      const ladderWidth = 40;
      const rungSpacing = 30;

      // Side rails
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(ladder.x, ladder.y, 8, ladder.height);
      ctx.fillRect(ladder.x + ladderWidth - 8, ladder.y, 8, ladder.height);

      // Rungs
      ctx.fillStyle = '#A0522D';
      for (let y = ladder.y + 20; y < ladder.y + ladder.height - 10; y += rungSpacing) {
        ctx.fillRect(ladder.x, y, ladderWidth, 6);
      }

      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(ladder.x + 2, ladder.y, 4, ladder.height);
    };

    const drawCoin = (coin: Coin, time: number) => {
      if (coin.collected) return;

      const bobY = Math.sin(time * 5 + coin.bobPhase) * 5;
      const stretch = 0.7 + Math.sin(time * 3 + coin.bobPhase) * 0.3;

      ctx.save();
      ctx.translate(coin.x, coin.y + bobY);
      ctx.scale(stretch, 1);

      // Outer glow
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 15;

      // Coin body
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner shine
      ctx.fillStyle = '#FFF8DC';
      ctx.beginPath();
      ctx.ellipse(-3, -4, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dollar sign or star
      ctx.fillStyle = '#DAA520';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', 0, 1);

      ctx.shadowBlur = 0;
      ctx.restore();
    };

    // Coin collection particles
    const coinParticles: { x: number; y: number; vx: number; vy: number; life: number }[] = [];

    const collectCoin = (coin: Coin) => {
      coin.collected = true;
      stageCoins++;

      // Spawn sparkle particles
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        coinParticles.push({
          x: coin.x,
          y: coin.y,
          vx: Math.cos(angle) * 6,
          vy: Math.sin(angle) * 6,
          life: 1,
        });
      }
    };

    // Store coins when moving to next stage
    const advanceStage = () => {
      totalCoins += stageCoins;
      currentStage++;
      createStage(currentStage);
    };

    const drawMario = (x: number, y: number, frame: number, dir: number) => {
      ctx.save();
      ctx.translate(x + 25, y + 25);
      ctx.scale(dir, 1);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 30, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body (red overalls)
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(-15, -5, 30, 25);

      // Head (skin)
      ctx.fillStyle = '#FFDAB9';
      ctx.beginPath();
      ctx.arc(0, -15, 15, 0, Math.PI * 2);
      ctx.fill();

      // Hat (red)
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(-18, -28, 36, 10);
      ctx.fillRect(-12, -35, 24, 8);

      // Hat brim
      ctx.fillStyle = '#CC0000';
      ctx.fillRect(-20, -20, 40, 5);

      // M logo
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(0, -30, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('M', 0, -27);

      // Mustache
      ctx.fillStyle = '#4A3728';
      ctx.beginPath();
      ctx.ellipse(0, -6, 12, 4, 0, 0, Math.PI);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-5, -15, 3, 0, Math.PI * 2);
      ctx.arc(5, -15, 3, 0, Math.PI * 2);
      ctx.fill();

      // Nose
      ctx.fillStyle = '#FFDAB9';
      ctx.beginPath();
      ctx.ellipse(0, -10, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Legs (blue) - animated
      ctx.fillStyle = '#0000CD';
      const legOffset = isJumping ? 10 : Math.sin(frame * 0.5) * 8;
      ctx.fillRect(-12, 20, 10, 18 + legOffset);
      ctx.fillRect(2, 20, 10, 18 - legOffset);

      // Shoes (brown)
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(-14, 36 + legOffset, 14, 8);
      ctx.fillRect(0, 36 - legOffset, 14, 8);

      ctx.restore();
    };

    let raf = 0;
    let gameTime = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      gameTime += 1 / 60;

      // Clear canvas (transparent - shows calendar behind)
      ctx.clearRect(0, 0, w, h);

      // Stage transition
      if (transitioning) {
        transitionAlpha += 0.02;
        if (transitionAlpha >= 1) {
          currentStage++;
          createStage(currentStage);
          transitioning = false;
        }
        ctx.fillStyle = `rgba(0, 0, 0, ${transitionAlpha})`;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';

        if (currentStage === 1) {
          ctx.fillText('TREASURE AHEAD!', w / 2, h / 2 - 30);
          ctx.font = 'bold 32px Arial';
          ctx.fillText('Stage 2: The Gold Room', w / 2, h / 2 + 20);
        } else {
          ctx.fillText(`STAGE ${currentStage + 1}`, w / 2, h / 2);
        }
        return;
      }

      // Fade in from transition
      if (transitionAlpha > 0) {
        transitionAlpha -= 0.02;
      }

      // Check if on ladder
      isOnLadder = checkOnLadder();

      // Auto-walk when reached top
      if (autoWalk) {
        marioVx = 5;
        marioDir = 1;
        marioFrame += 0.3;

        if (marioX > w + 50) {
          transitioning = true;
          transitionAlpha = 0;
        }
      } else {
        // Player controls
        if (keys['ArrowLeft'] || keys['a']) {
          marioVx = -7;
          marioDir = -1;
        } else if (keys['ArrowRight'] || keys['d']) {
          marioVx = 7;
          marioDir = 1;
        } else {
          marioVx *= 0.85;
        }

        // Ladder climbing
        if (isOnLadder) {
          if (keys['ArrowUp'] || keys['w']) {
            marioY -= 5;
            marioVy = 0;
            marioFrame += 0.2;
          } else if (keys['ArrowDown'] || keys['s']) {
            marioY += 5;
            marioVy = 0;
            marioFrame += 0.2;
          }
        }
      }

      marioX += marioVx;
      marioFrame += Math.abs(marioVx) * 0.1;

      // Keep in bounds (unless auto-walking to exit)
      if (!autoWalk) {
        if (marioX < 0) marioX = 0;
        if (marioX > w - 50) marioX = w - 50;
      }

      // Gravity (disabled on ladder)
      if (!isOnLadder) {
        marioVy += 0.7;
      }
      marioY += marioVy;

      // Check if touched the flag pole (right side of screen)
      if (marioX > w - 100 && !reachedTop) {
        reachedTop = true;
        stageComplete = true;
        setTimeout(() => {
          autoWalk = true;
        }, 300);
      }

      // Ground collision
      const groundY = h - 110;
      if (marioY > groundY) {
        marioY = groundY;
        marioVy = 0;
        isOnGround = true;
        isJumping = false;
      }

      // Brick collisions
      isOnGround = marioY >= groundY;

      bricks.forEach((brick) => {
        if (brick.broken) {
          brick.particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.5;
            p.rot += 0.1;
          });
          brick.particles = brick.particles.filter((p) => p.y < h + 50);
          return;
        }

        // Skip flag pole for collision
        if (brick.width === 20 && brick.height > 100) return;

        const marioRight = marioX + 45;
        const marioBottom = marioY + 50;
        const brickRight = brick.x + brick.width;
        const brickBottom = brick.y + brick.height;

        if (marioRight > brick.x && marioX < brickRight && marioBottom > brick.y && marioY < brickBottom) {
          const overlapLeft = marioRight - brick.x;
          const overlapRight = brickRight - marioX;
          const overlapTop = marioBottom - brick.y;
          const overlapBottom = brickBottom - marioY;

          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

          if (minOverlap === overlapTop && marioVy > 0) {
            marioY = brick.y - 50;
            marioVy = 0;
            isOnGround = true;
            isJumping = false;
          } else if (minOverlap === overlapBottom && marioVy < 0) {
            marioY = brickBottom;
            marioVy = 2;

            // Question block - pop out coin
            if (brick.isQuestion && brick.hasCoin) {
              brick.hasCoin = false;
              coins.push({
                x: brick.x + brick.width / 2,
                y: brick.y - 30,
                collected: false,
                bobPhase: 0,
                popping: true,
                popY: -10,
              });
            } else if (!brick.isQuestion && brick.y > 50) {
              // Break regular brick
              brick.broken = true;
              for (let i = 0; i < 8; i++) {
                brick.particles.push({
                  x: brick.x + brick.width / 2,
                  y: brick.y + brick.height / 2,
                  vx: (Math.random() - 0.5) * 15,
                  vy: -Math.random() * 12 - 5,
                  rot: Math.random() * Math.PI * 2,
                });
              }
            }
          } else if (minOverlap === overlapLeft) {
            marioX = brick.x - 45;
            marioVx = 0;
          } else if (minOverlap === overlapRight) {
            marioX = brickRight;
            marioVx = 0;
          }
        }
      });

      // Coin collection & popping animation
      coins.forEach((coin) => {
        if (coin.popping) {
          coin.popY -= 0.5;
          coin.y += coin.popY;
          if (coin.popY > 3) {
            coin.popping = false;
          }
        }

        if (coin.collected) return;

        const dx = (marioX + 25) - coin.x;
        const dy = (marioY + 25) - coin.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 40) {
          collectCoin(coin);
        }
      });

      // Update coin particles
      for (let i = coinParticles.length - 1; i >= 0; i--) {
        const p = coinParticles[i]!;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life -= 0.03;
        if (p.life <= 0) coinParticles.splice(i, 1);
      }

      // Draw ladders (behind bricks)
      ladders.forEach((ladder) => drawLadder(ladder));

      // Draw bricks
      bricks.forEach((brick) => drawBrick(brick));

      // Draw coins
      coins.forEach((coin) => drawCoin(coin, gameTime));

      // Draw coin particles
      coinParticles.forEach((p) => {
        ctx.fillStyle = `rgba(255, 215, 0, ${p.life})`;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw Mario
      drawMario(marioX, marioY, marioFrame, marioDir);

      // UI Panel
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(10, 10, 200, 75);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.strokeRect(10, 10, 200, 75);

      // Stage number
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`STAGE ${currentStage}`, 25, 32);

      // Coin counter
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(`★ ${totalCoins + stageCoins}`, 120, 32);

      // Instructions
      ctx.fillStyle = '#AAA';
      ctx.font = '11px Arial';
      ctx.fillText('← → move   ↑↓ climb   SPACE jump', 25, 52);
      ctx.fillText('Use ladders! Reach the flag!', 25, 68);

      // Stage complete message
      if (stageComplete && !autoWalk) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(w / 2 - 150, h / 2 - 40, 300, 80);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.strokeRect(w / 2 - 150, h / 2 - 40, 300, 80);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('STAGE CLEAR!', w / 2, h / 2);
        ctx.font = '14px Arial';
        ctx.fillStyle = '#FFF';
        ctx.fillText('Walking to next stage...', w / 2, h / 2 + 25);
      }

      // Transition overlay
      if (transitionAlpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${transitionAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    };

    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.remove();
    };
  }, [active]);
}

// ============== CATCHUP PAGE: Disappearing Words (Random) ==============
function useDisappearingWords(active: boolean) {
  useEffect(() => {
    if (!active) return;

    interface WordSpan {
      element: HTMLElement;
      originalText: string;
      parentElement: HTMLElement;
      currentText: string;
      disappeared: boolean;
    }

    const wordSpans: WordSpan[] = [];
    const processedElements = new Set<HTMLElement>();

    // Find ALL text nodes and wrap each word in a span
    const wrapWords = () => {
      const walker = document.createTreeWalker(
        document.querySelector('main') || document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes: { node: Text; parent: HTMLElement }[] = [];
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim();
        if (text && text.length > 0 && node.parentElement) {
          textNodes.push({ node: node as Text, parent: node.parentElement as HTMLElement });
        }
      }

      textNodes.forEach(({ node, parent }) => {
        if (processedElements.has(parent)) return;

        const text = node.textContent || '';
        const words = text.split(/(\s+)/);

        if (words.length <= 1) return;

        const fragment = document.createDocumentFragment();

        words.forEach((word) => {
          if (word.trim()) {
            const span = document.createElement('span');
            span.textContent = word;
            span.style.transition = 'opacity 0.5s, transform 0.5s';
            span.style.display = 'inline';
            fragment.appendChild(span);

            wordSpans.push({
              element: span,
              originalText: word,
              parentElement: parent,
              currentText: word,
              disappeared: false,
            });
          } else {
            fragment.appendChild(document.createTextNode(word));
          }
        });

        node.replaceWith(fragment);
        processedElements.add(parent);
      });
    };

    wrapWords();

    // Randomly disappear words
    const disappearRandomWord = () => {
      const availableWords = wordSpans.filter((w) => !w.disappeared);
      if (availableWords.length === 0) {
        // All words gone - restart after a pause
        setTimeout(() => {
          wordSpans.forEach((w) => {
            w.element.textContent = w.originalText;
            w.element.style.opacity = '1';
            w.element.style.transform = '';
            w.disappeared = false;
          });
        }, 2000);
        return;
      }

      // Pick random word
      const randomIndex = Math.floor(Math.random() * availableWords.length);
      const word = availableWords[randomIndex]!;

      // Animate disappearance
      word.element.style.opacity = '0';
      word.element.style.transform = 'scale(0.5) translateY(-10px)';

      setTimeout(() => {
        word.element.textContent = '';
        word.disappeared = true;
      }, 500);
    };

    // Start disappearing words randomly
    const interval = setInterval(disappearRandomWord, 150);

    return () => {
      clearInterval(interval);

      // Restore original content
      wordSpans.forEach((w) => {
        w.element.textContent = w.originalText;
        w.element.style.opacity = '1';
        w.element.style.transform = '';
      });
    };
  }, [active]);
}

// ============== ESC MESSAGE BOX (Type Any 10 Characters to Exit) ==============
function EscapeMessageBox({ onEscape }: { onEscape: () => void }) {
  const [visible, setVisible] = useState(false);
  const [userInput, setUserInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVisible(true);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  useEffect(() => {
    // Exit when 10 characters are typed
    if (userInput.length >= 10) {
      setTimeout(onEscape, 300);
    }
  }, [userInput, onEscape]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setVisible(false);
      setUserInput('');
    }
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          padding: '50px 70px',
          borderRadius: '24px',
          boxShadow: '0 0 80px rgba(100, 100, 255, 0.3)',
          border: '2px solid rgba(255, 255, 255, 0.1)',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#888', fontSize: '14px', marginBottom: '25px' }}>
          Type anything to escape ({userInput.length}/10)
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '30px' }}>
          {Array.from({ length: 10 }).map((_, i) => {
            const hasChar = userInput[i] !== undefined;
            return (
              <div
                key={i}
                style={{
                  width: '38px',
                  height: '50px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  borderRadius: '8px',
                  backgroundColor: hasChar ? '#4CAF50' : 'rgba(255, 255, 255, 0.08)',
                  color: hasChar ? '#fff' : '#444',
                  transition: 'all 0.15s ease',
                  transform: hasChar ? 'scale(1.1)' : 'scale(1)',
                  boxShadow: hasChar ? '0 0 15px rgba(76, 175, 80, 0.5)' : 'none',
                }}
              >
                {hasChar ? userInput[i]!.toUpperCase() : '•'}
              </div>
            );
          })}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={10}
          placeholder="Type anything..."
          style={{
            width: '200px',
            padding: '15px 20px',
            fontSize: '20px',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '2px solid rgba(100, 150, 255, 0.4)',
            borderRadius: '12px',
            color: '#fff',
            outline: 'none',
            textAlign: 'center',
            letterSpacing: '2px',
          }}
        />

        <p style={{ color: '#444', fontSize: '12px', marginTop: '20px' }}>
          Press ESC to close
        </p>
      </div>
    </div>
  );
}

// ============== MAIN COMPONENT ==============
export function ColorfulRain() {
  const { chaosTriggered, deactivate } = useDeveloperMode();
  const [currentPage, setCurrentPage] = useState<string>('');

  useEffect(() => {
    const detectPage = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const fullPath = path + hash;

      if (fullPath.includes('calendar')) return 'calendar';
      if (fullPath.includes('catch-up') || fullPath.includes('catchup')) return 'catchup';
      if (fullPath.includes('timecard')) return 'timecard';
      return 'overview';
    };

    setCurrentPage(detectPage());

    // Listen for navigation changes
    const handleNav = () => setCurrentPage(detectPage());
    window.addEventListener('popstate', handleNav);
    window.addEventListener('hashchange', handleNav);

    // Check periodically for SPA navigation
    const interval = setInterval(() => {
      const newPage = detectPage();
      if (newPage !== currentPage) {
        setCurrentPage(newPage);
      }
    }, 500);

    return () => {
      window.removeEventListener('popstate', handleNav);
      window.removeEventListener('hashchange', handleNav);
      clearInterval(interval);
    };
  }, [currentPage]);

  // All effects run based on current page
  useRunawayButton(chaosTriggered && currentPage === 'overview');
  useMarioGame(chaosTriggered && currentPage === 'calendar');
  useDisappearingWords(chaosTriggered && currentPage === 'catchup');
  useFallingCards(chaosTriggered && currentPage === 'timecard');

  if (!chaosTriggered) return null;

  return <EscapeMessageBox onEscape={deactivate} />;
}
