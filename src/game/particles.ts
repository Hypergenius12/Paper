import { Particle, FloatingText } from './types';

export class ParticleSystem {
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];

  public spawnKillBurst(x: number, y: number, color: string, count: number = 36) {
    const palette = [color, '#ffffff', '#ffd100', '#ff0054'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 320;
      const chosenColor = palette[Math.floor(Math.random() * palette.length)];

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 8,
        color: chosenColor,
        alpha: 1,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.7,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 12,
        shape: Math.random() > 0.4 ? 'shard' : 'rect',
      });
    }
  }

  public spawnCaptureSparkles(points: { x: number; y: number }[], color: string, count: number = 18) {
    if (points.length === 0) return;
    for (let i = 0; i < count; i++) {
      const pt = points[Math.floor(Math.random() * points.length)];
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;

      this.particles.push({
        x: pt.x,
        y: pt.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color,
        alpha: 0.9,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 6,
        shape: 'circle',
      });
    }
  }

  public addFloatingText(text: string, x: number, y: number, color: string = '#ffd100', fontSize: number = 18) {
    this.floatingTexts.push({
      id: Math.random().toString(36).substring(2, 9),
      text,
      x,
      y,
      vy: -60,
      alpha: 1,
      color,
      fontSize,
      life: 0,
    });
  }

  public update(dt: number) {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      // Drag + gravity
      p.vx *= 0.95;
      p.vy = p.vy * 0.95 + 80 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vRot * dt;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      if (ft.life >= 1.2) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * dt;
      ft.alpha = Math.max(0, 1 - ft.life / 1.2);
    }
  }

  public draw(ctx: CanvasRenderingContext2D) {
    // Draw particles
    for (const p of this.particles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'shard') {
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.6, p.size * 0.5);
        ctx.lineTo(-p.size * 0.6, p.size * 0.5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }

    // Draw floating texts
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.font = `bold ${ft.fontSize}px 'Fredoka', 'Nunito', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);

      // Fill
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  public clear() {
    this.particles = [];
    this.floatingTexts = [];
  }
}
