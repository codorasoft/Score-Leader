import { formationSpots } from '../utils/formation'

// A small pitch seen from above with a dot for every spot of a formation, the keeper at the
// bottom. Decoration only: the formation's name is always written beside it.
export function FormationDiagram({ lines, className = '' }: { lines: number[]; className?: string }) {
  return (
    <svg viewBox="0 0 100 150" className={`rounded-md ${className}`} aria-hidden="true">
      <rect width="100" height="150" fill="#15803d" />
      <g fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5">
        <rect x="3" y="3" width="94" height="144" />
        <line x1="3" y1="75" x2="97" y2="75" />
        <rect x="28" y="127" width="44" height="20" />
      </g>
      {formationSpots(lines).map((spot, i) => (
        <circle key={i} data-spot cx={spot.x * 100} cy={spot.y * 150} r="6" fill={spot.role === 'GK' ? '#facc15' : '#ffffff'} />
      ))}
    </svg>
  )
}
