import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { wonShort, m2 } from '../../lib/format'
import { nextMinPrice } from './ListingsAdmin'

// 경매 '오늘 할 일'
// 1) 매각기일이 지난 경매 → 결과 넣기 (유찰 / 낙찰 / 취하·변경 / 기일 변경)
// 2) 매주 새 경매 확인 (마지막 확인 후 7일 지나면 표시)
export default function AuctionTodo({ onChanged }) {
  const [due, setDue] = useState([])
  const [lastCheck, setLastCheck] = useState(null)
  const [open, setOpen] = useState(null) // 유찰·기일변경 입력 중인 물건 id
  const [nextDate, setNextDate] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    const { data } = await supabase.rpc('admin_auction_todo')
    setDue(data || [])
    const { data: c } = await supabase.from('admin_checks').select('checked_at').eq('kind', 'auction_weekly').maybeSingle()
    setLastCheck(c?.checked_at ? new Date(c.checked_at) : null)
  }
  useEffect(() => { load() }, [])

  const done = async (text) => { setMsg(text); setOpen(null); setNextDate(''); await load(); onChanged?.() }

  async function fail(r) { // 유찰: 회차 +1, 최저가 20% 낮춤, 다음 매각기일
    if (!nextDate) return setMsg('⚠ 다음 매각기일을 넣어 주세요')
    const price = nextMinPrice(r.auction_current_price_krw)
    const { error } = await supabase.from('listings').update({
      auction_round: (r.auction_round || 1) + 1, auction_current_price_krw: price, asking_price_krw: price,
      price_range: wonShort(price), auction_sale_date: nextDate, auction_result: '진행',
    }).eq('id', r.id)
    if (error) return setMsg('⚠ ' + error.message)
    done(`✅ ${r.auction_case_no} 유찰 반영: ${(r.auction_round || 1) + 1}차 최저가 ${wonShort(price)}`)
  }
  async function reschedule(r) { // 기일 변경(연기)만
    if (!nextDate) return setMsg('⚠ 바뀐 매각기일을 넣어 주세요')
    const { error } = await supabase.from('listings').update({ auction_sale_date: nextDate }).eq('id', r.id)
    if (error) return setMsg('⚠ ' + error.message)
    done(`✅ ${r.auction_case_no} 매각기일을 ${nextDate}로 바꿨어요`)
  }
  async function finish(r, result) { // 낙찰 → 거래완료, 취하·변경 → 숨김
    const label = result === '낙찰' ? '낙찰' : '취하·변경'
    if (!window.confirm(`${r.auction_case_no} 을(를) '${label}'로 처리할까요?\n경매 탭에서 내려가요.`)) return
    const { error } = await supabase.from('listings').update({
      auction_result: result, status: result === '낙찰' ? 'closed' : 'hidden',
    }).eq('id', r.id)
    if (error) return setMsg('⚠ ' + error.message)
    done(`✅ ${r.auction_case_no} ${label} 처리했어요`)
  }
  async function weeklyDone() {
    const { error } = await supabase.from('admin_checks').upsert({ kind: 'auction_weekly', checked_at: new Date().toISOString() })
    if (error) return setMsg('⚠ ' + error.message)
    done('✅ 이번 주 새 경매 확인 완료로 기록했어요')
  }

  const days = lastCheck ? Math.floor((Date.now() - lastCheck.getTime()) / 86400000) : null
  const weeklyDue = days == null || days >= 7
  if (!due.length && !weeklyDue && !msg) return null

  return (
    <div className="auction-todo">
      <h3>⚖️ 경매 할 일</h3>
      {msg && <p className={msg.startsWith('⚠') ? 'molit-note err' : 'molit-note'}>{msg}</p>}

      {weeklyDue && (
        <div className="todo-card">
          <div>
            <b>📅 이번 주 새 경매 확인</b>
            <p className="muted small">마지막 확인: {days == null ? '아직 없음' : `${days}일 전`} · 탱크옥션에서 서울·경기·인천 <b>아파트형공장(지식산업센터)</b> 새 물건을 보고, 있으면 아래 [+ 물건 등록]으로 넣어 주세요.</p>
          </div>
          <button className="btn primary sm" onClick={weeklyDone}>확인 완료</button>
        </div>
      )}

      {due.map((r) => (
        <div key={r.id} className="todo-card">
          <div>
            <b>⚠ 결과 확인 필요 · {r.building_name}</b>
            <p className="small">{r.auction_case_no} {r.auction_court && `· ${r.auction_court}`} · {m2(r.area_m2)} · {r.auction_round || 1}차 최저가 <b>{wonShort(r.auction_current_price_krw)}</b></p>
            <p className="muted small">매각기일 {r.auction_sale_date || '미입력'} 이 지났어요. 탱크옥션에서 결과를 보고 골라 주세요.</p>
            {open === r.id && (
              <div className="todo-next">
                <label className="small">다음 매각기일 <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></label>
                <button className="btn primary sm" onClick={() => fail(r)}>유찰 저장 → {(r.auction_round || 1) + 1}차 {wonShort(nextMinPrice(r.auction_current_price_krw))}</button>
                <button className="btn white sm" onClick={() => reschedule(r)}>기일만 변경</button>
              </div>
            )}
          </div>
          <div className="todo-btns">
            <button className="btn white sm" onClick={() => { setOpen(open === r.id ? null : r.id); setNextDate('') }}>유찰 / 기일변경</button>
            <button className="btn dark sm" onClick={() => finish(r, '낙찰')}>낙찰</button>
            <button className="btn white sm" onClick={() => finish(r, '취하·변경')}>취하</button>
          </div>
        </div>
      ))}
    </div>
  )
}
