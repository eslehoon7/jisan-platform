import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { bizInfo, LISTING_TYPES, fmtTel } from '../../lib/business'
import ListingsAdmin from '../admin/ListingsAdmin'
import BusinessApplyForm from './BusinessApplyForm'
import { Toast } from '../admin/ui'

// 사업자센터 (주소: /#/biz)
export default function BizCenter({ session }) {
  const [biz, setBiz] = useState(undefined) // undefined=불러오는 중, null=신청 없음
  const [agentId, setAgentId] = useState(null)
  const [tab, setTab] = useState('main')

  const load = async () => {
    const { data } = await supabase.from('businesses').select('*').eq('profile_id', session.user.id).maybeSingle()
    setBiz(data || null)
    if (data?.status === 'approved' && LISTING_TYPES.includes(data.biz_type)) {
      const { data: a } = await supabase.from('agents').select('id').eq('profile_id', session.user.id).maybeSingle()
      setAgentId(a?.id ?? null)
    }
  }
  useEffect(() => { load() }, [session.user.id])

  const shell = (body, tabs) => (
    <div className="admin">
      <header className="admin-top">
        <a href="#/" className="admin-back">← 지도로</a>
        <h1>🏢 사업자센터</h1>
        {tabs}
        {biz && <span className="biz-badge">{bizInfo(biz.biz_type).icon} {biz.company_name}</span>}
      </header>
      <main className="admin-body">{body}</main>
    </div>
  )

  if (biz === undefined) return shell(<p className="muted">불러오는 중…</p>)

  // 신청 없음 / 반려 → 신청서
  if (!biz || biz.status === 'rejected')
    return shell(
      <div className="admin-single narrow">
        {biz?.status === 'rejected' ? (
          <div className="status-card rejected">
            <h2>가입 신청이 반려됐어요</h2>
            <p><b>사유:</b> {biz.reject_reason}</p>
            <p className="muted">아래에서 내용을 고쳐 다시 신청해 주세요.</p>
          </div>
        ) : (
          <div className="status-card">
            <h2>사업자 가입 신청</h2>
            <p className="muted">지금 계정({session.user.email})으로 사업자 신청을 해요. 서류 확인 후 관리자 승인으로 열려요.</p>
          </div>
        )}
        <BusinessApplyForm session={session} prefill={biz ? { ...biz, business_no: biz.business_no } : null} onDone={load} />
      </div>
    )

  // 심사 중
  if (biz.status === 'pending')
    return shell(
      <div className="admin-single narrow">
        <div className="status-card pending">
          <div className="sent-icon">⏳</div>
          <h2>관리자가 서류를 확인하고 있어요</h2>
          <p className="muted">승인되면 이 화면에서 바로 사업자 기능을 쓸 수 있어요. (보통 1~2 영업일)</p>
        </div>
        <BizInfoCard biz={biz} />
      </div>
    )

  // 승인됨 → 업종별 메뉴
  const isLister = LISTING_TYPES.includes(biz.biz_type)
  const TABS = isLister
    ? [['main', '🔑 내 매물'], ['inbox', '💬 받은 문의'], ['info', '🏢 사무소 정보']]
    : [['main', '💬 받은 상담'], ['info', '🏢 업체 정보'], ['board', '📝 게시·자료 (준비 중)']]
  const tabs = (
    <nav className="admin-tabs">
      {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
    </nav>
  )

  let body
  if (tab === 'info') body = <BizInfoEdit biz={biz} onSaved={load} />
  else if (tab === 'board') body = <ComingSoon biz={biz} />
  else if (isLister) body = tab === 'inbox' ? <AgentInbox agentId={agentId} /> : agentId
    ? <ListingsAdmin agentId={agentId} allowedTypes={biz.biz_type === '분양대행' ? ['분양'] : ['매매', '임대', '분양']} />
    : <p className="muted">중개사 정보를 불러오는 중…</p>
  else body = <VendorInbox userId={session.user.id} />

  return shell(body, tabs)
}

function BizInfoCard({ biz }) {
  const rows = [['업종', biz.biz_type], ['상호', biz.company_name], ['대표자', biz.representative], ['사업자등록번호', biz.business_no.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3')], ['개업일자', biz.start_dt || '-'], ['국세청 확인', biz.nts_verified_at ? '✅ 일치' : '서류로 확인 중'],
    ['등록번호', biz.license_no || '-'], ['주소', biz.address], ['대표 전화', biz.office_phone], ['제출 서류', [biz.cert_path && '사업자등록증', biz.license_path && '업종 등록증'].filter(Boolean).join(', ')]]
  return (
    <div className="admin-single info-card">
      <h3>제출한 정보</h3>
      <dl className="facts">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  )
}

function BizInfoEdit({ biz, onSaved }) {
  const [f, setF] = useState({ office_phone: biz.office_phone, contact_name: biz.contact_name || '', contact_phone: biz.contact_phone || '', intro: biz.intro || '' })
  const [msg, setMsg] = useState('')
  async function save() {
    const { error } = await supabase.from('businesses').update(f).eq('id', biz.id)
    if (!error && !LISTING_TYPES.includes(biz.biz_type)) {
      const { data: v } = await supabase.from('vendors').select('id').eq('owner_profile_id', biz.profile_id).maybeSingle()
      if (v) await supabase.from('vendor_details').update({ phone: f.office_phone, intro: f.intro }).eq('vendor_id', v.id)
    }
    setMsg(error ? '⚠ ' + error.message : '저장했어요'); setTimeout(() => setMsg(''), 2000); onSaved()
  }
  return (
    <div className="admin-single narrow">
      <BizInfoCard biz={biz} />
      <div className="admin-single">
        <h3>고객에게 보이는 정보 수정</h3>
        <div className="af-grid">
          <label className="af"><span className="af-label">대표 전화</span><input value={f.office_phone} onChange={(e) => setF({ ...f, office_phone: fmtTel(e.target.value) })} /></label>
          <label className="af"><span className="af-label">담당자</span><input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></label>
          <label className="af"><span className="af-label">담당자 휴대폰</span><input value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: fmtTel(e.target.value) })} /></label>
          <label className="af wide"><span className="af-label">업체 소개</span><textarea rows="4" value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} /></label>
        </div>
        <p className="muted small">상호·사업자번호·등록번호를 바꾸려면 관리자에게 문의해 주세요.</p>
        <div className="af-actions"><button className="btn primary" onClick={save}>저장</button></div>
      </div>
      <Toast msg={msg} />
    </div>
  )
}

function AgentInbox({ agentId }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!agentId) return
    supabase.from('listing_inquiries').select('*, listings!inner(title, agent_id, buildings(name))').eq('listings.agent_id', agentId)
      .order('created_at', { ascending: false }).then(({ data }) => setRows(data || []))
  }, [agentId])
  return (
    <div className="admin-single">
      <h3>매물 문의</h3>
      <table className="atable">
        <thead><tr><th>받은 날</th><th>매물</th><th>연락처</th><th>내용</th></tr></thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id}><td>{r.created_at.slice(0, 10)}</td><td><b>{r.listings?.buildings?.name}</b><div className="sub">{r.listings?.title}</div></td>
              <td><a href={`tel:${r.contact_phone}`}>{fmtTel(r.contact_phone)}</a></td><td>{r.message || '-'}</td></tr>
          ))}
          {rows && !rows.length && <tr><td colSpan="4" className="empty-cell">아직 받은 문의가 없어요</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function VendorInbox({ userId }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('vendor_requests').select('*, vendors!inner(owner_profile_id), buildings(name)').eq('vendors.owner_profile_id', userId)
      .order('created_at', { ascending: false }).then(({ data }) => setRows(data || []))
  }, [userId])
  return (
    <div className="admin-single">
      <h3>고객 상담 신청</h3>
      <table className="atable">
        <thead><tr><th>받은 날</th><th>건물</th><th>연락처</th><th>내용</th></tr></thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id}><td>{r.created_at.slice(0, 10)}</td><td>{r.buildings?.name || '-'}</td>
              <td><a href={`tel:${r.contact_phone}`}>{fmtTel(r.contact_phone)}</a></td><td>{r.message || '-'}</td></tr>
          ))}
          {rows && !rows.length && <tr><td colSpan="4" className="empty-cell">아직 받은 상담이 없어요</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function ComingSoon({ biz }) {
  return (
    <div className="admin-single narrow status-card">
      <div className="sent-icon">{bizInfo(biz.biz_type).icon}</div>
      <h2>{biz.biz_type} 전용 게시·자료 공간 준비 중</h2>
      <p className="muted">시공 사례, 상품 안내, 자료 공유 등 업종에 맞는 화면이 이곳에 생겨요.</p>
    </div>
  )
}
