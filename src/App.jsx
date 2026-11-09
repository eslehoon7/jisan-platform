import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { DISTRICTS } from './lib/naverMap'
import { priceLabel } from './lib/format'
import SideRail from './components/SideRail'
import Header from './components/Header'
import MapView from './components/MapView'
import BuildingList from './components/BuildingList'
import BuildingPanel from './components/BuildingPanel'
import AuthModal from './components/AuthModal'
import AdminPage from './components/admin/AdminPage'
import BizCenter from './components/biz/BizCenter'
import NewPasswordModal from './components/NewPasswordModal'

// 리치고 방식: 지도가 화면 전체, 나머지는 지도 위에 떠 있는 패널
export default function App() {
  const [dealType, setDealType] = useState('매매') // 매매 | 경매 | 분양
  const [buildings, setBuildings] = useState([])
  const [listings, setListings] = useState([]) // 공개 매물 요약 (건물·유형·호가·면적)
  const [trades, setTrades] = useState({}) // 건물별 최근 실거래 1건
  const [recentAsks, setRecentAsks] = useState([]) // 매물이 끝나도 남는 '최근 호가' 기록
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [listOpen, setListOpen] = useState(false)
  const [menu, setMenu] = useState('지산')
  const [onlyListings, setOnlyListings] = useState(false)
  const [query, setQuery] = useState('')
  const [vendors, setVendors] = useState([])
  const [session, setSession] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [authKind, setAuthKind] = useState('person')
  const [hasBiz, setHasBiz] = useState(false)
  const [route, setRoute] = useState(window.location.hash)
  const [recovery, setRecovery] = useState(false) // 비밀번호 재설정 메일 링크로 들어온 경우

  // 주소 #/admin 이면 관리자 화면
  useEffect(() => {
    const on = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // 로그인한 사람의 역할(일반/관리자) 가져오기
  useEffect(() => {
    if (!session) return setProfile(null)
    supabase.from('profiles').select('role, display_name').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data || { role: 'user' }))
    supabase.from('businesses').select('id').eq('profile_id', session.user.id).maybeSingle()
      .then(({ data }) => setHasBiz(!!data))
  }, [session])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setRecovery(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  // 전체 건물 + 유형별 물건 수 불러오기
  useEffect(() => {
    supabase.rpc('map_pins', { p_district: null }).then(({ data, error }) => {
      if (error) setError('건물 정보를 불러오지 못했어요: ' + error.message)
      setBuildings(data || [])
    })
    supabase.from('listings').select('id, building_id, deal_type, asking_price_krw, area_m2, auction_first_price_krw, auction_current_price_krw, auction_round').eq('status', 'active')
      .then(({ data }) => setListings(data || []))
    supabase.rpc('recent_asking_prices').then(({ data }) => setRecentAsks(data || []))
    supabase.rpc('latest_trades').then(({ data }) =>
      setTrades(Object.fromEntries((data || []).map((t) => [t.building_id, t]))))
  }, [])

  // 선택한 유형 기준으로 건물마다 물건 수 붙이기
  // 같은 면적으로 볼 오차 범위 (㎡)
  const AREA_TOLERANCE = 3
  const sameArea = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= AREA_TOLERANCE

  // 건물마다 말풍선에 넣을 값 계산
  const withCounts = useMemo(() => buildings.map((b) => {
    const t = trades[b.id] || null // 최근 실거래 1건
    const mine = listings.filter((l) => l.building_id === b.id && l.deal_type === dealType && l.asking_price_krw)
    const cheapest = (arr) => [...arr].sort((x, y) => x.asking_price_krw - y.asking_price_krw)[0] || null

    if (dealType === '매매') {
      // ① 실가 기준 → ② 실가와 같은 면적 매물의 최저 호가 → ③ 면적 = 실거래 면적
      const same = t ? mine.filter((l) => sameArea(l.area_m2, t.area_m2)) : []
      const top = cheapest(same)
      // 지금 매물이 없으면: 같은 면적의 '가장 최근 호가' 기록을 대신 보여줌 (새 매물이 올라오면 그 호가로 바뀜)
      let recent = null
      if (!top) {
        const hist = recentAsks.filter((h) => h.building_id === b.id && h.deal_type === '매매')
          .sort((x, y) => new Date(y.recorded_at) - new Date(x.recorded_at))
        recent = (t ? hist.find((h) => sameArea(h.area_m2, t.area_m2)) : hist[0]) || null
      }
      return {
        ...b, type_count: mine.length, same_count: same.length,
        trade_price: t?.price_krw ?? null, trade_date: t?.deal_date ?? null,
        top_price: top?.asking_price_krw ?? recent?.asking_price_krw ?? null,
        ask_is_recent: !top && !!recent,
        show_area: t?.area_m2 ?? recent?.area_m2 ?? null,
      }
    }
    if (dealType === '경매') {
      // 1차 경매가 → 현재 경매가(가장 낮은 물건) → 면적
      const auctions = listings.filter((l) => l.building_id === b.id && l.deal_type === '경매' && l.auction_current_price_krw)
      const top = [...auctions].sort((x, y) => x.auction_current_price_krw - y.auction_current_price_krw)[0] || null
      return {
        ...b, type_count: auctions.length, same_count: auctions.length,
        top_price: top?.auction_current_price_krw ?? null,
        first_price: top?.auction_first_price_krw ?? null,
        auction_round: top?.auction_round ?? null,
        show_area: top?.area_m2 ?? null,
      }
    }
    // 분양: 가장 낮은 분양가 물건 기준
    const top = cheapest(mine)
    return {
      ...b, type_count: mine.length, same_count: mine.length,
      top_price: top?.asking_price_krw ?? null,
      trade_price: t && top && sameArea(t.area_m2, top.area_m2) ? t.price_krw : null,
      trade_date: t?.deal_date ?? null,
      show_area: top?.area_m2 ?? null,
    }
  }), [buildings, listings, trades, recentAsks, dealType])

  const visible = useMemo(
    () => withCounts.filter((b) =>
      // 경매·분양은 해당 물건이 있는 건물만 지도에 표시
      (dealType === '매매' || b.type_count > 0) &&
      (!onlyListings || b.type_count > 0) &&
      (!query || b.name.includes(query) || b.address.includes(query))),
    [withCounts, dealType, onlyListings, query]
  )

  function pick(b) { setSelected(b); setListOpen(false) }
  function onMenu(m) {
    setMenu(m)
    if (m === '지산') { setSelected(null); setListOpen((o) => !o) }
    if (m === '매물') { setOnlyListings(true); setListOpen(true); setSelected(null) }
    if (m === '입주' && !selected) setListOpen(true)
  }

  if (route.startsWith('#/biz')) {
    if (!session) return (
      <div className="admin-guard">
        <h2>사업자 로그인이 필요해요</h2>
        <button className="btn primary" onClick={() => setAuthOpen(true)}>사업자 로그인</button>
        <a href="#/" className="muted">지도로 돌아가기</a>
        {authOpen && <AuthModal initialMode="login" initialKind="business" onClose={() => setAuthOpen(false)} />}
      </div>
    )
    return <BizCenter session={session} />
  }

  if (route.startsWith('#/admin')) {
    if (!session) return (
      <div className="admin-guard">
        <h2>관리자 로그인이 필요해요</h2>
        <button className="btn primary" onClick={() => setAuthOpen(true)}>로그인</button>
        {authOpen && <AuthModal initialMode="login" onClose={() => setAuthOpen(false)} />}
      </div>
    )
    return <AdminPage profile={profile} />
  }

  return (
    <div className="app">
      <MapView
        center={DISTRICTS['성수']}
        buildings={visible}
        dealType={dealType}
        selected={selected}
        vendors={selected ? vendors : []}
        onSelect={pick}
      />

      <SideRail menu={menu} onMenu={onMenu} />

      <Header
        dealType={dealType}
        onDealType={(t) => { setDealType(t); setSelected(null) }}
        query={query}
        onQuery={setQuery}
        onSearch={() => visible[0] && pick(visible[0])}
        onlyListings={onlyListings}
        onOnlyListings={setOnlyListings}
        shifted={!!selected || listOpen}
      />

      <div className="account">
        {session ? (
          <>
            {profile?.role === 'admin' && <a className="btn dark" href="#/admin">⚙️ 관리자</a>}
            {(hasBiz || ['agent', 'vendor'].includes(profile?.role)) && <a className="btn white" href="#/biz">🏢 사업자센터</a>}
            <button className="btn white" onClick={() => supabase.auth.signOut()} title={session.user.email}>로그아웃</button>
          </>
        ) : (
          <button className="btn primary" onClick={() => { setAuthKind('person'); setAuthOpen(true) }}>로그인</button>
        )}
      </div>

      {selected ? (
        <BuildingPanel
          building={selected}
          dealType={dealType}
          session={session}
          onClose={() => setSelected(null)}
          onLogin={() => setAuthOpen(true)}
          onVendors={setVendors}
          initialTab={menu === '입주' ? '주변 업체' : dealType === '매매' ? '정보' : '매물·분양'}
        />
      ) : listOpen ? (
        <BuildingList
          hint={menu === '입주' ? '건물을 고르면 반경 3km 입주 서비스 업체를 볼 수 있어요' : ''}
          dealType={dealType}
          buildings={visible}
          error={error}
          onSelect={pick}
          onClose={() => setListOpen(false)}
        />
      ) : null}

      {!selected && !listOpen && (
        <button className="list-fab" onClick={() => setListOpen(true)}>☰ {dealType} 목록 {visible.length}</button>
      )}

      <div className="legend">
        <span><i className={`dot ${dealType === '분양' ? 'sale' : dealType === '경매' ? 'auction' : 'buy'}`} />{dealType === '매매' ? '실가: 최근 실거래 · 호가: 같은 면적 매물 최저가 · 면적: 실거래 면적' : dealType === '분양' ? '분양가: 최저가 분양 물건 · 면적: 해당 물건 면적' : '1차 경매가 · 현재 경매가(가장 낮은 물건) · 면적'}</span>
      </div>

      {authOpen && <AuthModal key={authKind} initialKind={authKind} initialMode="login" onClose={() => setAuthOpen(false)} />}
      {recovery && <NewPasswordModal onClose={() => setRecovery(false)} />}
    </div>
  )
}
