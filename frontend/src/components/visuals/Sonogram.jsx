import { useEffect, useState } from 'react'
import { renderSonogram } from '../../lib/synthetic'

// A synthetic ultrasound drawn in the browser. Pass the same options as renderSonogram:
// follicles, seed, peripheral.
export default function Sonogram({ alt, className = '', follicles, seed, peripheral }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    const { canvas } = renderSonogram({ follicles, seed, peripheral })
    setSrc(canvas.toDataURL('image/jpeg', 0.88))
  }, [follicles, seed, peripheral])

  return (
    <div className={`relative aspect-[4/3] overflow-hidden rounded-xl bg-sono ${className}`}>
      {src && <img src={src} alt={alt} className="h-full w-full object-fill" draggable={false} />}
    </div>
  )
}
