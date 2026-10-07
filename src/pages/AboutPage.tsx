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
            {s.credit}（{s.edition}、{s.license}）{' '}
            <a href={s.url} target="_blank" rel="noopener">
              {s.url}
            </a>
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
        <li>路線の範囲は国土数値情報の区分（法令上の線名ごと）です。表示名が通称でも、ふだんの呼び名と範囲が違う路線があります（例: 山手線は品川〜新宿〜田端の区間）。</li>
        <li>路線の「延長」は地図上の線形から計算した値で、営業キロではありません。</li>
        <li>
          路線の表示名と線の色は、Wikidataに登録された名前・路線色を使っています。Wikidataの路線色は、事業者の色指定と細部が異なる場合があります。Wikidataに色が無い路線は種別ごとの既定色です。
        </li>
        <li>山形新幹線・秋田新幹線は、在来線（奥羽本線・田沢湖線）の区間を新幹線として表示しています。</li>
        <li>駅は、同じ名前で300m以内にある駅を1つにまとめています。</li>
        <li>
          乗降客数は{meta.passengerYear}年度の1日あたりの値です。一部の駅は非公開です。複数の事業者が乗り入れる駅は各事業者の値の合計で、事業者をまたぐ乗換客は重複して数えられます。
        </li>
        <li>駅の並び順は地図上の線形から自動で推定しています。</li>
        <li>車両図鑑は、Wikidataに登録された日本の旅客車両の形式のうち、3言語以上のWikipediaに記事がある形式と新幹線の全形式を載せています。</li>
        <li>各ページの冒頭の紹介文は、このアプリのデータから自動で作った文章です。</li>
      </ul>

      <h2>写真と解説文</h2>
      <p>
        写真はWikimedia Commons、解説文はWikipedia（日本語版）の記事の冒頭部分を、ページを開いたときにお使いのブラウザから直接読み込んで表示しています。写真ごとに撮影者とライセンスを、解説文ごとに記事名とライセンス（CC
        BY-SA 4.0）を表示しています。
      </p>
      <p className="muted small">
        そのため、写真・解説文のあるページを開くと、お使いのブラウザからWikimedia財団のサーバー（wikipedia.org・wikimedia.org）に接続します。このアプリ自体は利用者の情報を集めていません。
      </p>
    </Page>
  )
}
