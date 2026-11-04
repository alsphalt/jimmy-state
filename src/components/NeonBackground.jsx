import { useEffect, useRef, useState } from 'react'

/**
 * Dark neon background: floating particles (canvas) and three drifting neon lights (CSS).
 *
 * Only those two effects — no waves, stars or shapes.
 *
 * Mounted once in App, outside <Routes>, so navigation never restarts it. Painted behind
 * everything (z-index 0 with .app raised above it) and ignores pointer events.
 *
 * Battery: the canvas stops when the tab is hidden and restarts with a fresh frame on
 * return, rather than advancing through timers while the app is in the background.
 * Reduced motion: particles are drawn once and the CSS lights are frozen.
 */

const TINTS = ['96, 165, 250', '167, 139, 250', '56, 189, 248']

const makeSprite = (tint) => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, `rgba(${tint}, 1)`)
  g.addColorStop(0.35, `rgba(${tint}, 0.55)`)
  g.addColorStop(1, `rgba(${tint}, 0)`)
  c.fillStyle = g
  c.fillRect(0, 0, size, size)
  return canvas
}

export default function NeonBackground({ intro = false }) {
  const canvasRef = useRef(null)
  const [still, setStill] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduce) setStill(true)

    const sprites = TINTS.map(makeSprite)
    let width = 0
    let height = 0
    let particles = []
    let raf = 0
    let last = 0
    let clock = 0

    const spawn = (fresh) => {
      const tint = (Math.random() * TINTS.length) | 0
      return {
        x: Math.random() * width,
        y: fresh ? Math.random() * height : Math.random() < 0.5 ? -10 : height + 10,
        vx: (Math.random() - 0.5) * 0.24,
        vy: (Math.random() - 0.5) * 0.24,
        size: 3.5 + Math.random() * 9,
        sprite: sprites[tint],
        phase: Math.random() * Math.PI * 2,
        pulse: 0.35 + Math.random() * 0.8,
        life: fresh ? Math.random() * 6 : 0,
        span: 9 + Math.random() * 9,
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth || window.innerWidth
      height = canvas.clientHeight || window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const area = (width * height) / (390 * 800)
      const count = Math.round((intro ? 54 : 42) * Math.min(1.7, Math.max(0.55, area)))
      particles = Array.from({ length: count }, () => spawn(true))
      if (reduce) draw(0)
    }

    const draw = (dt) => {
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'
      for (const p of particles) {
        p.life += dt / 1000
        p.x += p.vx * dt * 0.06
        p.y += p.vy * dt * 0.06
        const out = p.x < -40 || p.x > width + 40 || p.y < -40 || p.y > height + 40
        if (p.life > p.span || out) Object.assign(p, spawn(false))

        const fadeIn = Math.min(1, p.life / 1.6)
        const fadeOut = Math.min(1, Math.max(0, (p.span - p.life) / 2.2))
        const pulse = 0.55 + 0.45 * Math.sin((clock / 1000) * p.pulse + p.phase)
        const alpha = Math.max(0, fadeIn * fadeOut * pulse) * (intro ? 0.9 : 0.72)
        if (alpha <= 0.012) continue

        const size = p.size * (0.85 + 0.3 * pulse)
        ctx.globalAlpha = alpha
        ctx.drawImage(p.sprite, p.x - size, p.y - size, size * 2, size * 2)
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    const frame = (now) => {
      if (!last) last = now
      const dt = Math.min(48, now - last)
      last = now
      clock += dt
      draw(dt)
      raf = window.requestAnimationFrame(frame)
    }

    resize()

    if (reduce) {
      draw(0)
    } else {
      raf = window.requestAnimationFrame(frame)
    }

    const onResize = () => {
      resize()
      if (reduce) draw(0)
    }

    const onVisibility = () => {
      if (reduce) return
      if (document.hidden) {
        window.cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf) {
        last = 0
        raf = window.requestAnimationFrame(frame)
      }
    }

    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intro])

  return (
    <div className={`neon-bg${intro ? ' is-intro' : ''}${still ? ' is-still' : ''}`} aria-hidden="true">
      <canvas ref={canvasRef} className="neon-particles" />
      <span className="neon-glow g1" />
      <span className="neon-glow g2" />
      <span className="neon-glow g3" />
    </div>
  )
}
