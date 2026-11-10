import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AgentListings from '../biz/AgentListings'
import { AgentInbox } from '../biz/BizCenter'

// 관리자용: 중개사가 '사업자센터'에서 보는 화면 그대로 미리보기
// ※ 미리보기지만 실제 화면이라, 여기서 등록·수정하면 그 중개사 매물로 진짜 저장돼요
const TEST_AGENT = {
  office_name: '지산맵 테스트 중개사무소', representative: '테스트', registration_no: 'TEST-0000',
  office_address: '테스트용 (실제 사무소 아님)', office_phone: '000-0000-0000',
}

export default function AgentPreview() {
  const [agents, setAgents] = useState([])
  const [id, setId] = useState('')
  const [tab, setTab] = useState('main')
  const [msg, setMsg] = useState('')

  async function load() {
    const { data } = await supabase.from('agents').select('*').eq('status', 'approved').order('office_name')
    setAgents(data || [])
    if (!id && data?.length) setId(String(data[0].id))
  }
  useEffect(() => { load() }, [])

  async function makeTest() {
    const { data, error } = await supabase.from('agents').insert({ ...TEST_AGENT, status: 'approved', source: 'offline', approved_at: new Date().toISOString() }).select('id').single()
    if (error) return setMsg('⚠ 만들지 못했어요: ' + error.message)
    await load(); setId(String(data.id)); setMsg('✅ 테스트 중개사무소를 만들었어요')
  }

  const a = agents.find((x) => String(x.id) === id)
  const TABS = [['main', '🔑 내 매물'], ['inbox', '💬 받은 문의'], ['info', '🏢 사무소 정보']]
  return (
    <div>
      <div className="preview-bar">
        <b>👀 중개사 화면 미리보기</b>
        <select value={id} onChange={(e) => { setId(e.target.value); setTab('main') }}>
          {!agents.length && <option value="">등록된 중개사무소가 없어요</option>}
          {agents.map((x) => <option key={x.id} value={x.id}>{x.office_name} · {x.representative}{x.source === 'offline' ? ' (관리자 등록)' : ''}</option>)}
        </select>
        {!agents.some((x) => x.office_name === TEST_AGENT.office_name) && <button className="btn white sm" onClick={makeTest}>+ 테스트 중개사무소 만들기</button>}
        <span className="muted small">⚠ 여기서 매물을 등록·수정하면 실제로 그 중개사 매물로 저장되고 지도에도 나와요. 테스트한 매물은 끝나고 '숨김'으로 바꿔 주세요.</span>
      </div>
      {msg && <p className={msg.startsWith('⚠') ? 'molit-note err' : 'molit-note'}>{msg}</p>}

      {a && (
        <div className="preview-frame">
          <header className="admin-top">
            <span className="admin-back">← 지도로</span>
            <h1>🏢 사업자센터</h1>
            <nav className="admin-tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
            <span className="biz-badge">🔑 {a.office_name}</span>
          </header>
          <main className="admin-body">
            {tab === 'main' && <AgentListings key={a.id} agentId={a.id} bizType="중개사" />}
            {tab === 'inbox' && <AgentInbox agentId={a.id} />}
            {tab === 'info' && (
              <div className="admin-single info-card">
                <h3>사무소 정보</h3>
                <dl className="facts">
                  {[['사무소 이름', a.office_name], ['대표 공인중개사', a.representative], ['등록번호', a.registration_no], ['주소', a.office_address], ['대표 전화', a.office_phone]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
                <p className="muted small">중개사 본인 화면에서는 전화·소개 등을 직접 고칠 수 있어요.</p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
