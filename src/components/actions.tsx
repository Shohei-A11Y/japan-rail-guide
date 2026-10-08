import { type ReactNode, useState } from 'react'
import { type FavoriteKind, useFavorites } from '../favorites'

/** ページ上部のお気に入り・共有ボタン（children はその後ろに並べるボタン） */
export function PageActions({
  kind,
  id,
  title,
  children,
}: {
  kind: FavoriteKind
  id: string
  title: string
  children?: ReactNode
}) {
  const { has, toggle } = useFavorites()
  const [message, setMessage] = useState('')
  const saved = has(kind, id)

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setMessage('リンクをコピーしました')
    } catch (e) {
      // 共有シートを閉じただけのときは何もしない
      if (e instanceof DOMException && e.name === 'AbortError') return
      window.prompt('このページのURL', url)
      return
    }
    setTimeout(() => setMessage(''), 2000)
  }

  return (
    <div className="page-actions">
      <button className={`action${saved ? ' on' : ''}`} onClick={() => toggle(kind, id)} aria-pressed={saved}>
        <span aria-hidden="true">{saved ? '★' : '☆'}</span> {saved ? 'お気に入り済み' : 'お気に入り'}
      </button>
      <button className="action" onClick={share}>
        共有
      </button>
      {children}
      {message && (
        <span className="action-message" role="status">
          {message}
        </span>
      )}
    </div>
  )
}
