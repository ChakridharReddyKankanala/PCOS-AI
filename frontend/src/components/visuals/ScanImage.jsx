import { IMAGES } from '../../content/images'
import Sonogram from './Sonogram'

// Shows the image configured for a slot in src/content/images.js, or a generated
// synthetic ultrasound when no file has been set. Extra props go to the generated one.
export default function ScanImage({ slot, caption = true, className = '', ...sonogram }) {
  const entry = IMAGES[slot]
  return (
    <figure className={className}>
      {entry.src ? (
        <div className="aspect-[4/3] overflow-hidden rounded-xl bg-sono">
          <img src={entry.src} alt={entry.alt} className="h-full w-full object-contain" />
        </div>
      ) : (
        <Sonogram alt={entry.alt} {...sonogram} />
      )}
      {caption && (entry.src ? entry.credit : entry.generatedCaption) && (
        <figcaption className="mt-3 text-sm text-ink-3">{entry.src ? entry.credit : entry.generatedCaption}</figcaption>
      )}
    </figure>
  )
}
