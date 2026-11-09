import { useEffect, useState } from 'react'
import Transactions from './Transactions'
import Listings from './Listings'
import NearbyVendors from './NearbyVendors'
import { wonShort, m2, perPy, pyeong } from '../lib/format'
import { supabase } from '../lib/supabase'

const TABS = ['기본정보', '실거래가', '매물·분양', '주변 업체']

export default function BuildingPanel({ building: b, dealType, session, onClose, onLogin, onVendors, initialTab = '기본정보' }) {
  const [tab, setTab] = useState(initialTab)
  useEffect(() => setTab(initialTab), [b.id, initialTab])
  // 건축물대장 상세 + 시세 요약 (건물을 고를 때마다 새로)
  const [d, setD] = useState(null)
  const [st, setSt] = useState(null)
  useEffect(() => {
    setD(null); setSt(null)
    supabase.from('buildings').select('completed_year, use_apr_day, floors_above, floors_below, gross_area_m2, plat_area_m2, bc_rat, vl_rat, structure, elevators, units, parking_spaces, main_use, etc_purps, transit, station_name, station_lines, station_m')
      .eq('id', b.id).maybeSingle().then(({ data }) => setD(data))
    supabase.rpc('building_stats', { p_id: b.id }).then(({ data }) => setSt(data))
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
        {tab === '기본정보' && <BasicInfo b={b} d={d} st={st} />}
        {tab === '실거래가' && <Transactions buildingId={b.id} session={session} onLogin={onLogin} />}
        {tab === '매물·분양' && <Listings buildingId={b.id} dealType={dealType} session={session} onLogin={onLogin} />}
        <div hidden={tab !== '주변 업체'}>
          <NearbyVendors buildingId={b.id} session={session} onLogin={onLogin} onVendors={onVendors} />
        </div>
      </div>
    </aside>
  )
}

// 기본정보: 시세 요약 + 건물 개요 (국토부 실거래·건축물대장 기준)
function BasicInfo({ b, d, st }) {
  const x = { ...b, ...(d || {}) }
  const diff = st?.py_1y && st?.py_prev_1y ? ((st.py_1y - st.py_prev_1y) / st.py_prev_1y) * 100 : null
  const years = (st?.by_year || []).slice(-6)
  const maxPy = Math.max(1, ...years.map((y) => y.py || 0))
  const row = (k, v) => v ? <div><dt>{k}</dt><dd>{v}</dd></div> : null
  const n0 = (v) => (v == null ? null : Number(v).toLocaleString())
  return (
    <>
      {st?.total > 0 && (
        <div className="price-box">
          <div className="pb-main">
            <span>최근 1년 평균 평당가</span>
            <strong>{st.py_1y ? perPy(st.py_1y) : '-'}</strong>
            <small>{st.cnt_1y ? `${st.cnt_1y}건 기준` : '최근 1년 거래 없음'}
              {diff != null && <b className={diff >= 0 ? 'up' : 'down'}> · 전년 대비 {diff >= 0 ? '▲' : '▼'}{Math.abs(diff).toFixed(1)}%</b>}</small>
          </div>
          {years.length > 1 && (
            <div className="pb-bars" aria-label="연도별 평균 평당가">
              {years.map((y) => (
                <div key={y.y} title={`${y.y}년 ${perPy(y.py)} (${y.n}건)`}>
                  <i style={{ height: `${Math.max(8, (y.py / maxPy) * 100)}%` }} />
                  <span>{String(y.y).slice(2)}년</span>
                </div>
              ))}
            </div>
          )}
          <p className="muted small">전체 실거래 {st.total}건 · 마지막 거래 {st.last_date} · 국토부 실거래가 기준</p>
        </div>
      )}
      <dl className="facts">
        {row('교통', x.transit)}
        {row('준공', x.use_apr_day ? `${x.use_apr_day.replaceAll('-', '.')} (사용승인)` : x.completed_year && `${x.completed_year}년`)}
        {row('규모', x.floors_above && `지하 ${x.floors_below ?? 0}층 / 지상 ${x.floors_above}층`)}
        {row('연면적', x.gross_area_m2 && `${n0(Math.round(x.gross_area_m2))}㎡ (${pyeong(x.gross_area_m2)})`)}
        {row('대지면적', x.plat_area_m2 && `${n0(Math.round(x.plat_area_m2))}㎡ (${pyeong(x.plat_area_m2)})`)}
        {row('건폐율·용적률', (x.bc_rat || x.vl_rat) && `${x.bc_rat ? Number(x.bc_rat).toFixed(1) + '%' : '-'} · ${x.vl_rat ? Number(x.vl_rat).toFixed(1) + '%' : '-'}`)}
        {row('호실 수', x.units && `${n0(x.units)}호`)}
        {row('주차', x.parking_spaces && `${n0(x.parking_spaces)}대${x.units ? ` (호실당 ${(x.parking_spaces / x.units).toFixed(2)}대)` : ''}`)}
        {row('승강기', x.elevators && `${x.elevators}대`)}
        {row('구조', x.structure)}
        {row('용도', [x.main_use, x.etc_purps].filter(Boolean).join(' · '))}
      </dl>
      <p className="muted small" style={{ marginTop: 12 }}>건물 정보: 국토교통부 건축물대장 · 역 거리는 직선거리 기준이에요.</p>
    </>
  )
}
