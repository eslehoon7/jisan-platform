import { useState } from 'react'
import BuildingsAdmin from './BuildingsAdmin'
import ListingsAdmin from './ListingsAdmin'
import TradesAdmin from './TradesAdmin'
import BusinessesAdmin from './BusinessesAdmin'

const TABS = [
  { key: 'biz', label: '🧾 사업자 승인' },
  { key: 'buildings', label: '🏢 건물' },
  { key: 'listings', label: '🔑 매물·경매·분양' },
  { key: 'trades', label: '📈 실거래' },
]

// 관리자 화면 (주소: /#/admin)
export default function AdminPage({ profile }) {
  const [tab, setTab] = useState('biz')
  const [prefill, setPrefill] = useState(null) // 실거래 후보 → 건물 등록 화면으로 넘길 값
  const register = (p) => { setPrefill({ ...p, _t: Date.now() }); setTab('buildings') }

  if (!profile) return <div className="admin-guard">로그인 정보를 확인하는 중…</div>
  if (profile.role !== 'admin')
    return (
      <div className="admin-guard">
        <h2>관리자만 들어올 수 있어요</h2>
        <a className="btn primary" href="#/">지도로 돌아가기</a>
      </div>
    )

  return (
    <div className="admin">
      <header className="admin-top">
        <a href="#/" className="admin-back">← 지도로</a>
        <h1>지산맵 관리자</h1>
        <nav className="admin-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
      </header>
      <main className="admin-body">
        {tab === 'buildings' && <BuildingsAdmin prefill={prefill} />}
        {tab === 'listings' && <ListingsAdmin />}
        {tab === 'trades' && <TradesAdmin onRegister={register} />}
        {tab === 'biz' && <BusinessesAdmin />}
      </main>
    </div>
  )
}
