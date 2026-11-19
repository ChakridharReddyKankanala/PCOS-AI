import { HERO } from '../content/images'
import Container from './Container'

// A full-width banner: a photo behind a tag, a large headline, a short intro and actions.
// The photo is sharp on the right and fades into white toward the text on the left. `page` picks
// the photo and crop (see HERO in src/content/images.js).
const WASH =
  'linear-gradient(90deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.9) 36%, rgba(255,255,255,0.52) 57%, rgba(255,255,255,0) 78%)'

const SIZES = {
  tall: 'min-h-[34rem] lg:min-h-[43rem]',
  medium: 'min-h-[30rem] lg:min-h-[32.5rem]',
  short: 'min-h-[24rem] lg:min-h-[26rem]',
}

export default function PageHero({ page = 'home', size = 'medium', tag, title, children, actions }) {
  const c = HERO[page]
  const style = {
    backgroundImage: `url(${c.src})`,
    '--ph-h': `${c.h * 100}%`,
    '--ph-top': `${-(c.h - 1) * c.top * 100}%`,
    '--ph-ratio': c.ratio,
    '--ph-shift': `${(c.shift ?? 0) * 100}%`,
  }
  return (
    <section className={`relative isolate flex items-center overflow-hidden border-b border-line bg-white ${SIZES[size]}`}>
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <div className="hero-photo hero-soft" style={style} />
        <div className="hero-photo hero-sharp" style={style} />
        <div className="absolute inset-0" style={{ background: WASH }} />
        <div className="absolute inset-0 bg-white/45 sm:hidden" />
      </div>

      <Container className="w-full py-14 sm:py-20">
        <div className="max-w-3xl">
          {tag && (
            <span className="inline-block rounded-full bg-teal-tint/85 px-4 py-1.5 text-sm font-medium text-ink-2">{tag}</span>
          )}
          <h1 className="mt-6 text-balance text-[clamp(2.25rem,4.6vw,3.75rem)] font-semibold leading-[1.08] tracking-tight text-teal">
            {title}
          </h1>
          <p className="mt-6 max-w-[54ch] text-lg text-ink-2">{children}</p>
          {actions && <div className="mt-9 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      </Container>
    </section>
  )
}
