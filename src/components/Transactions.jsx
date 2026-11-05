import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { won, pyeong } from '../lib/format'
import Locked from './Locked'

function Row({ t }) {
  return (
    <tr>
      <td>{t.deal_date}</td>
      <td className="num">{won(t.price_krw)}</td>
      <td className="num">{pyeong(t.area_m2)}</td>
      <td className="num">{t.floor ? `${t.floor}층` : '-'}</td>
    </tr>
  )
}

export default function Transactions({ buildingId, session, onLogin }) {
  const [rows, setRows] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    setRows(null); setPreview(null)
    if (session) {
      supabase.from('transactions').select('deal_date, price_krw, area_m2, floor')
        .eq('building_id', buildingId).order('deal_date', { ascending: false })
        .then(({ data }) => setRows(data || []))
    } else {
      supabase.rpc('transaction_preview', { p_building_id: buildingId })
        .then(({ data }) => setPreview(data))
    }
  }, [buildingId, session])

  const head = (
    <thead><tr><th>계약일</th><th className="num">거래가</th><th className="num">면적</th><th className="num">층</th></tr></thead>
  )

  if (session) {
    if (!rows) return <p className="muted">불러오는 중…</p>
    if (!rows.length) return <p className="muted">아직 거래 기록이 없어요.</p>
    return (
      <>
        <p className="note">전체 {rows.length}건 · 실거래 기준</p>
        <table className="table">{head}<tbody>{rows.map((t, i) => <Row key={i} t={t} />)}</tbody></table>
      </>
    )
  }

  if (!preview) return <p className="muted">불러오는 중…</p>
  const rest = Math.max(preview.total_count - preview.recent.length, 0)
  return (
    <>
      <p className="note">최근 거래 {preview.recent.length}건 미리보기</p>
      <table className="table">{head}<tbody>{preview.recent.map((t, i) => <Row key={i} t={t} />)}</tbody></table>
      {rest > 0 && (
        <Locked title={`가입하면 이 건물의 전체 거래내역 ${preview.total_count}건을 볼 수 있어요`} onLogin={onLogin}>
          <table className="table"><tbody>
            {Array.from({ length: Math.min(rest, 4) }).map((_, i) => (
              <tr key={i}><td>2026-00-00</td><td className="num">00억 0,000만</td><td className="num">00.0평</td><td className="num">0층</td></tr>
            ))}
          </tbody></table>
        </Locked>
      )}
    </>
  )
}
