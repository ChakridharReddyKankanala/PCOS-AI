const base = {
  width: 32,
  height: 32,
  viewBox: '0 0 28 28',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const ArrowIcon = (props) => (
  <svg {...base} width={20} height={20} viewBox="0 0 20 20" strokeWidth={2} {...props}>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </svg>
)

export const CycleIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="4" y="6" width="20" height="18" rx="3" />
    <path d="M4 12h20M10 3v6M18 3v6" />
    <circle cx="14" cy="18" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)

export const HormoneIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M14 4c4 5.5 7 8.6 7 12.5a7 7 0 0 1-14 0C7 12.6 10 9.5 14 4z" />
    <path d="M10.5 17a3.5 3.5 0 0 0 3 3" />
  </svg>
)

export const ScanIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M14 4 3.5 22.5h21z" />
    <circle cx="14" cy="16.5" r="2.4" />
  </svg>
)
