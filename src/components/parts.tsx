import type { ReactNode } from 'react'
import { textOn } from '../format'
import { href } from '../router'
import type { Line } from '../types'

/** 路線名を路線カラーの札で表示する */
export function LineBadge({ line, small, link = true }: { line: Line; small?: boolean; link?: boolean }) {
  const style = { background: line.color, color: textOn(line.color) }
  const cls = `line-badge${small ? ' small' : ''}`
  const body = (
    <>
      {line.shinkansen && <span className="line-badge-mark" aria-hidden="true">新</span>}
      {line.displayName}
    </>
  )
  return link ? (
    <a className={cls} style={style} href={href.line(line.id)} title={`${line.displayName}（${line.company}）`}>
      {body}
    </a>
  ) : (
    <span className={cls} style={style}>
      {body}
    </span>
  )
}

export function Header() {
  return (
    <header className="app-header">
      <a className="brand" href={href.home()}>
        <span className="brand-mark" aria-hidden="true" />
        日本鉄道ガイド
      </a>
      <nav>
        <a href={href.lines()}>路線一覧</a>
        <a href={href.about()}>出典・説明</a>
      </nav>
    </header>
  )
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="page">{children}</main>
    </>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="notice">{children}</p>
}
