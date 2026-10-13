import { useTranslation } from 'react-i18next'

// Someone on a coach board as the bench shows them: a player, or a guest (a typed name)
export interface BenchPerson { id: string; name: string; photo_url: string | null; guest?: boolean }

// The round photo or initial of the pitch's tokens, smaller; a guest keeps the dashed grey ring
export function BenchDot({ person, className = 'w-9 h-9 text-sm' }: { person: BenchPerson; className?: string }) {
  return (
    <span aria-hidden="true" className={`${className} shrink-0 rounded-full border-2 overflow-hidden flex items-center justify-center font-bold text-white ${person.guest ? 'border-dashed border-gray-300 bg-gray-600' : 'border-white bg-gray-800'}`}>
      {person.photo_url
        ? <img src={person.photo_url} alt="" draggable={false} className="w-full h-full object-cover" />
        : person.name.charAt(0).toUpperCase()}
    </span>
  )
}

// The substitutes beside the pitch, in their order. A tap on one asks the page what to do with
// them. The column is as tall as the pitch it stands next to and no taller: its list is laid
// over it and scrolls, so a long bench never stretches the row.
export function BenchColumn({ substitutes, onPick }: { substitutes: BenchPerson[]; onPick: (id: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="w-14 shrink-0 flex flex-col rounded-xl bg-gray-800">
      <p className="py-1 text-center text-[11px] font-bold uppercase text-gray-300">{t('bench.title')}</p>
      <div className="relative flex-1 min-h-0">
        <ul aria-label={t('bench.label')} className="absolute inset-0 overflow-y-auto flex flex-col items-center gap-1 px-0.5 pb-1">
          {substitutes.map((person) => (
            <li key={person.id} className="w-full">
              <button type="button" onClick={() => onPick(person.id)} aria-label={t('bench.player', { name: person.name })}
                className="w-full min-h-11 flex flex-col items-center rounded-lg py-1 hover:bg-gray-700">
                <BenchDot person={person} />
                <span dir="auto" title={person.name} className="mt-0.5 w-full truncate text-center text-[10px] font-semibold leading-tight">{person.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
