import { Page } from '../components/parts'
import type { RailData } from '../data'

export function AboutPage({ data }: { data: RailData }) {
  const { meta } = data
  return (
    <Page>
      <h1>出典・説明</h1>
      <p>
        日本鉄道ガイドは、全国の鉄道の路線・駅を眺めて楽しむためのアプリです。アカウント登録は不要で、データは公開オープンデータから自動で作成しています。
      </p>

      <h2>データの出典</h2>
      <ul className="sources">
        {meta.sources.map((s) => (
          <li key={s.id}>
            「{s.title}」（国土交通省）
            <a href={s.url} target="_blank" rel="noopener">
              {s.url}
            </a>
            （{s.retrievedAt}取得、{s.edition}、{s.license}）を加工して作成
          </li>
        ))}
        <li>
          背景地図:{' '}
          <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">
            地理院タイル（淡色地図）
          </a>
        </li>
      </ul>
      <p className="muted small">データ作成日時: {new Date(meta.generatedAt).toLocaleString('ja-JP')}</p>

      <h2>データについての注意</h2>
      <ul>
        <li>路線名は国土数値情報の表記です。法令上の線名（例:「東北線」）で入っているため、ふだんの呼び名と範囲が違う路線があります（例: 山手線は品川〜新宿〜田端の区間）。</li>
        <li>路線の「延長」は地図上の線形から計算した値で、営業キロではありません。</li>
        <li>線の色は、公式の路線カラーが登録されていない路線では種別ごとの既定色です。</li>
        <li>駅は、同じ名前で300m以内にある駅を1つにまとめています。</li>
        <li>
          乗降客数は{meta.passengerYear}年度の1日あたりの値です。一部の駅は非公開です。複数の事業者が乗り入れる駅は各事業者の値の合計で、事業者をまたぐ乗換客は重複して数えられます。
        </li>
        <li>駅の並び順は地図上の線形から自動で推定しています。</li>
      </ul>
    </Page>
  )
}
