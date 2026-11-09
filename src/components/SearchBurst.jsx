import { useEffect, useRef, useState } from 'react'

/**
 * The search flash.
 *
 * Two bright slashes cross the screen — one rising from the bottom left, one falling from
 * the top right. Where they meet they shatter into coloured shards, then the opposite
 * corners (top left and bottom right) sweep and break the same way.
 *
 * It is deliberately shorter than a second: it covers the navigation, not the waiting.
 * Triggered by `jimmy-state:search`, so any search box can fire it without prop drilling.
 */
const DURATION = 820

export default function SearchBurst() {
  const [run, setRun] = useState(0)
  const canvasRef = useRef(null)

  useEffect(() => {
    const fire = () => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      setRun((n) => n + 1)
    }
    window.addEventListener('jimmy-state:search', fire)
    return () => window.removeEventListener('jimmy-state:search', fire)
  }, [])

  useEffect(() => {
    if (!run) return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const start = performance.now()
    let shards = []
    let raf = 0

    const burst = (x, y, count, tint) => {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2
        const speed = 1.2 + Math.random() * 4.2
        shards.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 1.5 + Math.random() * 3.4,
          life: 0,
          span: 260 + Math.random() * 260,
          hue: tint + Math.random() * 70 - 35,
        })
      }
    }

    const beam = (fromX, fromY, toX, toY, progress, width) => {
      const x = fromX + (toX - fromX) * progress
      const y = fromY + (toY - fromY) * progress
      const grad = ctx.createLinearGradient(fromX, fromY, x, y)
      grad.addColorStop(0, 'rgba(120, 170, 255, 0)')
      grad.addColorStop(0.65, 'rgba(150, 200, 255, 0.55)')
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.95)')

      ctx.strokeStyle = grad
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(fromX, fromY)
      ctx.lineTo(x, y)
      ctx.stroke()

      // a wide soft halo around the core
      ctx.globalAlpha = 0.22
      ctx.lineWidth = width * 5
      ctx.strokeStyle = `rgba(90, 150, 255, ${0.5 * (1 - progress) + 0.15})`
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    const frame = (now) => {
      const t = now - start
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      const rise = Math.min(1, t / 240)
      const fall = Math.min(1, t / 240)

      if (t < 300) {
        beam(0, h, w * 0.52, h * 0.48, rise, 3)
        beam(w, 0, w * 0.48, h * 0.52, fall, 3)
      } else if (t < 360 && shards.length === 0) {
        burst(w * 0.5, h * 0.5, 46, 205)
      }

      if (t > 380 && t < 760) {
        const p = (t - 380) / 380
        beam(0, 0, w * 0.55, h * 0.55, p, 2.4)
        beam(w, h, w * 0.45, h * 0.45, p, 2.4)
        if (shards.length < 92 && t > 560) burst(w * 0.5, h * 0.5, 40, 275)
      }

      shards = shards.filter((s) => s.life < s.span)
      for (const s of shards) {
        s.life += 16
        s.x += s.vx
        s.y += s.vy
        s.vx *= 0.985
        s.vy *= 0.985
        const fade = 1 - s.life / s.span
        ctx.globalAlpha = Math.max(0, fade)
        ctx.fillStyle = `hsl(${s.hue}, 95%, ${60 + fade * 25}%)`
        ctx.beginPath()
        ctx.moveTo(s.x, s.y - s.size)
        ctx.lineTo(s.x + s.size, s.y)
        ctx.lineTo(s.x, s.y + s.size)
        ctx.lineTo(s.x - s.size, s.y)
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      if (t < DURATION) raf = window.requestAnimationFrame(frame)
    }

    raf = window.requestAnimationFrame(frame)
    return () => {
      window.cancelAnimationFrame(raf)
      shards = []
    }
  }, [run])

  if (!run) return null

  return <div key={run} className="search-burst" aria-hidden="true"><canvas ref={canvasRef} /></div>
}
