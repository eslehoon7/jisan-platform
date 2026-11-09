import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { won, pyeong, perPy } from '../lib/format'
import Locked from './Locked'

// 실거래 상세표 — 계약해제는 취소선, 공장(지산)/상가·업무 구분
function Row({ t }) {
  const py = t.area_m2 ? t.price_krw / (t.area_m2 / 3.3058) : null
  return (
    <tr className={t.canceled ? 'canceled' : ''}>
      <td>{t.deal_date?.slice(2).replaceAll('-', '.')}</td>
      <td className="num"><b>{won(t.price_krw)}</b>{t.canceled && <i className="tag-sm">해제</i>}<div className="sub">평당 {perPy(py)}</div></td>
      <td className="num">{pyeong(t.area_m2)}{t.kind !== '공장(지산)' && <div className="sub">{t.kind}</div>}</td>
      <td className="num">{t.floor ? `${t.floor}층` : '-'}</td>
    </tr>
  )
}

export default function Transactions({ buildingId, session, onLogin }) {
  const [rows, setRows] = useState(null)
  const [kind, setKind] = useState('전체')
  const [more, setMore] = useState(20)

  useEffect(() => {
    setRows(null); setMore(20); setKind('전체')
    supabase.rpc('building_trades', { p_id: buildingId }).then(({ data }) => setRows(data || []))
  }, [buildingId, session])

  if (!rows) return <p className="muted">불러오는 중…</p>
  if (!rows.length) return <p className="muted">아직 거래 기록이 없어요.</p>
  const total = rows[0]?.total ?? rows.length
  const hasShop = rows.some((r) => r.kind !== '공장(지산)')
  const list = rows.filter((r) => kind === '전체' || r.kind === kind)
  const head = <thead><tr><th>계약일</th><th className="num">거래가</th><th className="num">전용</th><th className="num">층</th></tr></thead>

  return (
    <>
      <div className="trade-head">
        <p className="note">전체 {total}건 · 국토부 실거래가 · 줄 그어진 건 계약해제</p>
        {session && hasShop && (
          <div className="seg sm">{['전체', '공장(지산)', '상가·업무'].map((k) => <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{k}</button>)}</div>
        )}
      </div>
      <table className="table">{head}<tbody>{list.slice(0, session ? more : 3).map((t, i) => <Row key={i} t={t} />)}</tbody></table>
      {session && list.length > more && <button className="btn white block" onClick={() => setMore(more + 30)}>실거래가 더보기 ({list.length - more}건 남음)</button>}
      {!session && total > 3 && (
        <Locked title={`가입하면 이 건물의 전체 거래내역 ${total}건을 볼 수 있어요`} onLogin={onLogin}>
          <table className="table"><tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td>26.00.00</td><td className="num">00억 0,000만</td><td className="num">00.0평</td><td className="num">0층</td></tr>
            ))}
          </tbody></table>
        </Locked>
      )}
    </>
  )
}
