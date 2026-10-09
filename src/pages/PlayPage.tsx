import { useMemo, useState } from 'react'
import { LineBadge, Notice, Page } from '../components/parts'
import { StationPicker } from '../components/StationPicker'
import { PREFECTURES } from '../codes'
import type { RailData } from '../data'
import { type Question, kanaPool, makeQuestion, quizPool, shiritori } from '../quiz'
import { href } from '../router'
import type { Station } from '../types'

const ROUND = 10
/** 「おなじみの駅」の基準（1日の乗降客数） */
const FAMOUS = 30000

export function PlayPage({ data }: { data: RailData }) {
  const [tab, setTab] = useState<'quiz' | 'shiritori'>('quiz')
  return (
    <Page>
      <h1>駅名であそぶ</h1>
      <div className="route-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'quiz'}
          className={tab === 'quiz' ? 'active' : ''}
          onClick={() => setTab('quiz')}
        >
          <strong>読み方クイズ</strong>
          <span>4択で10問</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'shiritori'}
          className={tab === 'shiritori' ? 'active' : ''}
          onClick={() => setTab('shiritori')}
        >
          <strong>駅名しりとり</strong>
          <span>駅の読みでつなぐ</span>
        </button>
      </div>
      {tab === 'quiz' ? <Quiz data={data} /> : <Shiritori data={data} />}
      <Notice>読み仮名は Wikidata に登録された値です。読み仮名の無い駅、漢字以外を含む駅名はクイズに出ません。</Notice>
    </Page>
  )
}

function Quiz({ data }: { data: RailData }) {
  const [scope, setScope] = useState<'famous' | 'all'>('famous')
  const [pref, setPref] = useState('')
  const pool = useMemo(() => {
    const all = quizPool(data.stations.values())
    return all.filter((s) => (!pref || s.pref === pref) && (scope === 'all' || (s.passengers ?? 0) >= FAMOUS))
  }, [data, scope, pref])

  const [round, setRound] = useState(0)
  return (
    <>
      <div className="filters">
        <label>
          出題範囲
          <select value={scope} onChange={(e) => setScope(e.target.value as 'famous' | 'all')}>
            <option value="famous">おなじみの駅</option>
            <option value="all">全国の駅</option>
          </select>
        </label>
        <label>
          都道府県
          <select value={pref} onChange={(e) => setPref(e.target.value)}>
            <option value="">全国</option>
            {PREFECTURES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        {pool.length}駅から出題{scope === 'famous' && `（おなじみの駅 = 1日の乗降客数${FAMOUS.toLocaleString()}人以上）`}
      </p>
      {pool.length < 4 ? (
        <p className="muted">この条件では出題できる駅が足りません。範囲を広げてください。</p>
      ) : (
        <QuizRound key={`${scope}|${pref}|${round}`} data={data} pool={pool} onRestart={() => setRound(round + 1)} />
      )}
    </>
  )
}

function QuizRound({ data, pool, onRestart }: { data: RailData; pool: Station[]; onRestart: () => void }) {
  const [asked, setAsked] = useState<Set<string>>(() => new Set())
  const [question, setQuestion] = useState<Question | null>(() => makeQuestion(pool, Math.random))
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [count, setCount] = useState(1)

  if (!question) return <p className="muted">問題を作れませんでした。範囲を広げてください。</p>
  const finished = count > ROUND

  if (finished) {
    return (
      <div className="quiz-card">
        <p className="quiz-result">
          {ROUND}問中 <strong>{score}</strong> 問正解
        </p>
        <p>{score === ROUND ? '全問正解！' : score >= 7 ? 'かなりの駅名通です。' : 'また挑戦してみてください。'}</p>
        <button className="button" onClick={onRestart}>
          もう一度
        </button>
      </div>
    )
  }

  const st = question.station
  const correct = picked === question.answer
  const next = () => {
    const used = new Set(asked).add(st.id)
    setAsked(used)
    setQuestion(makeQuestion(pool, Math.random, used))
    setPicked(null)
    setCount(count + 1)
  }

  return (
    <div className="quiz-card">
      <p className="muted small">
        第{count}問 / {ROUND}・正解 {score}
      </p>
      <p className="quiz-name">{st.name}</p>
      <p className="muted small">
        {st.pref}
        {st.city}
      </p>
      <div className="quiz-choices">
        {question.choices.map((c, i) => (
          <button
            key={c}
            className={picked == null ? '' : i === question.answer ? 'right' : i === picked ? 'wrong' : 'dim'}
            disabled={picked != null}
            onClick={() => {
              setPicked(i)
              if (i === question.answer) setScore(score + 1)
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {picked != null && (
        <div className="quiz-feedback" role="status">
          <p>
            <strong>{correct ? '正解！' : '残念…'}</strong> {st.name}は「{question.choices[question.answer]}」。
          </p>
          <div className="badge-row wrap">
            {st.lines.slice(0, 4).map((id) => {
              const l = data.lines.get(id)
              return l ? <LineBadge key={id} line={l} small /> : null
            })}
          </div>
          <p>
            <a href={href.station(st.id)}>{st.name}駅のページ</a>
          </p>
          <button className="button" onClick={next}>
            {count === ROUND ? '結果を見る' : '次の問題'}
          </button>
        </div>
      )}
    </div>
  )
}

function Shiritori({ data }: { data: RailData }) {
  const pool = useMemo(() => kanaPool(data.stations.values()), [data])
  const kanaSet = useMemo(() => new Set(pool.map((s) => s.id)), [pool])
  const [start, setStart] = useState<Station | null>(null)
  const [seed, setSeed] = useState(0)
  const chain = useMemo(
    () => (start ? shiritori(pool, start, Math.random) : []),
    // seed は「別のつなぎ方」で作り直すため
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, start, seed],
  )
  const random = () => setStart(pool[Math.floor(Math.random() * pool.length)])

  return (
    <>
      <div className="picker-single">
        <StationPicker
          key={start?.id ?? ''}
          data={data}
          label="最初の駅"
          station={start ?? undefined}
          filter={(s) => kanaSet.has(s.id)}
          onPick={(id) => setStart(data.stations.get(id) ?? null)}
        />
      </div>
      <div className="page-actions">
        <button className="action" onClick={random}>
          ランダムに始める
        </button>
        {start && (
          <button className="action" onClick={() => setSeed(seed + 1)}>
            別のつなぎ方
          </button>
        )}
      </div>
      {chain.length > 0 && (
        <>
          <ol className="shiritori">
            {chain.map((s) => (
              <li key={s.id}>
                <a href={href.station(s.id)}>{s.name}</a>
                <span className="muted small">
                  {s.kana}・{s.pref}
                </span>
              </li>
            ))}
          </ol>
          <p className="muted small">
            {chain.length}駅つながりました。
            {chain[chain.length - 1].kana!.endsWith('ん')
              ? '「ん」で終わったのでおしまい。'
              : chain.length < 15
                ? '次につなげる駅がありません。'
                : ''}
          </p>
        </>
      )}
    </>
  )
}
