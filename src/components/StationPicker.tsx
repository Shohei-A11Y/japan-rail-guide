import { useMemo, useState } from 'react'
import type { RailData } from '../data'
import { search } from '../search'
import type { Station } from '../types'
import { LineBadge } from './parts'

/** 駅名を入れて候補から1駅選ぶ入力欄（読み仮名・ローマ字でも探せる）。filter で選べる駅を絞れる */
export function StationPicker({
  data,
  label,
  station,
  onPick,
  filter,
}: {
  data: RailData
  label: string
  station?: Station
  onPick: (id: string) => void
  filter?: (s: Station) => boolean
}) {
  const [text, setText] = useState(station?.name ?? '')
  const [open, setOpen] = useState(false)
  const candidates = useMemo(
    () =>
      open && text.trim()
        ? search(data, text, 30)
            .stations.filter((s) => !filter || filter(s))
            .slice(0, 8)
        : [],
    [data, text, open, filter],
  )
  return (
    <div className="route-picker">
      <label>
        <span className="route-picker-label">{label}</span>
        <input
          type="search"
          value={text}
          placeholder="駅名（ひらがな・ローマ字も可）"
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && candidates[0]) onPick(candidates[0].id)
            if (e.key === 'Escape') setOpen(false)
          }}
          aria-autocomplete="list"
        />
      </label>
      {candidates.length > 0 && (
        <ul className="route-candidates" role="listbox">
          {candidates.map((s) => (
            <li key={s.id} role="option" aria-selected={false}>
              <button
                // 入力欄のフォーカスが外れる前に選べるよう mousedown で止める
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false)
                  onPick(s.id)
                }}
              >
                <span className="route-candidate-name">{s.name}</span>
                <span className="muted small">
                  {s.pref}
                  {s.city}
                </span>
                <span className="badge-row wrap">
                  {s.lines.slice(0, 3).map((id) => {
                    const l = data.lines.get(id)
                    return l ? <LineBadge key={id} line={l} small link={false} /> : null
                  })}
                  {s.lines.length > 3 && <span className="muted small">ほか{s.lines.length - 3}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
