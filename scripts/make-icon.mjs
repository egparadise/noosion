// Generates the Noosion app icon (original design) as a PNG without dependencies.
// Usage: node scripts/make-icon.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const S = 512

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// Signed distance helpers (antialiased coverage from distance)
const cov = (d) => Math.max(0, Math.min(1, 0.5 - d))
function roundedRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r
  const qy = Math.abs(y - cy) - hh + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
function segment(x, y, ax, ay, bx, by, w) {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay
  const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - dx * h, py - dy * h) - w
}

const px = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  px[y * (S * 4 + 1)] = 0
  for (let x = 0; x < S; x++) {
    const fx = x + 0.5, fy = y + 0.5
    // Background tile: deep indigo gradient
    const bg = cov(roundedRect(fx, fy, 256, 256, 232, 232, 96))
    const t = (fx + fy) / (2 * S)
    let r = 38 + 40 * t, g = 40 + 22 * t, b = 92 + 70 * t
    // Glyph: stylised lowercase "n" made of two strokes + an orbit dot
    const stroke = 34
    const d = Math.min(
      segment(fx, fy, 170, 170, 170, 360, stroke),
      segment(fx, fy, 170, 210, 300, 170, stroke) ,
      segment(fx, fy, 300, 170, 342, 220, stroke),
      segment(fx, fy, 342, 220, 342, 360, stroke)
    )
    const dot = Math.hypot(fx - 376, fy - 128) - 26
    const fg = Math.max(cov(d), cov(dot))
    r = r * (1 - fg) + 250 * fg
    g = g * (1 - fg) + 248 * fg
    b = b * (1 - fg) + 255 * fg
    const o = y * (S * 4 + 1) + 1 + x * 4
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(255 * bg)
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(px, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
for (const out of ['resources/icon.png', 'build/icon.png']) {
  const p = resolve(root, out)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, png)
  console.log('wrote', out, png.length, 'bytes')
}
