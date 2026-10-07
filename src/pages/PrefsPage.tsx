import { useMemo } from 'react'
import { Page } from '../components/parts'
import { REGIONS } from '../codes'
import type { RailData } from '../data'
import { href } from '../router'

export function PrefsPage({ data }: { data: RailData }) {
  const counts = useMemo(() => {
    const m = new Map<string, { stations: number; lines: number }>()
    for (const s of data.stations.values()) {
      if (!s.pref) continue
      const c = m.get(s.pref) ?? { stations: 0, lines: 0 }
      c.stations++
      m.set(s.pref, c)
    }
    for (const l of data.lines.values()) {
      for (const p of l.prefs) {
        const c = m.get(p)
        if (c) c.lines++
      }
    }
    return m
  }, [data])

  return (
    <Page>
      <h1>都道府県から探す</h1>
      {REGIONS.map((r) => (
        <section key={r.name}>
          <h2>{r.name}</h2>
          <div className="pref-grid">
            {r.prefs.map((p) => (
              <a key={p} className="pref-card" href={href.pref(p)}>
                <span className="pref-name">{p}</span>
                <span className="muted small">
                  {counts.get(p)?.lines ?? 0}路線・{counts.get(p)?.stations ?? 0}駅
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </Page>
  )
}
