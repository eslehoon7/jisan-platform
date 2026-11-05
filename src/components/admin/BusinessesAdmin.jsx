import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { bizInfo, LISTING_TYPES, fmtTel } from '../../lib/business'
import { AddressPicker } from './BuildingsAdmin'
import { Toast } from './ui'

const STATUS = { pending: '⏳ 심사 대기', approved: '✅ 승인', rejected: '⛔ 반려' }
const fmtNo = (n) => String(n || '').replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3')

// 사업자 가입 심사
export default function BusinessesAdmin() {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('pending')
  const [sel, setSel] = useState(null)
  const [msg, setMsg] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const load = () => supabase.from('businesses').select('*').order('created_at', { ascending: false })
    .then(({ data, error }) => (error ? flash('⚠ ' + error.message) : setRows(data || [])))
  useEffect(() => { load() }, [])

  const list = rows.filter((r) => filter === 'all' || r.status === filter)
  const count = (s) => rows.filter((r) => r.status === s).length

  return (
    <div className={sel ? 'admin-split' : 'admin-split solo'}>
      <section className="admin-list">
        <div className="admin-list-head">
          <div className="seg small">
            {[['pending', `심사 대기 ${count('pending')}`], ['approved', `승인 ${count('approved')}`], ['rejected', `반려 ${count('rejected')}`], ['all', '전체']].map(([k, l]) =>
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
        </div>
        <table className="atable">
          <thead><tr><th>업종</th><th>상호 / 대표</th><th>사업자번호</th><th>신청일</th><th>상태</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={sel?.id === r.id ? 'sel' : ''} onClick={() => setSel(r)}>
                <td>{bizInfo(r.biz_type).icon} {r.biz_type}</td>
                <td><b>{r.company_name}</b><div className="sub">{r.representative} · {r.nts_verified_at ? <span className="nts-ok">국세청 ✅</span> : <span className="nts-no">국세청 미확인</span>}</div></td>
                <td>{fmtNo(r.business_no)}</td>
                <td>{r.created_at.slice(0, 10)}</td>
                <td>{STATUS[r.status]}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="5" className="empty-cell">{filter === 'pending' ? '심사할 신청이 없어요' : '해당하는 사업자가 없어요'}</td></tr>}
          </tbody>
        </table>
      </section>
      {sel && <Review key={sel.id} b={sel} onClose={() => setSel(null)} onDone={(m) => { flash(m); setSel(null); load() }} flash={flash} />}
      <Toast msg={msg} />
    </div>
  )
}

function Review({ b, onClose, onDone, flash }) {
  const needsLocation = !LISTING_TYPES.includes(b.biz_type) && !['분양대행', '기타'].includes(b.biz_type)
  const [loc, setLoc] = useState({ id: b.id, address: b.address, lat: null, lng: null })
  const [adUntil, setAdUntil] = useState(b.ad_until || '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function openDoc(path) {
    const { data, error } = await supabase.storage.from('business-docs').createSignedUrl(path, 300)
    if (error) return flash('⚠ 서류를 열지 못했어요: ' + error.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function review(approve) {
    if (approve && needsLocation && loc.lat == null) return flash('⚠ 업체 위치를 지도에서 정해 주세요 (반경 3km 검색에 필요)')
    if (!approve && !reason.trim()) return flash('⚠ 반려 사유를 적어 주세요 (사업자에게 보여져요)')
    setBusy(true)
    const { error } = await supabase.rpc('admin_review_business', {
      p_id: b.id, p_approve: approve, p_reason: approve ? null : reason.trim(),
      p_lat: loc.lat, p_lng: loc.lng, p_ad_until: adUntil || null,
    })
    setBusy(false)
    if (error) return flash('⚠ ' + error.message)
    onDone(approve ? `${b.company_name} 승인 완료` : `${b.company_name} 반려 처리`)
  }

  const info = bizInfo(b.biz_type)
  return (
    <section className="admin-form">
      <div className="af-head">
        <h2>{info.icon} {b.company_name}</h2>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>
      <dl className="facts">
        <div><dt>상태</dt><dd>{STATUS[b.status]}{b.reject_reason ? ` — ${b.reject_reason}` : ''}</dd></div>
        <div><dt>업종</dt><dd>{b.biz_type}</dd></div>
        <div><dt>대표자</dt><dd>{b.representative}</dd></div>
        <div><dt>사업자번호</dt><dd>{fmtNo(b.business_no)}</dd></div>
        <div><dt>개업일자</dt><dd>{b.start_dt || '-'}</dd></div>
        <div><dt>국세청 확인</dt><dd>{b.nts_verified_at
          ? <span className="nts-ok">✅ 일치 · {b.nts_status || '계속사업자'}{b.nts_tax_type ? ` · ${b.nts_tax_type}` : ''} ({b.nts_verified_at.slice(0, 10)})</span>
          : <span className="nts-no">⚠️ 미확인{b.nts_note ? ` — ${b.nts_note}` : ''}</span>}</dd></div>
        <div><dt>{info.license ? '등록번호' : '기타 번호'}</dt><dd>{b.license_no || '-'}</dd></div>
        <div><dt>주소</dt><dd>{b.address}</dd></div>
        <div><dt>대표 전화</dt><dd>{b.office_phone}</dd></div>
        <div><dt>담당자</dt><dd>{b.contact_name || '-'} {b.contact_phone ? fmtTel(b.contact_phone) : ''}</dd></div>
        <div><dt>소개</dt><dd>{b.intro || '-'}</dd></div>
      </dl>

      <div className="af-section">제출 서류 <small>— 열면 5분 동안만 볼 수 있는 링크로 열려요</small></div>
      <div className="doc-btns">
        {b.cert_path && <button className="btn white sm" onClick={() => openDoc(b.cert_path)}>📄 사업자등록증 보기</button>}
        {b.license_path && <button className="btn white sm" onClick={() => openDoc(b.license_path)}>📄 업종 등록증 보기</button>}
      </div>
      <p className="muted small">✔ 체크: 상호·대표자·사업자번호가 서류와 같은지 / {info.license ? `${info.license}가 유효한지 ` : ''}/ 휴·폐업 여부(홈택스 조회)</p>

      {b.status !== 'approved' && (
        <>
          {needsLocation && (
            <>
              <div className="af-section">업체 위치 <small>— 지산 반경 3km 업체 검색에 쓰여요</small></div>
              <AddressPicker form={loc} setForm={setLoc} />
            </>
          )}
          <div className="af-section">광고·이용 기간</div>
          <label className="af"><span className="af-label">이용 만료일 (정액 광고비 기준, 비우면 기간 없음)</span>
            <input type="date" value={adUntil} onChange={(e) => setAdUntil(e.target.value)} /></label>

          <div className="af-actions split">
            <div className="reject-box">
              <input placeholder="반려 사유 (예: 사업자등록증 식별 불가)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn white" disabled={busy} onClick={() => review(false)}>반려</button>
            </div>
            <button className="btn primary" disabled={busy} onClick={() => review(true)}>✅ 승인</button>
          </div>
        </>
      )}
    </section>
  )
}
