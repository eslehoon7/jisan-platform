import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { wonShort, m2 } from '../../lib/format'
import { Field, MoneyInput, Toast } from './ui'

const EMPTY = { id: null, building_id: '', deal_type: '매매', title: '', area_m2: '', asking_price_krw: null,
  auction_first_price_krw: null, auction_current_price_krw: null, auction_round: '', status: 'active',
  d_unit_no: '', d_floor: '', d_maintenance: null, d_deposit: null, d_monthly: null, d_description: '' }
const STATUS = { active: '🟢 노출 중', closed: '⚫ 거래완료', hidden: '🙈 숨김' }
const num = (v) => (v === '' || v == null ? null : Number(v))

// agentId 가 있으면 '중개사 센터' 모드: 내 매물만 보고, 등록 시 내 중개사 정보가 자동으로 붙어요
export default function ListingsAdmin({ agentId = null, allowedTypes = ['매매', '경매', '분양', '임대'] }) {
  const [rows, setRows] = useState([])
  const [buildings, setBuildings] = useState([])
  const [form, setForm] = useState(null)
  const [type, setType] = useState('전체')
  const [msg, setMsg] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const load = () => {
    let q = supabase.from('listings').select('*, buildings(name), listing_details(*)').order('created_at', { ascending: false })
    if (agentId) q = q.eq('agent_id', agentId)
    return q
      .then(({ data, error }) => (error ? flash('⚠ ' + error.message) : setRows(data || [])))
  }
  useEffect(() => {
    load()
    supabase.rpc('admin_buildings').then(({ data }) => setBuildings(data || []))
  }, [])

  function edit(r) {
    const d = (Array.isArray(r.listing_details) ? r.listing_details[0] : r.listing_details) || {}
    setForm({ ...EMPTY, ...r, area_m2: r.area_m2 ?? '', auction_round: r.auction_round ?? '',
      d_unit_no: d.unit_no ?? '', d_floor: d.floor ?? '', d_maintenance: d.maintenance_fee_krw ?? null,
      d_deposit: d.deposit_krw ?? null, d_monthly: d.monthly_rent_krw ?? null, d_description: d.description ?? '' })
  }

  async function save() {
    const f = form
    const auction = f.deal_type === '경매'
    const main = auction ? f.auction_current_price_krw : f.asking_price_krw
    if (!f.building_id) return flash('⚠ 건물을 골라 주세요')
    if (!f.area_m2) return flash('⚠ 면적을 넣어 주세요')
    if (!main && f.deal_type !== '임대') return flash(auction ? '⚠ 현재 경매가를 넣어 주세요' : '⚠ 가격을 넣어 주세요')
    const row = {
      building_id: Number(f.building_id), deal_type: f.deal_type,
      title: f.title.trim() || `${f.d_floor ? f.d_floor + '층 ' : ''}${f.deal_type} 물건`,
      area_m2: num(f.area_m2),
      asking_price_krw: auction ? f.auction_current_price_krw : f.asking_price_krw,
      price_range: main ? wonShort(main) : f.d_deposit ? `보증금 ${wonShort(f.d_deposit)}` : '가격 협의',
      auction_first_price_krw: auction ? f.auction_first_price_krw : null,
      auction_current_price_krw: auction ? f.auction_current_price_krw : null,
      auction_round: auction ? num(f.auction_round) : null,
      status: f.status,
      ...(agentId && !f.id ? { agent_id: agentId } : {}),
    }
    let id = f.id
    if (id) {
      const { error } = await supabase.from('listings').update(row).eq('id', id)
      if (error) return flash('⚠ 저장 실패: ' + error.message)
    } else {
      const { data, error } = await supabase.from('listings').insert(row).select('id').single()
      if (error) return flash('⚠ 저장 실패: ' + error.message)
      id = data.id
    }
    // 회원 전용 상세정보
    const { error: e2 } = await supabase.from('listing_details').upsert({
      listing_id: id, unit_no: f.d_unit_no || null, floor: num(f.d_floor),
      price_krw: row.asking_price_krw, deposit_krw: f.d_deposit, monthly_rent_krw: f.d_monthly,
      maintenance_fee_krw: f.d_maintenance, description: f.d_description || null,
    })
    if (e2) return flash('⚠ 상세정보 저장 실패: ' + e2.message)
    flash(f.id ? '수정했어요' : '새 물건을 등록했어요')
    setForm(null); load()
  }

  const list = rows.filter((r) => type === '전체' || r.deal_type === type)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className={form ? 'admin-split' : 'admin-split solo'}>
      <section className="admin-list">
        <div className="admin-list-head">
          <div className="seg small">
            {['전체', ...allowedTypes].map((t) => <button key={t} className={t === type ? 'on' : ''} onClick={() => setType(t)}>{t}</button>)}
          </div>
          <button className="btn primary sm" onClick={() => setForm({ ...EMPTY, deal_type: type === '전체' ? allowedTypes[0] : type })}>+ 물건 등록</button>
        </div>
        <table className="atable">
          <thead><tr><th>유형</th><th>건물 / 제목</th><th>면적</th><th>가격</th><th>상태</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={form?.id === r.id ? 'sel' : ''} onClick={() => edit(r)}>
                <td><span className={`deal ${r.deal_type}`}>{r.deal_type}</span></td>
                <td><b>{r.buildings?.name}</b><div className="sub">{r.title}</div></td>
                <td>{m2(r.area_m2)}</td>
                <td>{r.deal_type === '경매'
                  ? <>{wonShort(r.auction_current_price_krw)}<div className="sub">1차 {wonShort(r.auction_first_price_krw)}{r.auction_round ? ` · ${r.auction_round}차` : ''}</div></>
                  : wonShort(r.asking_price_krw)}</td>
                <td>{STATUS[r.status]}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="5" className="empty-cell">등록된 물건이 없어요</td></tr>}
          </tbody>
        </table>
      </section>

      {form && (
        <section className="admin-form">
          <div className="af-head">
            <h2>{form.id ? '물건 수정' : '새 물건 등록'}</h2>
            <button className="icon-btn" onClick={() => setForm(null)}>✕</button>
          </div>

          <div className="af-section">공개 정보 <small>— 지도·목록에 누구나 볼 수 있어요</small></div>
          <div className="af-grid">
            <Field label="건물 *" wide>
              <select value={form.building_id} onChange={set('building_id')}>
                <option value="">건물 선택</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>[{b.district}] {b.name}</option>)}
              </select>
            </Field>
            <Field label="거래 유형 *">
              <select value={form.deal_type} onChange={set('deal_type')}>
                {allowedTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="노출 상태">
              <select value={form.status} onChange={set('status')}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="제목" wide hint="비워두면 '7층 매매 물건'처럼 자동으로 만들어져요"><input value={form.title} onChange={set('title')} placeholder="예: 7층 코너 드라이브인 호실" /></Field>
            <Field label="면적 (㎡) *"><input inputMode="decimal" value={form.area_m2} onChange={(e) => setForm({ ...form, area_m2: e.target.value.replace(/[^\d.]/g, '') })} placeholder="112.4" /></Field>
            {form.deal_type === '경매' ? (
              <>
                <Field label="1차 경매가"><MoneyInput value={form.auction_first_price_krw} onChange={(v) => setForm({ ...form, auction_first_price_krw: v })} /></Field>
                <Field label="현재 경매가 *"><MoneyInput value={form.auction_current_price_krw} onChange={(v) => setForm({ ...form, auction_current_price_krw: v })} /></Field>
                <Field label="현재 회차"><input inputMode="numeric" value={form.auction_round} onChange={(e) => setForm({ ...form, auction_round: e.target.value.replace(/\D/g, '') })} placeholder="2" /></Field>
              </>
            ) : form.deal_type !== '임대' ? (
              <Field label={form.deal_type === '분양' ? '분양가 *' : '호가 *'}><MoneyInput value={form.asking_price_krw} onChange={(v) => setForm({ ...form, asking_price_krw: v })} /></Field>
            ) : null}
          </div>

          <div className="af-section">회원 전용 정보 <small>— 로그인한 회원만 볼 수 있어요</small></div>
          <div className="af-grid">
            <Field label="호실"><input value={form.d_unit_no} onChange={set('d_unit_no')} placeholder="705호" /></Field>
            <Field label="층"><input inputMode="numeric" value={form.d_floor} onChange={(e) => setForm({ ...form, d_floor: e.target.value.replace(/\D/g, '') })} placeholder="7" /></Field>
            {form.deal_type === '임대' && (
              <>
                <Field label="보증금"><MoneyInput value={form.d_deposit} onChange={(v) => setForm({ ...form, d_deposit: v })} placeholder="예: 5000" /></Field>
                <Field label="월세"><MoneyInput value={form.d_monthly} onChange={(v) => setForm({ ...form, d_monthly: v })} placeholder="예: 250" /></Field>
              </>
            )}
            <Field label="관리비 (월)"><MoneyInput value={form.d_maintenance} onChange={(v) => setForm({ ...form, d_maintenance: v })} placeholder="예: 35" /></Field>
            <Field label="상세 설명" wide><textarea rows="3" value={form.d_description} onChange={set('d_description')} /></Field>
          </div>

          <div className="af-actions">
            <button className="btn white" onClick={() => setForm(null)}>취소</button>
            <button className="btn primary" onClick={save}>{form.id ? '수정 저장' : '등록하기'}</button>
          </div>
        </section>
      )}
      <Toast msg={msg} />
    </div>
  )
}
