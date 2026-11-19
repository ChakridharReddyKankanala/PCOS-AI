export default function Notice() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <p className="max-w-[72ch] text-ink-2">
          <span className="font-semibold text-ink">Research prototype.</span> The outputs are model estimates made for
          study and are not a diagnosis. A diagnosis needs a clinician to assess the person against established criteria
          such as the Rotterdam criteria.
        </p>
        <p className="mt-3 max-w-[72ch] text-sm text-ink-3">
          The photographs on this site are AI-generated illustrations. They do not show real patients or clinicians.
        </p>
      </div>
    </footer>
  )
}
