/*
 * System page background — three effects, nothing else:
 *   1. floating particles
 *   2. moving neon lights (CSS)
 *   3. live neon pulse grid
 *
 * Injected by this file rather than the page markup so the tool's own document stays
 * untouched. Content is lifted above it (z-index 1) and the layer ignores pointers.
 *
 * One canvas and one requestAnimationFrame loop draw the particles and the grid together,
 * which keeps the cost flat on Android; the loop stops while the tab is hidden.
 */
(() => {
  if (document.getElementById('js-neon')) return

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  const style = document.createElement('style')
  style.textContent = `
    #js-neon{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;
      background:radial-gradient(120% 80% at 50% -10%,#0b1330 0%,#070b1a 45%,#04060e 100%)}
    #js-neon canvas{position:absolute;inset:0;display:block;width:100%;height:100%}
    #js-neon .js-glow{position:absolute;border-radius:50%;mix-blend-mode:screen;opacity:.7;will-change:transform,opacity}
    #js-neon .js-glow.a{width:86vmax;height:86vmax;left:-30vmax;top:-34vmax;
      background:radial-gradient(circle,rgba(47,107,255,.30) 0%,rgba(47,107,255,.11) 38%,transparent 66%);
      animation:js-neon-a 24s ease-in-out infinite alternate}
    #js-neon .js-glow.b{width:74vmax;height:74vmax;right:-26vmax;top:6vmax;
      background:radial-gradient(circle,rgba(139,92,246,.28) 0%,rgba(139,92,246,.10) 40%,transparent 68%);
      animation:js-neon-b 31s ease-in-out infinite alternate}
    #js-neon .js-glow.c{width:62vmax;height:62vmax;left:8vmax;bottom:-26vmax;
      background:radial-gradient(circle,rgba(34,211,238,.16) 0%,rgba(56,189,248,.07) 42%,transparent 70%);
      animation:js-neon-c 19s ease-in-out infinite alternate}
    @keyframes js-neon-a{0%{transform:translate3d(0,0,0) scale(1);opacity:.55}50%{opacity:.9}100%{transform:translate3d(14vw,10vh,0) scale(1.18);opacity:.7}}
    @keyframes js-neon-b{0%{transform:translate3d(0,0,0) scale(1.05);opacity:.8}100%{transform:translate3d(-16vw,14vh,0) scale(.92);opacity:.5}}
    @keyframes js-neon-c{0%{transform:translate3d(0,0,0) scale(.95);opacity:.5}100%{transform:translate3d(10vw,-12vh,0) scale(1.22);opacity:.85}}
    #js-neon.is-still .js-glow{animation:none}
    body > header, body > main, body > .cam-modal{position:relative;z-index:1}
    @media (prefers-reduced-motion: reduce){#js-neon .js-glow{animation:none}}
  `
  document.head.appendChild(style)

  const layer = document.createElement('div')
  layer.id = 'js-neon'
  layer.setAttribute('aria-hidden', 'true')
  layer.innerHTML = '<canvas></canvas><span class="js-glow a"></span><span class="js-glow b"></span><span class="js-glow c"></span>'
  if (reduce) layer.classList.add('is-still')
  document.body.insertBefore(layer, document.body.firstChild)

  const canvas = layer.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const BLUE = '96, 165, 250'
  const PURPLE = '167, 139, 250'
  const CYAN = '56, 189, 248'
  const TINTS = [BLUE, PURPLE, CYAN]

  const sprite = (tint) => {
    const size = 64
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, `rgba(${tint}, 1)`)
    grad.addColorStop(0.35, `rgba(${tint}, 0.5)`)
    grad.addColorStop(1, `rgba(${tint}, 0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    return c
  }
  const sprites = TINTS.map(sprite)

  let width = 0
  let height = 0
  let cell = 64
  let particles = []
  let pulses = []
  let raf = 0
  let last = 0
  let clock = 0

  const spawn = (fresh) => ({
    x: Math.random() * width,
    y: fresh ? Math.random() * height : Math.random() < 0.5 ? -10 : height + 10,
    vx: (Math.random() - 0.5) * 0.22,
    vy: (Math.random() - 0.5) * 0.22,
    size: 3.5 + Math.random() * 8,
    sprite: sprites[(Math.random() * sprites.length) | 0],
    phase: Math.random() * Math.PI * 2,
    pulse: 0.35 + Math.random() * 0.8,
    life: fresh ? Math.random() * 6 : 0,
    span: 9 + Math.random() * 9,
  })

  const spawnPulse = () => {
    const vertical = Math.random() < 0.5
    const lines = vertical ? Math.ceil(width / cell) : Math.ceil(height / cell)
    return {
      vertical,
      line: ((Math.random() * lines) | 0) * cell,
      pos: -Math.random() * 220,
      speed: 0.055 + Math.random() * 0.07,
      len: 90 + Math.random() * 130,
      tint: Math.random() < 0.5 ? BLUE : PURPLE,
      alpha: 0.5 + Math.random() * 0.4,
    }
  }

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    cell = width < 420 ? 58 : 70
    const count = Math.round(Math.min(56, Math.max(20, (width * height) / 16000)))
    particles = Array.from({ length: count }, () => spawn(true))
    pulses = Array.from({ length: 6 }, spawnPulse)
  }

  const drawGrid = () => {
    const driftX = Math.sin(clock * 0.00012) * 10
    const driftY = Math.cos(clock * 0.00015) * 8
    ctx.lineWidth = 1

    for (let x = -cell + driftX; x < width + cell; x += cell) {
      const wave = 0.5 + 0.5 * Math.sin(clock * 0.0007 + x * 0.012)
      ctx.strokeStyle = `rgba(${BLUE}, ${0.035 + wave * 0.075})`
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    for (let y = -cell + driftY; y < height + cell; y += cell) {
      const wave = 0.5 + 0.5 * Math.sin(clock * 0.0006 + y * 0.011)
      ctx.strokeStyle = `rgba(${PURPLE}, ${0.03 + wave * 0.07})`
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
  }

  const drawPulses = (dt) => {
    for (const p of pulses) {
      const span = p.vertical ? height : width
      p.pos += p.speed * dt
      if (p.pos - p.len > span) Object.assign(p, spawnPulse())

      const head = p.pos
      const tail = p.pos - p.len
      const grad = p.vertical
        ? ctx.createLinearGradient(0, tail, 0, head)
        : ctx.createLinearGradient(tail, 0, head, 0)
      grad.addColorStop(0, `rgba(${p.tint}, 0)`)
      grad.addColorStop(0.75, `rgba(${p.tint}, ${p.alpha * 0.55})`)
      grad.addColorStop(1, `rgba(${p.tint}, ${p.alpha})`)

      ctx.strokeStyle = grad
      ctx.lineWidth = 1.6
      ctx.beginPath()
      if (p.vertical) {
        ctx.moveTo(p.line, Math.max(0, tail))
        ctx.lineTo(p.line, Math.min(span, head))
      } else {
        ctx.moveTo(Math.max(0, tail), p.line)
        ctx.lineTo(Math.min(span, head), p.line)
      }
      ctx.stroke()
    }
  }

  const drawParticles = (dt) => {
    for (const p of particles) {
      p.life += dt / 1000
      p.x += p.vx * dt * 0.06
      p.y += p.vy * dt * 0.06
      const out = p.x < -40 || p.x > width + 40 || p.y < -40 || p.y > height + 40
      if (p.life > p.span || out) Object.assign(p, spawn(false))

      const fadeIn = Math.min(1, p.life / 1.6)
      const fadeOut = Math.min(1, Math.max(0, (p.span - p.life) / 2.2))
      const blink = 0.55 + 0.45 * Math.sin((clock / 1000) * p.pulse + p.phase)
      const alpha = Math.max(0, fadeIn * fadeOut * blink) * 0.72
      if (alpha <= 0.012) continue

      const size = p.size * (0.85 + 0.3 * blink)
      ctx.globalAlpha = alpha
      ctx.drawImage(p.sprite, p.x - size, p.y - size, size * 2, size * 2)
    }
    ctx.globalAlpha = 1
  }

  const render = (dt) => {
    ctx.clearRect(0, 0, width, height)
    drawGrid()
    ctx.globalCompositeOperation = 'lighter'
    drawPulses(dt)
    drawParticles(dt)
    ctx.globalCompositeOperation = 'source-over'
  }

  const loop = (now) => {
    if (!last) last = now
    const dt = Math.min(48, now - last)
    last = now
    clock += dt
    render(dt)
    raf = window.requestAnimationFrame(loop)
  }

  resize()
  if (reduce) {
    render(0)
  } else {
    raf = window.requestAnimationFrame(loop)
  }

  window.addEventListener('resize', () => {
    resize()
    if (reduce) render(0)
  })

  document.addEventListener('visibilitychange', () => {
    if (reduce) return
    if (document.hidden) {
      window.cancelAnimationFrame(raf)
      raf = 0
    } else if (!raf) {
      last = 0
      raf = window.requestAnimationFrame(loop)
    }
  })
})()
