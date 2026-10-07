import { useEffect } from 'react'
import { Page } from './components/parts'
import { type RailData, useRailData } from './data'
import { AboutPage } from './pages/AboutPage'
import { HomePage } from './pages/HomePage'
import { LinePage } from './pages/LinePage'
import { LinesIndexPage } from './pages/LinesIndexPage'
import { NotFound } from './pages/NotFound'
import { PrefPage } from './pages/PrefPage'
import { PrefsPage } from './pages/PrefsPage'
import { RankingsPage } from './pages/RankingsPage'
import { SearchPage } from './pages/SearchPage'
import { StationPage } from './pages/StationPage'
import { type Route, useRoute } from './router'

export function App() {
  const route = useRoute()
  const state = useRailData()

  if (state.status === 'loading') {
    return <div className="loading">読み込み中…</div>
  }
  if (state.status === 'error') {
    return (
      <Page>
        <h1>データを読み込めませんでした</h1>
        <p className="muted">{state.error}</p>
      </Page>
    )
  }
  return <Routed route={route} data={state.data} />
}

function Routed({ route, data }: { route: Route; data: RailData }) {
  useEffect(() => {
    document.title = titleOf(route, data)
  }, [route, data])

  switch (route.page) {
    case 'home':
      return <HomePage data={data} />
    case 'line':
      return <LinePage key={route.id} data={data} id={route.id} />
    case 'station':
      return <StationPage key={route.id} data={data} id={route.id} />
    case 'lines':
      return <LinesIndexPage data={data} />
    case 'search':
      // 入力中は URL を書き換えるだけ（hashchange は起きない）。リンクで別の検索語に移ったときは作り直す
      return <SearchPage key={route.q} data={data} initial={route.q} />
    case 'prefs':
      return <PrefsPage data={data} />
    case 'pref':
      return <PrefPage key={route.name} data={data} name={route.name} />
    case 'rankings':
      return <RankingsPage data={data} />
    case 'about':
      return <AboutPage data={data} />
    default:
      return <NotFound />
  }
}

function titleOf(route: Route, data: RailData): string {
  const app = '日本鉄道ガイド'
  if (route.page === 'line') {
    const l = data.lines.get(route.id)
    if (l) return `${l.displayName}（${l.company}）| ${app}`
  }
  if (route.page === 'station') {
    const s = data.stations.get(route.id)
    if (s) return `${s.name}駅 | ${app}`
  }
  if (route.page === 'lines') return `路線一覧 | ${app}`
  if (route.page === 'search') return `検索 | ${app}`
  if (route.page === 'prefs') return `都道府県から探す | ${app}`
  if (route.page === 'pref') return `${route.name}の鉄道 | ${app}`
  if (route.page === 'rankings') return `ランキング・トリビア | ${app}`
  if (route.page === 'about') return `出典・説明 | ${app}`
  return app
}
