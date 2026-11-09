import { useEffect, useState } from 'react'
import Transactions from './Transactions'
import Listings from './Listings'
import NearbyVendors from './NearbyVendors'
import BuildingInfo from './BuildingInfo'
import Calculator from './Calculator'
import { wonShort, m2 } from '../lib/format'
import { supabase } from '../lib/supabase'

const TABS = ['정보', '실거래가', '매물·분양', '계산기', '주변 업체']

export default function BuildingPanel({ building: b, dealType, session, onClose, onLogin, onVendors, initialTab = '정보' }) {
  const [tab, setTab] = useState(initialTab)
  useEffect(() => setTab(initialTab), [b.id, initialTab])
  // 건축물대장 상세 + 시세 요약 (건물을 고를 때마다 새로)
  const [d, setD] = useState(null)
  const [ins, setIns] = useState(null)
  useEffect(() => {
    setD(null); setIns(null)
    supabase.from('buildings').select('completed_year, use_apr_day, floors_above, floors_below, gross_area_m2, plat_area_m2, bc_rat, vl_rat, structure, elevators, units, parking_spaces, main_use, etc_purps, transit, station_name, station_lines, station_m, ceiling_height_m, drive_in, freight_elevators, floor_load_t, mgmt_fee_per_py, rent_per_py, deposit_per_py, allowed_industries, site_note, site_checked_at')
      .eq('id', b.id).maybeSingle().then(({ data }) => setD(data))
    supabase.rpc('building_insight', { p_id: b.id }).then(({ data }) => setIns(data))
  }, [b.id])

  return (
    <aside className="sheet">
      <div className="sheet-head">
        <div>
          <span className="district">{b.district} · 지식산업센터</span>
          <h2>{b.name}</h2>
          <p className="card-meta">{b.address}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>

      <div className="summary">
        {dealType === '경매' ? (
          <>
            <div><span>1차 경매가</span><strong>{wonShort(b.first_price)}</strong></div>
            <div><span>현재 경매가{b.auction_round ? ` (${b.auction_round}차)` : ''}</span><strong className="down">{wonShort(b.top_price)}</strong></div>
          </>
        ) : dealType === '분양' ? (
          <>
            <div><span>최저 분양가</span><strong>{b.top_price ? wonShort(b.top_price) : '-'}</strong></div>
            <div><span>분양 물건</span><strong>{b.type_count}건</strong></div>
          </>
        ) : (
          <>
            <div><span>최저 호가</span><strong>{b.top_price ? wonShort(b.top_price) : '-'}</strong></div>
            <div><span>실가 (최근 거래)</span><strong>{b.trade_price ? wonShort(b.trade_price) : '-'}</strong></div>
          </>
        )}
        <div><span>면적</span><strong>{b.show_area ? m2(b.show_area) : '-'}</strong></div>
      </div>

      <div className="subtabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'subtab active' : 'subtab'} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="tab-body">
        {tab === '정보' && <BuildingInfo b={b} d={d} ins={ins} onTab={setTab} />}
        {tab === '계산기' && <Calculator ins={ins} b={{ ...b, ...(d || {}) }} />}
        {tab === '실거래가' && <Transactions buildingId={b.id} session={session} onLogin={onLogin} />}
        {tab === '매물·분양' && <Listings buildingId={b.id} dealType={dealType} session={session} onLogin={onLogin} />}
        <div hidden={tab !== '주변 업체'}>
          <NearbyVendors buildingId={b.id} session={session} onLogin={onLogin} onVendors={onVendors} />
        </div>
      </div>
    </aside>
  )
}

