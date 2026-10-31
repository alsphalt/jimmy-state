/**
 * Generates the JIMMY STATE icon set with zero dependencies.
 *
 * The mark is an original geometric "D": a squared stem plus an open bowl, with a
 * cyan signal node sitting in a deliberate gap at the lower right. Rendered with
 * signed-distance shapes at 4x supersampling and written as real PNGs (zlib +
 * CRC32, no native image library needed).
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'icons')
mkdirSync(OUT, { recursive: true })

/* ------------------------------------------------------------------ PNG writer */
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------------- geometry */
// Signal node: 42 degrees below horizontal, on the bowl stroke midline.
const NODE = {
  x: 0.392 + 0.177 * Math.cos((42 * Math.PI) / 180),
  y: 0.5 + 0.177 * Math.sin((42 * Math.PI) / 180),
  gap: 0.068,
  r: 0.040,
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a + (b - a) * t

function roundedRectAlpha(x, y, radius) {
  // signed distance to a rounded square filling 0..1 with the given corner radius
  const px = Math.abs(x - 0.5) - (0.5 - radius)
  const py = Math.abs(y - 0.5) - (0.5 - radius)
  const dx = Math.max(px, 0)
  const dy = Math.max(py, 0)
  const d = Math.hypot(dx, dy) + Math.min(Math.max(px, py), 0) - radius
  return 1 - clamp01(d * 512) // soft edge in normalised units
}

function halfDiscDist(x, y, cx, cy, r) {
  // distance to a right-facing half disc (x >= cx)
  const dx = x - cx
  const dy = y - cy
  const dCircle = Math.hypot(dx, dy) - r
  const dEdge = -dx // negative inside when x > cx
  return Math.max(dCircle, dEdge)
}

function glyphAlpha(x, y, scale = 1) {
  // centre the mark and scale it around (0.5, 0.5)
  const gx = 0.5 + (x - 0.5) / scale
  const gy = 0.5 + (y - 0.5) / scale

  const stemX0 = 0.283
  const stemX1 = 0.398
  const stemY0 = 0.262
  const stemY1 = 0.738
  const stem = Math.min(gx - stemX0, stemX1 - gx, gy - stemY0, stemY1 - gy)

  const bowlOuter = -halfDiscDist(gx, gy, 0.392, 0.5, 0.238)
  const bowlInner = halfDiscDist(gx, gy, 0.392, 0.5, 0.116)
  let bowl = Math.min(bowlOuter, bowlInner)

  // Gap for the signal node, sitting in the lower-right of the bowl stroke.
  const gap = Math.hypot(gx - NODE.x, gy - NODE.y) - NODE.gap
  bowl = Math.min(bowl, gap)

  // Smooth union removes the hairline seam where the stem meets the bowl.
  const smin = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k
    return Math.min(a, b) - h * h * k * 0.25
  }
  const smax = (a, b, k) => -smin(-a, -b, k)
  const body = smax(stem, bowl, 0.02)
  return clamp01((body / 0.006 + 1) / 2) // ~1px-ish antialias at icon scale
}

function nodeAlpha(x, y, scale = 1) {
  const gx = 0.5 + (x - 0.5) / scale
  const gy = 0.5 + (y - 0.5) / scale
  const d = Math.hypot(gx - NODE.x, gy - NODE.y) - NODE.r
  return 1 - clamp01((d / 0.006 + 1) / 2)
}

function render(size, { maskable = false } = {}) {
  const SS = 4
  const W = size
  const rgba = Buffer.alloc(W * W * 4)
  const radius = maskable ? 0 : 0.235
  const scale = maskable ? 0.74 : 0.94

  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / W
          const y = (py + (sy + 0.5) / SS) / W

          // background: near-black with a blue/purple bloom
          const bgMask = maskable ? 1 : roundedRectAlpha(x, y, radius)
          const glow = Math.max(
            0,
            1 - Math.hypot(x - 0.16, y - 0.06) * 1.75,
          )
          const glow2 = Math.max(0, 1 - Math.hypot(x - 0.92, y - 0.98) * 1.9)
          let br = mix(6, 26, glow) + glow2 * 10
          let bg = mix(7, 34, glow) + glow2 * 6
          let bb = mix(12, 82, glow) + glow2 * 34

          // mark fill gradient (top-left blue -> purple -> cyan)
          const t = clamp01(x * 0.45 + y * 0.55)
          let mr = t < 0.5 ? mix(56, 139, t / 0.5) : mix(139, 34, (t - 0.5) / 0.5)
          let mg = t < 0.5 ? mix(120, 92, t / 0.5) : mix(92, 211, (t - 0.5) / 0.5)
          let mb = t < 0.5 ? mix(255, 246, t / 0.5) : mix(246, 238, (t - 0.5) / 0.5)

          const gA = glyphAlpha(x, y, scale)
          const nA = nodeAlpha(x, y, scale)
          // soft outer glow behind the glyph
          const halo = Math.max(0, 0.22 * (1 - Math.abs(gA - 0.5) * 2) * 0)

          let cr = br
          let cg = bg
          let cb = bb
          if (gA > 0) {
            cr = mix(cr, mr, gA)
            cg = mix(cg, mg, gA)
            cb = mix(cb, mb, gA)
          }
          if (nA > 0) {
            cr = mix(cr, 34, nA)
            cg = mix(cg, 211, nA)
            cb = mix(cb, 238, nA)
          }
          cr += halo
          r += cr
          g += cg
          b += cb
          a += bgMask
        }
      }
      const n = SS * SS
      const idx = (py * W + px) * 4
      const alpha = (a / n) * 255
      rgba[idx] = Math.round(clamp01(r / n / 255) * 255)
      rgba[idx + 1] = Math.round(clamp01(g / n / 255) * 255)
      rgba[idx + 2] = Math.round(clamp01(b / n / 255) * 255)
      rgba[idx + 3] = Math.round(alpha)
    }
  }
  return encodePng(W, W, rgba)
}

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
  ['icon-96.png', 96, {}],
]

for (const [name, size, opts] of jobs) {
  const png = render(size, opts)
  writeFileSync(path.join(OUT, name), png)
  console.log(`wrote icons/${name} (${size}px, ${(png.length / 1024).toFixed(1)} kB)`)
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4882ff"/>
      <stop offset="0.55" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="15" fill="#07090f"/>
  <path d="M18 16h6v32h-6z" fill="url(#g)"/>
  <path d="M24 16h7a16 16 0 0 1 0 32h-7v-7h7a9 9 0 0 0 0-18h-7z" fill="url(#g)"/>
  <circle cx="39.5" cy="45.6" r="3.2" fill="#22d3ee"/>
</svg>
`
writeFileSync(path.join(OUT, 'favicon.svg'), favicon)
console.log('wrote icons/favicon.svg')
