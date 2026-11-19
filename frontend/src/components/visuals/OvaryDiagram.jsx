// A schematic cross-section of an ovary, drawn from scratch. Two variants:
// 'typical'  a few follicles of different sizes, one larger
// 'pcos'     many small follicles around the edge and denser tissue in the centre

const CX = 180
const CY = 118
const RX = 134
const RY = 80

function prng(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function ringFollicles() {
  const rnd = prng(7)
  const n = 16
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.18
    const k = 0.74 + (rnd() - 0.5) * 0.08
    return { x: CX + Math.cos(a) * RX * k, y: CY + Math.sin(a) * RY * k, r: 6.5 + rnd() * 2.5 }
  })
}

const TYPICAL = [
  { x: 122, y: 112, r: 9 },
  { x: 168, y: 150, r: 7 },
  { x: 230, y: 98, r: 8 },
  { x: 246, y: 140, r: 6 },
  { x: 200, y: 124, r: 19 },
  { x: 150, y: 86, r: 5.5 },
]

export default function OvaryDiagram({ variant = 'typical', className = '' }) {
  const pcos = variant === 'pcos'
  const follicles = pcos ? ringFollicles() : TYPICAL
  const pointer = follicles.reduce((best, f) => (f.x + f.y < best.x + best.y ? f : best), follicles[0])
  const label = pcos
    ? 'Diagram of an ovary with many small follicles around its edge and dense tissue in the centre'
    : 'Diagram of an ovary with a few follicles, one of them larger'

  return (
    <svg viewBox="0 0 360 240" role="img" aria-label={label} className={`w-full ${className}`}>
      <ellipse
        cx={CX}
        cy={CY}
        rx={RX}
        ry={RY}
        fill={pcos ? '#bfdde0' : 'var(--color-teal-tint)'}
        stroke="var(--color-teal-deep)"
        strokeWidth="3"
      />
      {pcos && <ellipse cx={CX} cy={CY} rx={RX * 0.5} ry={RY * 0.46} fill="var(--color-teal-mid)" opacity="0.7" />}
      {follicles.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.y} r={f.r} fill="var(--color-paper)" stroke="var(--color-teal-deep)" strokeWidth="1.5" />
      ))}

      <g stroke="var(--color-ink-3)" strokeWidth="1" fill="none">
        <path d={`M62 24 H${pointer.x - 18} L${pointer.x - pointer.r * 0.6} ${pointer.y - pointer.r * 0.6}`} />
        <path d={`M300 215 L${CX + 34} ${CY + 14}`} />
      </g>
      <g fill="var(--color-ink-2)" fontSize="14" fontWeight="600">
        <text x="20" y="29">
          Follicle
        </text>
        <text x="340" y="232" textAnchor="end">
          {pcos ? 'Dense central tissue' : 'Ovarian tissue'}
        </text>
      </g>
    </svg>
  )
}
