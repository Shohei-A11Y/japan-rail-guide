import { useEffect, useState } from 'react'

/**
 * Service Worker を登録し、新しい版が有効になったら知らせる。
 * 開発中（npm run dev）は登録しない。
 */
export function useServiceWorkerUpdate(): boolean {
  const [updated, setUpdated] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    // 最初の訪問で有効になったときは「更新」ではないので知らせない
    const hadController = !!navigator.serviceWorker.controller
    const onChange = () => {
      if (hadController) setUpdated(true)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // 登録できなくても（プライベートブラウズ等）通常どおり使える
    })
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange)
  }, [])
  return updated
}
