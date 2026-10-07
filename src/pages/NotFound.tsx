import { Page } from '../components/parts'
import { href } from '../router'

export function NotFound() {
  return (
    <Page>
      <h1>ページが見つかりません</h1>
      <p>
        データの更新で、路線や駅のページが変わった可能性があります。<a href={href.home()}>トップに戻る</a>
      </p>
    </Page>
  )
}
