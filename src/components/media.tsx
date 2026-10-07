import { useState } from 'react'
import { useCommonsImage, useWikiSummary } from '../wiki'

const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja'

/** Wikipedia の冒頭の要約。CC BY-SA 4.0 の表記（記事名・リンク・ライセンス）を必ず付ける */
export function WikiSummary({ title }: { title?: string }) {
  const summary = useWikiSummary(title)
  if (!summary) return null
  return (
    <section className="wiki">
      <h2>解説</h2>
      <p>{summary.extract}</p>
      <p className="credit">
        出典:{' '}
        <a href={summary.url} target="_blank" rel="noopener">
          Wikipedia「{summary.title}」
        </a>
        （
        <a href={CC_BY_SA} target="_blank" rel="noopener">
          CC BY-SA 4.0
        </a>
        ）
      </p>
    </section>
  )
}

/** Wikimedia Commons の写真。撮影者とライセンスが分かるものだけ表示する */
export function CommonsPhoto({ file, alt }: { file?: string; alt: string }) {
  const image = useCommonsImage(file)
  // 画像そのものが読めなかったとき（通信の制限など）は、撮影者表記だけが残らないよう写真ごと隠す
  const [failed, setFailed] = useState<string | null>(null)
  if (!image || failed === image.thumbUrl) return null
  return (
    <figure className="photo">
      <img src={image.thumbUrl} alt={alt} loading="lazy" onError={() => setFailed(image.thumbUrl)} />
      <figcaption>
        写真: {image.artist}（
        {image.licenseUrl ? (
          <a href={image.licenseUrl} target="_blank" rel="noopener">
            {image.license}
          </a>
        ) : (
          image.license
        )}
        ）／
        <a href={image.pageUrl} target="_blank" rel="noopener">
          Wikimedia Commons
        </a>
      </figcaption>
    </figure>
  )
}

/** データから自動で作った紹介文 */
export function Intro({ text }: { text: string }) {
  return <p className="intro">{text}</p>
}
