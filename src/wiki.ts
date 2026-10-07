import { useEffect, useState } from 'react'

// Wikipedia の要約と Wikimedia Commons の画像情報は、ページを開いたときに利用者のブラウザから取得する。
// どちらも CORS を許可している公開 API。取得できなかったときは何も表示しない。

export interface WikiSummary {
  title: string
  extract: string
  url: string
}

export interface CommonsImage {
  thumbUrl: string
  pageUrl: string
  artist: string
  license: string
  licenseUrl?: string
}

/** Wikipedia REST API の要約応答から必要な部分を取り出す。曖昧さ回避ページや本文の無いものは null */
export function parseSummary(json: unknown): WikiSummary | null {
  const j = json as {
    type?: string
    title?: string
    extract?: string
    content_urls?: { desktop?: { page?: string } }
  }
  if (!j || j.type === 'disambiguation' || !j.extract || !j.title) return null
  const url = j.content_urls?.desktop?.page ?? `https://ja.wikipedia.org/wiki/${encodeURIComponent(j.title)}`
  return { title: j.title, extract: j.extract, url }
}

/** HTML の作者表記を文字だけにする（Commons の Artist は HTML で返る） */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Commons API（prop=imageinfo, iiprop=url|extmetadata）の応答から、表示に必要な情報を取り出す。
 * ライセンスか作者が分からない画像は、表記義務を果たせないので null にする。
 */
export function parseCommons(json: unknown): CommonsImage | null {
  type Meta = Record<string, { value?: string } | undefined>
  const pages = (json as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Meta }[] }> } })
    ?.query?.pages
  const info = pages ? Object.values(pages)[0]?.imageinfo?.[0] : undefined
  const meta = info?.extmetadata ?? {}
  const license = meta.LicenseShortName?.value ?? ''
  const artist = stripHtml(meta.Artist?.value ?? '')
  if (!info?.thumburl || !info.descriptionurl || !license || !artist) return null
  return {
    thumbUrl: info.thumburl,
    pageUrl: info.descriptionurl,
    artist,
    license,
    ...(meta.LicenseUrl?.value ? { licenseUrl: meta.LicenseUrl.value } : {}),
  }
}

const cache = new Map<string, Promise<unknown>>()

function useRemote<T>(key: string | undefined, url: () => string, parse: (json: unknown) => T | null): T | null {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    setValue(null)
    if (!key) return
    let alive = true
    if (!cache.has(key)) {
      cache.set(
        key,
        fetch(url()).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      )
    }
    cache.get(key)!.then((json) => {
      if (alive) setValue(json ? parse(json) : null)
    })
    return () => {
      alive = false
    }
    // url と parse はキーで決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return value
}

export function useWikiSummary(title: string | undefined): WikiSummary | null {
  return useRemote(
    title && `wp:${title}`,
    () => `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title!.replace(/ /g, '_'))}`,
    parseSummary,
  )
}

export function useCommonsImage(file: string | undefined, width = 800): CommonsImage | null {
  return useRemote(
    file && `commons:${file}:${width}`,
    () =>
      'https://commons.wikimedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        titles: `File:${file}`,
        prop: 'imageinfo',
        iiprop: 'url|extmetadata',
        iiurlwidth: String(width),
        format: 'json',
        origin: '*',
      }),
    parseCommons,
  )
}
