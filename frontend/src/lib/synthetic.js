// Draws synthetic, ultrasound-looking images (speckle, a fan-shaped field, one ovary with dark
// follicles). They are not real scans. They power the built-in examples, the illustrations
// and the hero banners.
//
// peripheral   many small follicles near the edge of the ovary and a brighter centre, which is
//              how polycystic ovarian morphology is usually drawn
// width/height drawing size before upscaling; the fan is sized from the height
// apexX        where the top of the fan sits across the width (0 to 1)
// transparent  leave everything outside the fan see-through, so it can sit on a white page
// tint         'gray' or 'teal'
// scale        upscaling factor for the returned canvas
// glow         soft pink and amber glow over some follicles (needs a see-through or opaque fan)

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const TINTS = { gray: [1, 1, 1], teal: [0.42, 0.86, 0.9] }

export function renderSonogram({
  follicles = 10,
  seed = 1,
  peripheral = false,
  width = 320,
  height = 240,
  apexX = 0.5,
  transparent = false,
  tint = 'gray',
  scale = 2,
  glow = false,
} = {}) {
  const W = width
  const H = height
  const s = H / 240
  const rnd = mulberry32(seed)
  const apex = { x: W * apexX, y: 6 * s }
  const R = 225 * s
  const half = 0.66
  const ov = { x: apex.x + 6 * s, y: 118 * s, rx: 82 * s, ry: 50 * s, rot: -0.12 }
  const stromaBoost = peripheral ? 38 : 26
  const [tr, tg, tb] = TINTS[tint] ?? TINTS.gray

  const fol = []
  let guard = 0
  while (fol.length < follicles && guard++ < 6000) {
    const a = rnd() * Math.PI * 2
    const d = peripheral ? 0.6 + rnd() * 0.28 : Math.sqrt(rnd())
    const lx = Math.cos(a) * d * ov.rx * (peripheral ? 0.9 : 0.86)
    const ly = Math.sin(a) * d * ov.ry * (peripheral ? 0.9 : 0.8)
    const x = ov.x + lx * Math.cos(ov.rot) - ly * Math.sin(ov.rot)
    const y = ov.y + lx * Math.sin(ov.rot) + ly * Math.cos(ov.rot)
    const r = (peripheral ? 3.2 + rnd() * 2.8 : 4 + rnd() * 4.5) * s
    const gap = (peripheral ? 1.2 : 2) * s
    if (fol.every((f) => Math.hypot(f.x - x, f.y - y) > f.r + r + gap)) fol.push({ x, y, r })
  }

  const small = document.createElement('canvas')
  small.width = W
  small.height = H
  const g = small.getContext('2d')
  const img = g.createImageData(W, H)
  const px = img.data

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const dx = x - apex.x
      const dy = y - apex.y
      const r = Math.hypot(dx, dy)
      const th = Math.atan2(dx, dy)
      let v = 0
      let a = transparent ? 0 : 255
      if (dy > 0 && Math.abs(th) < half && r < R) {
        const edge = smooth(0, 6 * s, (half - Math.abs(th)) * r) * smooth(0, 6 * s, R - r)
        const speckle = (rnd() + rnd() + rnd()) / 3
        let base = 58 + speckle * 70 - (r * 0.12) / s
        const ex = x - ov.x
        const ey = y - ov.y
        const lx = ex * Math.cos(-ov.rot) - ey * Math.sin(-ov.rot)
        const ly = ex * Math.sin(-ov.rot) + ey * Math.cos(-ov.rot)
        const q = Math.hypot(lx / ov.rx, ly / ov.ry)
        base += (1 - smooth(0.85, 1.0, q)) * stromaBoost
        base += smooth(0.9, 1.0, q) * (1 - smooth(1.0, 1.1, q)) * 40
        for (const f of fol) {
          const dist = Math.hypot(x - f.x, y - f.y)
          base *= 1 - 0.92 * (1 - smooth(f.r * 0.8, f.r * 1.1, dist))
        }
        base = Math.max(0, Math.min(255, base))
        if (transparent) {
          v = base
          a = Math.round(edge * 255)
        } else {
          v = base * edge
        }
      }
      px[i] = v * tr
      px[i + 1] = v * tg
      px[i + 2] = v * tb
      px[i + 3] = a
    }
  }
  g.putImageData(img, 0, 0)

  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = H * scale
  const og = canvas.getContext('2d')
  og.imageSmoothingEnabled = true
  og.imageSmoothingQuality = 'high'
  og.drawImage(small, 0, 0, canvas.width, canvas.height)

  // Attention blobs in 0..1 image coordinates, one per follicle.
  const regions = fol.map((f) => ({ x: f.x / W, y: f.y / H, r: (f.r * 2.2) / W, w: 0.9 }))

  if (glow) {
    og.globalCompositeOperation = 'source-atop'
    for (const f of fol.slice(0, 7)) {
      const cx = f.x * scale
      const cy = f.y * scale
      const rad = f.r * 2.4 * scale
      const grad = og.createRadialGradient(cx, cy, 0, cx, cy, rad)
      grad.addColorStop(0, 'rgba(255,96,140,0.75)')
      grad.addColorStop(0.5, 'rgba(255,176,96,0.3)')
      grad.addColorStop(1, 'rgba(255,176,96,0)')
      og.fillStyle = grad
      og.fillRect(cx - rad, cy - rad, rad * 2, rad * 2)
    }
    og.globalCompositeOperation = 'source-over'
  }

  return { canvas, regions }
}
