import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { won, m2 } from '../../lib/format'
import { Field, MoneyInput, Toast } from './ui'
import MolitPanel from './MolitPanel'
import KicoxPanel from './KicoxPanel'

// 실거래: 국토부 자동수집 현황 + 건물별 실거래 확인·수동 입력
export default function TradesAdmin({ onRegister }) {
  const [buildings, setBuildings] = useState([])
  const [bid, setBid] = useState('')
  const [rows, setRows] = useState([])
  const [f, setF] = useState({ deal_date: '', price_krw: null, area_m2: '', floor: '' })
  const [msg, setMsg] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  useEffect(() => { supabase.rpc('admin_buildings').then(({ data }) => setBuildings(data || [])) }, [])
  const load = (id = bid) => id && supabase.from('transactions').select('*').eq('building_id', id).order('deal_date', { ascending: false }).then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [bid])

  async function add() {
    if (!bid) return flash('⚠ 건물을 먼저 골라 주세요')
    if (!f.deal_date || !f.price_krw || !f.area_m2) return flash('⚠ 계약일·거래가·면적은 꼭 넣어 주세요')
    const { error } = await supabase.from('transactions').insert({
      building_id: Number(bid), deal_date: f.deal_date, price_krw: f.price_krw,
      area_m2: Number(f.area_m2), floor: f.floor ? Number(f.floor) : null, source: 'manual',
    })
    if (error) return flash('⚠ 저장 실패: ' + error.message)
    flash('실거래를 추가했어요'); setF({ deal_date: '', price_krw: null, area_m2: '', floor: '' }); load()
  }

  async function remove(t) {
    if (!window.confirm(`${t.deal_date} · ${won(t.price_krw)} 거래를 삭제할까요?`)) return
    const { error } = await supabase.from('transactions').delete().eq('id', t.id)
    if (error) return flash('⚠ 삭제 실패: ' + error.message)
    flash('삭제했어요'); load()
  }

  return (
    <div className="admin-single wide">
      <MolitPanel onRegister={onRegister} />
      <KicoxPanel onRegister={onRegister} />
      <div className="af-section big">건물별 실거래 보기 · 직접 입력</div>
      <div className="af-grid">
        <Field label="건물 선택" wide>
          <select value={bid} onChange={(e) => setBid(e.target.value)}>
            <option value="">건물 선택</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>[{b.district}] {b.name} — 실거래 {b.trade_count}건</option>)}
          </select>
        </Field>
      </div>
      {bid && (
        <>
          <div className="af-section">실거래 추가</div>
          <div className="af-grid trade-row">
            <Field label="계약일 *"><input type="date" value={f.deal_date} onChange={(e) => setF({ ...f, deal_date: e.target.value })} /></Field>
            <Field label="거래가 *"><MoneyInput value={f.price_krw} onChange={(v) => setF({ ...f, price_krw: v })} /></Field>
            <Field label="면적 (㎡) *"><input inputMode="decimal" value={f.area_m2} onChange={(e) => setF({ ...f, area_m2: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="층"><input inputMode="numeric" value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value.replace(/\D/g, '') })} /></Field>
            <button className="btn primary" onClick={add}>추가</button>
          </div>
          <table className="atable">
            <thead><tr><th>계약일</th><th>거래가</th><th>면적</th><th>층</th><th>출처</th><th></th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.deal_date}</td><td><b>{won(t.price_krw)}</b></td><td>{m2(t.area_m2)}</td><td>{t.floor ?? '-'}</td>
                  <td>{t.source === 'manual' ? '직접입력' : '국토부 자동'}</td>
                  <td>{t.source === 'manual' && <button className="link danger" onClick={() => remove(t)}>삭제</button>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="6" className="empty-cell">아직 실거래가 없어요</td></tr>}
            </tbody>
          </table>
          <p className="muted small">맨 위(가장 최근) 거래가 지도 말풍선의 <b>실가</b>로 표시돼요.</p>
        </>
      )}
      <Toast msg={msg} />
    </div>
  )
}
