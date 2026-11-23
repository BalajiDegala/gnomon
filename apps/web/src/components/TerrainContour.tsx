import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

export interface TerrainContourHandle {
  /** Sends a stronger wave through the contour rings. */
  pulse: () => void;
}

interface Layout {
  cx: number;
  cy: number;
  scale: number;
}

const RINGS = [
  { center: 0.345, halfWidth: 0.068, peak: 1.0 },
  { center: 0.515, halfWidth: 0.062, peak: 0.84 },
  { center: 0.68, halfWidth: 0.056, peak: 0.66 },
  { center: 0.845, halfWidth: 0.052, peak: 0.48 },
];
/** Points further than this (in contour units) never carry ring dots. */
const FIELD_RADIUS = 1.35;
const FRAME_MS = 1000 / 30;

/** Contour sits right of centre on wide screens so the sign-in card has room on the left. */
function contourLayout(width: number, height: number): Layout {
  if (width >= 1024) {
    return { cx: width * 0.64, cy: height * 0.5, scale: Math.min(width * 0.33, height * 0.44) };
  }
  if (width >= 768) {
    return { cx: width * 0.66, cy: height * 0.48, scale: Math.min(width * 0.32, height * 0.4) };
  }
  return { cx: width * 0.5, cy: height * 0.32, scale: Math.min(width * 0.44, height * 0.28) };
}

/** Valley notch on the lower left, depending only on the angle (precomputed per point). */
function valleyIndent(theta: number): number {
  let dTheta = theta - 2.31;
  while (dTheta > Math.PI) dTheta -= Math.PI * 2;
  while (dTheta < -Math.PI) dTheta += Math.PI * 2;
  return 0.165 * Math.exp(-Math.pow(dTheta / 0.44, 2));
}

function readColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Halftone topographic contour drawn on a canvas: four terraced dot rings,
 * an outward wave, and a ripple that follows the cursor.
 *
 * Kept light: the static background grid is painted once to an offscreen
 * canvas; per-point angle maths is precomputed when the size changes; only
 * points near the contour are evaluated; it draws at 1× resolution and
 * 30 frames per second, and pauses while the tab is hidden.
 */
export function TerrainContour({ ref }: { ref?: Ref<TerrainContourHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boost = useRef(0);

  useImperativeHandle(ref, () => ({ pulse: () => void (boost.current = 1) }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const background = document.createElement('canvas');
    const bgCtx = background.getContext('2d', { alpha: false })!;

    const colors = { base: '#34373c', fg: '#ffffff', faint: '#aeb0b5' };
    let width = 0;
    let height = 0;
    let layout: Layout = { cx: 0, cy: 0, scale: 1 };
    let spacing = 8;
    let minRadius = 1;
    let maxRadius = 4;

    // Per-point data for the points near the contour (structure of arrays).
    let count = 0;
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let fade = new Float32Array(0);
    let radius = new Float32Array(0);
    let indent = new Float32Array(0);
    let cos2 = new Float32Array(0);
    let sin2 = new Float32Array(0);
    let cos3 = new Float32Array(0);
    let sin3 = new Float32Array(0);

    const pointer = { x: -9999, y: -9999, sx: -9999, sy: -9999, active: false };

    const verticalFade = (y: number) => {
      const top = height * 0.18;
      const bottom = height * 0.82;
      if (y < top) {
        const n = Math.max(0, Math.min(1, y / top));
        return n * n * (3 - 2 * n);
      }
      if (y > bottom) {
        const n = Math.max(0, Math.min(1, (height - y) / (height - bottom)));
        return n * n * (3 - 2 * n);
      }
      return 1;
    };

    /** Static layer: base colour plus the faint dot grid. Repainted on resize or theme change. */
    const paintBackground = () => {
      background.width = width;
      background.height = height;
      bgCtx.fillStyle = colors.base;
      bgCtx.fillRect(0, 0, width, height);
      bgCtx.globalAlpha = 0.55;
      bgCtx.fillStyle = colors.faint;
      bgCtx.beginPath();
      const startCol = Math.floor(-layout.cx / spacing) - 1;
      const endCol = Math.ceil((width - layout.cx) / spacing) + 1;
      const startRow = Math.floor(-layout.cy / spacing) - 1;
      const endRow = Math.ceil((height - layout.cy) / spacing) + 1;
      for (let row = startRow; row <= endRow; row++) {
        const y = layout.cy + row * spacing;
        const r = minRadius * 0.8 * verticalFade(y);
        if (r <= 0.15) continue;
        for (let col = startCol; col <= endCol; col++) {
          const x = layout.cx + col * spacing;
          bgCtx.moveTo(x + r, y);
          bgCtx.arc(x, y, r, 0, Math.PI * 2);
        }
      }
      bgCtx.fill();
      bgCtx.globalAlpha = 1;
    };

    /** Precomputes geometry for every grid point inside the contour's reach. */
    const prepare = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      width = Math.max(1, Math.round(rect?.width ?? window.innerWidth));
      height = Math.max(1, Math.round(rect?.height ?? window.innerHeight));
      canvas.width = width;
      canvas.height = height;
      layout = contourLayout(width, height);
      spacing = Math.max(7, layout.scale / 30);
      minRadius = Math.max(0.6, spacing * 0.075);
      maxRadius = spacing * 0.64;

      const reach = Math.ceil((FIELD_RADIUS * layout.scale) / spacing);
      const capacity = (reach * 2 + 1) ** 2;
      px = new Float32Array(capacity);
      py = new Float32Array(capacity);
      fade = new Float32Array(capacity);
      radius = new Float32Array(capacity);
      indent = new Float32Array(capacity);
      cos2 = new Float32Array(capacity);
      sin2 = new Float32Array(capacity);
      cos3 = new Float32Array(capacity);
      sin3 = new Float32Array(capacity);
      count = 0;
      for (let row = -reach; row <= reach; row++) {
        const y = layout.cy + row * spacing;
        if (y < -spacing || y > height + spacing) continue;
        const f = verticalFade(y);
        if (f <= 0.01) continue;
        for (let col = -reach; col <= reach; col++) {
          const x = layout.cx + col * spacing;
          if (x < -spacing || x > width + spacing) continue;
          const rx = ((x - layout.cx) / layout.scale) * 1.04;
          const ry = ((y - layout.cy) / layout.scale) * 0.96;
          const r = Math.hypot(rx, ry);
          if (r > FIELD_RADIUS) continue;
          const theta = Math.atan2(ry, rx);
          px[count] = x;
          py[count] = y;
          fade[count] = f;
          radius[count] = r;
          indent[count] = valleyIndent(theta);
          cos2[count] = Math.cos(theta * 2);
          sin2[count] = Math.sin(theta * 2);
          cos3[count] = Math.cos(theta * 3);
          sin3[count] = Math.sin(theta * 3);
          count++;
        }
      }
      paintBackground();
    };

    const refreshColors = () => {
      colors.base = readColor('--g-base', colors.base);
      colors.fg = readColor('--g-fg', colors.fg);
      colors.faint = readColor('--g-faint', colors.faint);
    };

    const render = (t: number) => {
      ctx.drawImage(background, 0, 0);
      const b = boost.current;
      // Time-only terms, computed once per frame instead of once per dot.
      const lobeAngle = 0.55 + Math.sin(t * 0.8) * 0.12;
      const lobeCos = Math.cos(lobeAngle);
      const lobeSin = Math.sin(lobeAngle);
      const sideAngle = -0.4 - t * 0.6;
      const sideCos = Math.cos(sideAngle);
      const sideSin = Math.sin(sideAngle);
      const rippleAmp = 0.022 + b * 0.03;
      const waveAmp = 0.016 + b * 0.024;
      const hole = 0.255 + (0.012 + b * 0.016) * Math.sin(t * 2.8);
      const rings = RINGS.map((ring, index) => {
        const phase = Math.sin(t * 2.8 - index * 1.15);
        return {
          center: ring.center + waveAmp * phase,
          halfWidth: ring.halfWidth * (1 + 0.08 * phase),
          peak: ring.peak * (0.92 + 0.08 * phase),
        };
      });
      const influence = layout.scale * 0.72;
      const radiusRange = maxRadius - minRadius;

      ctx.fillStyle = colors.fg;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = px[i]!;
        const y = py[i]!;
        let r = radius[i]!;
        let ind = indent[i]!;
        let c2 = cos2[i]!;
        let s2 = sin2[i]!;
        let c3 = cos3[i]!;
        let s3 = sin3[i]!;
        let cursorOffset = 0;

        if (pointer.active) {
          const dx = x - pointer.sx;
          const dy = y - pointer.sy;
          if (Math.abs(dx) < influence && Math.abs(dy) < influence) {
            const distance = Math.hypot(dx, dy);
            if (distance < influence) {
              // Near the cursor the point is displaced, so redo its angle maths.
              const falloff = (1 - distance / influence) ** 2;
              cursorOffset = Math.sin(distance * 0.14 - t * 9.5) * falloff * 0.048;
              const push = falloff * (0.045 + 0.025 * Math.sin(distance * 0.1 - t * 8));
              const nx = (x - layout.cx) / layout.scale - (dx / (distance + 1)) * push;
              const ny = (y - layout.cy) / layout.scale - (dy / (distance + 1)) * push;
              const rx = nx * 1.04;
              const ry = ny * 0.96;
              r = Math.hypot(rx, ry);
              const theta = Math.atan2(ry, rx);
              ind = valleyIndent(theta);
              c2 = Math.cos(theta * 2);
              s2 = Math.sin(theta * 2);
              c3 = Math.cos(theta * 3);
              s3 = Math.sin(theta * 3);
            }
          }
        }

        const upperLobe = 0.045 * (c2 * lobeCos - s2 * lobeSin);
        const sideWave = 0.025 * (s3 * sideCos + c3 * sideSin);
        const outward = rippleAmp * Math.sin(r * 14 - t * 2.8) * Math.min(1, r * 2.5);
        const d = r + ind - upperLobe - sideWave - outward + cursorOffset;
        if (d < hole) continue;

        let value = 0;
        for (let k = 0; k < 4; k++) {
          const ring = rings[k]!;
          const gap = Math.abs(d - ring.center);
          if (gap < ring.halfWidth) {
            const profile = Math.pow(Math.cos((gap / ring.halfWidth) * Math.PI * 0.5), 1.35);
            const v = ring.peak * profile;
            if (v > value) value = v;
          }
        }
        if (d >= 0.88 && d < 1.24) {
          const outer = 0.5 + 0.5 * Math.sin(d * 18 - t * 2.8);
          const halo = (0.08 + 0.08 * outer) * Math.exp(-(((d - 0.88) / 0.16) ** 2));
          if (halo > value) value = halo;
        }
        if (value < 0.06) continue;

        const dot = (minRadius + Math.pow(value, 1.12) * radiusRange) * fade[i]!;
        if (dot > 0.15) {
          ctx.moveTo(x + dot, y);
          ctx.arc(x, y, dot, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      if (pointer.active) {
        const x = pointer.sx;
        const y = pointer.sy;
        ctx.strokeStyle = colors.faint;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.moveTo(x - 24, y);
        ctx.lineTo(x - 10, y);
        ctx.moveTo(x + 10, y);
        ctx.lineTo(x + 24, y);
        ctx.moveTo(x, y - 24);
        ctx.lineTo(x, y - 10);
        ctx.moveTo(x, y + 10);
        ctx.lineTo(x, y + 24);
        ctx.stroke();
      }
    };

    let time = 0;
    let last = 0;
    let lastDraw = 0;
    let frame = 0;

    refreshColors();
    prepare();
    render(0);

    // Theme switches repaint colours without polling styles every frame.
    const observer = new MutationObserver(() => {
      refreshColors();
      paintBackground();
      if (reduceMotion) render(time);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-gnomon-theme'],
    });
    const onResize = () => {
      prepare();
      render(time);
    };
    window.addEventListener('resize', onResize);

    if (reduceMotion) {
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', onResize);
      };
    }

    const onMove = (event: MouseEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!pointer.active) {
        pointer.sx = event.clientX;
        pointer.sy = event.clientY;
        pointer.active = true;
      }
    };
    const onLeave = () => void (pointer.active = false);
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);

    const animate = (timestamp: number) => {
      frame = requestAnimationFrame(animate);
      if (timestamp - lastDraw < FRAME_MS) return;
      const dt = last ? Math.min((timestamp - last) / 1000, 0.05) : 0;
      last = timestamp;
      lastDraw = timestamp;
      time += dt;
      boost.current = boost.current > 0.001 ? boost.current * Math.pow(0.25, dt) : 0;
      if (pointer.active) {
        pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 8);
        pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 8);
      }
      render(time);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}
