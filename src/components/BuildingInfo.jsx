import { useState } from 'react'
import { won, perPy, pyeong } from '../lib/format'

// 건물 '정보' 탭 — 지식산업센터 맞춤 정보
// 1 시세 카드 · 2 동네 비교 · 3 환금성·건물 성적표 · 4 면적별·층별 평당가 · 5 주변 공급 · 6 현장 정보 · 7 건물 개요
export default function BuildingInfo({ b, d, ins, onTab }) {
  const x = { ...b, ...(d || {}) }
  if (!ins) return <p className="muted">불러오는 중…</p>
  return (
    <div className="binfo">
      <PriceCards b={b} ins={ins} onTab={onTab} />
      <Nearby ins={ins} />
      <ScoreCard x={x} ins={ins} />
      <Breakdown ins={ins} />
      <Supply ins={ins} />
      <SiteInfo x={x} />
      <Overview x={x} />
      <p className="muted small">출처: 국토교통부 실거래가·건축물대장, 한국산업단지공단 지식산업센터 현황. 평당가는 전용면적 기준, 역 거리는 직선거리예요.</p>
    </div>
  )
}

// 1. 시세 카드: 최근 실거래 / 최저 호가 + 역대 최고 평당가 대비
function PriceCards({ b, ins, onTab }) {
  const last = ins.last
  const vsMax = last?.py && ins.max_py?.py ? ((last.py - ins.max_py.py) / ins.max_py.py) * 100 : null
  return (
    <section>
      <div className="pcards">
        <div className="pcard main">
          <span>최근 실거래가</span>
          <strong>{last ? won(last.price) : '-'}</strong>
          {last && <small>{last.date} · {pyeong(last.area)}{last.floor ? ` · ${last.floor}층` : ''}</small>}
          {last?.py && <small>평당 <b>{perPy(last.py)}</b></small>}
          {vsMax != null && (vsMax >= -0.5
            ? <i className="tag hot">역대 최고 평당가</i>
            : <i className="tag">역대 최고 평당가보다 {Math.abs(vsMax).toFixed(0)}% 낮음</i>)}
        </div>
        <div className="pcard">
          <span>매물 최저가</span>
          <strong>{b.top_price ? won(b.top_price) : '-'}</strong>
          <small>{b.top_price ? (b.ask_is_recent ? '최근 호가 기준' : '현재 매물 기준') : '지금 올라온 매물이 없어요'}</small>
          <button className="linkish" onClick={() => onTab('매물·분양')}>매물 보기 ›</button>
        </div>
      </div>
      {ins.py_2y && <p className="small center">최근 2년 평균 평당가 <b>{perPy(ins.py_2y)}</b> <span className="muted">({ins.n_2y}건)</span></p>}
    </section>
  )
}

// 2. 동네 비교 (반경 2km)
function Nearby({ ins }) {
  const [open, setOpen] = useState(false)
  const n = ins.nearby || {}
  if (!n.with_price || !n.me_py) return null
  const diff = n.avg_py ? ((n.me_py - n.avg_py) / n.avg_py) * 100 : null
  return (
    <section className="box">
      <h4>📍 반경 2km 지산과 비교</h4>
      <p className="big-line">
        평당가 기준 <b>{n.with_price}곳 중 {n.rank}번째로 저렴</b>해요
      </p>
      {diff != null && (
        <p className="small">동네 평균 {perPy(n.avg_py)}보다 <b className={diff <= 0 ? 'down' : 'up'}>{Math.abs(diff).toFixed(0)}% {diff <= 0 ? '저렴' : '비쌈'}</b> <span className="muted">(최근 2년, 지산 호실 거래 기준)</span></p>
      )}
      <button className="linkish" onClick={() => setOpen(!open)}>{open ? '접기' : '가까운 지산 평당가 보기 ›'}</button>
      {open && (
        <ul className="rank-list">
          {(n.list || []).map((r) => (
            <li key={r.id} className={r.d === 0 ? 'me' : ''}>
              <span>{r.name}{r.d === 0 ? ' (이 건물)' : ''}</span>
              <em>{r.d ? `${r.d < 1000 ? r.d + 'm' : (r.d / 1000).toFixed(1) + 'km'}` : ''}</em>
              <b>{perPy(r.py)}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// 3. 환금성 + 건물 성적표 (별점)
// 배터리처럼 5칸: 점수가 높을수록 많이 차고 색도 초록에 가까워짐
const LEVEL_COLOR = ['', '#f03e3e', '#fd7e14', '#fab005', '#82c91e', '#2f9e44']
function Battery({ n }) {
  return (
    <span className="battery" role="img" aria-label={n ? `5점 중 ${n}점` : '정보 없음'}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} style={i <= n ? { background: LEVEL_COLOR[n] } : undefined} />)}
      <b className="cap" />
    </span>
  )
}
function grade(v, cuts, higherBetter = true) { // cuts: 5점,4점,3점,2점 기준
  if (v == null || Number.isNaN(v)) return null
  for (let i = 0; i < cuts.length; i++) if (higherBetter ? v >= cuts[i] : v <= cuts[i]) return 5 - i
  return 1
}
function ScoreCard({ x, ins }) {
  const t = ins.turnover || {}
  const rate = t.units ? (t.n_1y / t.units) * 100 : null
  const liq = rate != null ? grade(rate, [8, 5, 3, 1.5]) : null
  const ppu = x.units && x.parking_spaces ? x.parking_spaces / x.units : null
  const avgPpu = ins.nearby?.avg_parking_per_unit
  const upe = x.units && x.elevators ? x.units / x.elevators : null
  const year = x.completed_year || (x.use_apr_day ? Number(x.use_apr_day.slice(0, 4)) : null)
  const age = year ? new Date().getFullYear() - year : null
  const rows = [
    { k: '환금성', s: liq, v: rate != null ? `최근 1년 ${t.n_1y}건 거래 · 전체 ${t.units}호실의 ${rate.toFixed(1)}%` : `최근 1년 ${t.n_1y ?? 0}건 거래`,
      tip: liq >= 4 ? '사고팔기 활발해요' : liq === 3 ? '보통이에요' : liq ? '거래가 뜸한 편이에요' : '' },
    { k: '주차', s: ppu && avgPpu ? grade(ppu / avgPpu, [1.3, 1.1, 0.9, 0.7]) : null,
      v: ppu ? `호실당 ${ppu.toFixed(2)}대${avgPpu ? ` (동네 평균 ${avgPpu}대)` : ''}` : null },
    { k: '엘리베이터', s: grade(upe, [15, 25, 40, 60], false), v: upe ? `${x.elevators}대 · 1대당 ${Math.round(upe)}호실` : null },
    { k: '역세권', s: grade(x.station_m, [300, 500, 800, 1200], false), v: x.station_m ? `${x.station_name}역 ${x.station_m < 1000 ? x.station_m + 'm' : (x.station_m / 1000).toFixed(1) + 'km'}` : null },
    { k: '연식', s: grade(age, [5, 10, 15, 20], false), v: age != null ? `${year}년 준공 (${age}년차)` : null },
  ].filter((r) => r.v)
  if (!rows.length) return null
  return (
    <section className="box">
      <h4>📋 건물 성적표</h4>
      <dl className="score">
        {rows.map((r) => (
          <div key={r.k}>
            <dt>{r.k}</dt>
            <dd>{r.s ? <Battery n={r.s} /> : <span className="muted small">－</span>}<small>{r.v}{r.tip ? ` · ${r.tip}` : ''}</small></dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// 4. 면적별·층별 평당가 (최근 3년)
const AREA = { 1: '20평 미만', 2: '20~40평', 3: '40평 이상' }
const FLOOR = { 1: '저층 (1~3층)', 2: '중층 (4~9층)', 3: '고층 (10층~)' }
function Breakdown({ ins }) {
  const kinds = ins.by_kind || []
  const shop = kinds.find((k) => k.k === 'nrg')
  if (!ins.by_area?.length && !ins.by_floor?.length) return null
  return (
    <section className="box">
      <h4>📐 면적별 · 층별 평당가 <small className="muted">최근 3년</small></h4>
      <div className="two-col">
        <table className="mini">
          <tbody>{(ins.by_area || []).map((r) => <tr key={r.k}><th>{AREA[r.k]}</th><td>{perPy(r.py)}</td><td className="muted">{r.n}건</td></tr>)}</tbody>
        </table>
        <table className="mini">
          <tbody>{(ins.by_floor || []).map((r) => <tr key={r.k}><th>{FLOOR[r.k]}</th><td>{perPy(r.py)}</td><td className="muted">{r.n}건</td></tr>)}</tbody>
        </table>
      </div>
      {shop && <p className="small muted">※ 위 평당가는 지산 호실(공장) 거래 기준이에요. 같은 건물 <b>상가·업무 호실</b>은 평당 {perPy(shop.py)} ({shop.n}건)로 따로 계산했어요.</p>}
    </section>
  )
}

// 5. 주변 공급 예정
function Supply({ ins }) {
  const [open, setOpen] = useState(false)
  const s = ins.supply || { count: 0 }
  return (
    <section className="box">
      <h4>🏗 반경 2km 공급 예정</h4>
      <p className="big-line">
        {s.count ? <>건축중·착공 전 지산 <b>{s.count}곳</b></> : '새로 지어지는 지산이 없어요'}
        {ins.new_nearby ? <span className="small muted"> · 최근 2년 준공 {ins.new_nearby}곳</span> : null}
      </p>
      <p className="small muted">{s.count >= 5 ? '공급이 많은 편이라 임대·매매 경쟁이 생길 수 있어요.' : s.count ? '공급 부담은 크지 않은 편이에요.' : ''}</p>
      {s.count > 0 && <button className="linkish" onClick={() => setOpen(!open)}>{open ? '접기' : '목록 보기 ›'}</button>}
      {open && (
        <ul className="rank-list">
          {s.list.map((r, i) => <li key={i}><span>{r.name}</span><em>{r.status}</em><b>{r.d < 1000 ? r.d + 'm' : (r.d / 1000).toFixed(1) + 'km'}</b></li>)}
        </ul>
      )}
    </section>
  )
}

// 6. 현장 정보 (관리자가 직접 확인해서 입력)
function SiteInfo({ x }) {
  const items = [
    ['층고', x.ceiling_height_m && `${x.ceiling_height_m}m`],
    ['드라이브인', x.drive_in],
    ['화물 엘리베이터', x.freight_elevators != null && `${x.freight_elevators}대`],
    ['바닥하중', x.floor_load_t && `${x.floor_load_t}톤/㎡`],
    ['관리비', x.mgmt_fee_per_py && `평당 ${x.mgmt_fee_per_py.toLocaleString()}원/월`],
    ['임대 시세', x.rent_per_py && `평당 월 ${x.rent_per_py.toLocaleString()}원${x.deposit_per_py ? ` · 보증금 평당 ${Math.round(x.deposit_per_py / 1e4).toLocaleString()}만` : ''}`],
    ['입주 업종', x.allowed_industries],
  ].filter(([, v]) => v)
  return (
    <section className="box">
      <h4>🔎 현장 확인 정보 {x.site_checked_at && <small className="muted">{x.site_checked_at} 확인</small>}</h4>
      {items.length ? (
        <dl className="facts">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      ) : <p className="small muted">지산맵이 직접 방문해서 층고·드라이브인·관리비 등을 확인할 예정이에요.</p>}
      {x.site_note && <p className="small">{x.site_note}</p>}
    </section>
  )
}

// 7. 건물 개요 (건축물대장)
function Overview({ x }) {
  const row = (k, v) => (v ? <div key={k}><dt>{k}</dt><dd>{v}</dd></div> : null)
  const n0 = (v) => Number(v).toLocaleString()
  return (
    <section className="box">
      <h4>🏢 건물 개요</h4>
      <dl className="facts">
        {row('교통', x.transit)}
        {row('준공', x.use_apr_day ? `${x.use_apr_day.replaceAll('-', '.')} (사용승인)` : x.completed_year && `${x.completed_year}년`)}
        {row('규모', x.floors_above && `지하 ${x.floors_below ?? 0}층 / 지상 ${x.floors_above}층`)}
        {row('연면적', x.gross_area_m2 && `${n0(Math.round(x.gross_area_m2))}㎡ (${pyeong(x.gross_area_m2)})`)}
        {row('대지면적', x.plat_area_m2 && `${n0(Math.round(x.plat_area_m2))}㎡ (${pyeong(x.plat_area_m2)})`)}
        {row('건폐율·용적률', (x.bc_rat || x.vl_rat) && `${x.bc_rat ? Number(x.bc_rat).toFixed(1) + '%' : '-'} · ${x.vl_rat ? Number(x.vl_rat).toFixed(1) + '%' : '-'}`)}
        {row('호실 수', x.units && `${n0(x.units)}호`)}
        {row('주차', x.parking_spaces && `${n0(x.parking_spaces)}대`)}
        {row('승강기', x.elevators && `${x.elevators}대`)}
        {row('구조', x.structure)}
        {row('용도', [x.main_use, x.etc_purps].filter(Boolean).join(' · '))}
      </dl>
    </section>
  )
}
