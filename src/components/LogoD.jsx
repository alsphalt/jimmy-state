import { useId } from 'react'

/**
 * The JIMMY STATE mark: a geometric capital D — squared stem, open bowl, and a
 * cyan signal node sitting in the gap at the lower right. Original artwork, drawn
 * from primitives so it stays crisp at every size.
 */
export default function LogoD({ size = 40, badge = false, glow = true, className = '', title = 'JIMMY STATE' }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const grad = `dg-${uid}`
  const mask = `dm-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
      style={glow ? { filter: 'drop-shadow(0 6px 18px rgba(59,109,255,.45))' } : undefined}
    >
      <defs>
        <linearGradient id={grad} x1="14" y1="12" x2="50" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4d7cff" />
          <stop offset="0.52" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <mask id={mask}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx="39.4" cy="45.4" r="6.1" fill="#000" />
        </mask>
      </defs>

      {badge && (
        <>
          <rect width="64" height="64" rx="15" fill="#080a12" />
          <rect x="0.6" y="0.6" width="62.8" height="62.8" rx="14.6" fill="none" stroke="rgba(255,255,255,.14)" />
        </>
      )}

      <g mask={`url(#${mask})`}>
        <path d="M17.4 14.6h7.8v34.8h-7.8z" fill={`url(#${grad})`} />
        <path
          d="M25.2 14.6h6.4a17.4 17.4 0 0 1 0 34.8h-6.4v-7.7h6.2a9.7 9.7 0 0 0 0-19.4h-6.2z"
          fill={`url(#${grad})`}
        />
      </g>
      <circle cx="39.4" cy="45.4" r="3.5" fill="#22d3ee" />
    </svg>
  )
}

export function Wordmark({ size = 15 }) {
  return (
    <span className="brand-name" style={{ fontSize: size }}>
      JIMMY <span>STATE</span>
    </span>
  )
}
