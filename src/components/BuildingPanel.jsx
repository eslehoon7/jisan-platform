import { useEffect, useState } from 'react'
import Transactions from './Transactions'
import Listings from './Listings'
import NearbyVendors from './NearbyVendors'
import { wonShort, m2 } from '../lib/format'

const TABS = ['기본정보', '실거래가', '매물·분양', '주변 업체']

export default function BuildingPanel({ building: b, dealType, session, onClose, onLogin, onVendors, initialTab = '기본정보' }) {
  const [tab, setTab] = useState(initialTab)
  useEffect(() => setTab(initialTab), [b.id, initialTab])

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
        {tab === '기본정보' && (
          <dl className="facts">
            <div><dt>준공</dt><dd>{b.completed_year ? `${b.completed_year}년` : '-'}</dd></div>
            <div><dt>규모</dt><dd>{b.floors_above ? `지하 ${b.floors_below ?? 0}층 / 지상 ${b.floors_above}층` : '-'}</dd></div>
            <div><dt>주차</dt><dd>{b.parking_spaces ? `${b.parking_spaces}대` : '-'}</dd></div>
            <div><dt>교통</dt><dd>{b.transit || '-'}</dd></div>
          </dl>
        )}
        {tab === '실거래가' && <Transactions buildingId={b.id} session={session} onLogin={onLogin} />}
        {tab === '매물·분양' && <Listings buildingId={b.id} dealType={dealType} session={session} onLogin={onLogin} />}
        <div hidden={tab !== '주변 업체'}>
          <NearbyVendors buildingId={b.id} session={session} onLogin={onLogin} onVendors={onVendors} />
        </div>
      </div>
    </aside>
  )
}
