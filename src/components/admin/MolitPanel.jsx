import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CONFIG } from '../../config'
import { wonShort } from '../../lib/format'
import { lookupBld, bldKey, geocode } from '../../lib/bldInfo'

// 국토부 실거래 자동수집 현황 + 건물 후보
// - 매일 새벽 3시 10분 자동 수집 (최근 2개월 다시 확인 → 늦은 신고·계약해제 반영)
// - [지금 수집]: 관리자가 바로 실행
export const SGG_DISTRICT = { '11200': '성수', '11560': '영등포', '11710': '송파' }
export const SGG_NAME = { '11200': '성동구', '11560': '영등포구', '11710': '송파구' }

export default function MolitPanel({ onRegister }) {
  const [stats, setStats] = useState(null)
  const [runs, setRuns] = useState([])
  const [cands, setCands] = useState([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [minCount, setMinCount] = useState(3)
  const [candErr, setCandErr] = useState('')
  const [showAll, setShowAll] = useState(false) // 상가·호텔 등 지산 아닌 건물도 보기
  const [info, setInfo] = useState({}) // 건축물대장 결과 (지번별)
  const [infoBusy, setInfoBusy] = useState(false)
  const [bulk, setBulk] = useState('') // 한꺼번에 등록 진행 문구

  async function load() {
    const c = (q) => q.then((r) => r.count ?? 0)
    const base = () => supabase.from('molit_trades').select('id', { count: 'exact', head: true })
    const [all, nrg, indu, linked, canceled] = await Promise.all([
      c(base()), c(base().eq('dataset', 'nrg')), c(base().eq('dataset', 'indu')),
      c(base().not('building_id', 'is', null)), c(base().eq('canceled', true)),
    ])
    setStats({ all, nrg, indu, linked, canceled })
    const { data: r } = await supabase.from('molit_sync_runs').select('*').order('id', { ascending: false }).limit(5)
    setRuns(r || [])
    setCandErr('')
    const { data: cd, error } = await supabase.rpc('admin_building_candidates_v2', { p_min: minCount, p_only_jisan: !showAll })
    if (error) { setCands([]); setCandErr('후보 목록을 불러오지 못했어요: ' + error.message) }
    else setCands(cd || [])
  }
  useEffect(() => { load() }, [minCount, showAll])

  // 후보가 바뀌면 아직 모르는 건물만 건축물대장에서 이름·층수 등 가져오기
  useEffect(() => {
    const todo = cands.filter((c) => !info[bldKey(c)])
    if (!todo.length) return
    let alive = true
    setInfoBusy(true)
    const put = (rs) => alive && setInfo((m) => ({ ...m, ...Object.fromEntries(rs.map((r) => [bldKey(r), r])) }))
    lookupBld(todo.map(({ sgg_cd, umd_nm, jibun }) => ({ sgg_cd, umd_nm, jibun })), put)
      .then(put)
      .catch((e) => alive && setCandErr('건축물대장 조회 실패: ' + e.message))
      .finally(() => alive && setInfoBusy(false))
    return () => { alive = false }
  }, [cands])

  const prefillOf = (c) => {
    const b = info[bldKey(c)] || {}
    const s = (v) => (v == null ? '' : String(v))
    return {
      name: b.name || '',
      district: SGG_DISTRICT[c.sgg_cd] || '성수',
      address: b.road_address || `서울 ${SGG_NAME[c.sgg_cd] || c.sgg_nm} ${c.umd_nm} ${c.jibun}`,
      sgg_cd: c.sgg_cd, umd_nm: c.umd_nm, jibun: c.jibun,
      completed_year: s(b.completed_year || c.build_year), floors_above: s(b.floors_above), floors_below: s(b.floors_below),
      gross_area_m2: s(b.gross_area_m2 && Math.round(b.gross_area_m2 * 100) / 100), parking_spaces: s(b.parking_spaces),
    }
  }

  // 지산 후보를 한꺼번에 등록 (건물명이 확인된 곳만)
  async function bulkRegister() {
    const targets = cands.filter((c) => c.is_jisan && info[bldKey(c)]?.ok && info[bldKey(c)]?.name)
    if (!targets.length) return setBulk('⚠ 등록할 건물이 없어요 (건물명을 아직 못 가져왔어요)')
    if (!window.confirm(`지산 ${targets.length}곳을 건물로 한꺼번에 등록할까요?\n등록하면 바로 지도에 나오고, 실거래가 자동으로 붙어요.`)) return
    let ok = 0, dup = 0, fail = []
    for (const [i, c] of targets.entries()) {
      setBulk(`등록 중… ${i + 1} / ${targets.length}`)
      const p = prefillOf(c)
      let pos = null
      try {
        pos = (await geocode(p.address)) || (await geocode(`서울 ${SGG_NAME[c.sgg_cd]} ${c.umd_nm} ${c.jibun}`))
      } catch (e) {
        setBulk('⚠ ' + e.message + ' — 새로고침(Ctrl+F5) 후 다시 눌러 주세요' + (ok ? ` (${ok}곳은 등록됨)` : ''))
        return load()
      }
      if (!pos) { fail.push(p.name); continue }
      const num = (v) => (v === '' ? null : Number(v))
      const { error } = await supabase.from('buildings').insert({
        name: p.name, district: p.district, address: pos.road || p.address,
        location: `SRID=4326;POINT(${pos.lng} ${pos.lat})`,
        completed_year: num(p.completed_year), floors_above: num(p.floors_above), floors_below: num(p.floors_below),
        gross_area_m2: num(p.gross_area_m2), parking_spaces: num(p.parking_spaces),
        sgg_cd: c.sgg_cd, umd_nm: c.umd_nm, jibun: c.jibun, is_published: true,
      })
      if (error?.code === '23505') dup++ // 이미 같은 지번 건물이 있음 → 건너뜀
      else if (error) fail.push(p.name); else ok++
    }
    setBulk(`✅ ${ok}곳 등록 완료` + (dup ? ` · 이미 있던 ${dup}곳은 건너뜀` : '') + (fail.length ? ` · ⚠ ${fail.length}곳 실패 (${fail.slice(0, 5).join(', ')}${fail.length > 5 ? ' 외' : ''}) — 하나씩 [건물로 등록]으로 해 주세요` : ''))
    load()
  }

  async function run(months) {
    setBusy(months > 2 ? 'back' : 'now'); setNote('')
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/molit-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY, Authorization: `Bearer ${s.session?.access_token}` },
        body: JSON.stringify({ months }),
      })
      const j = await res.json()
      if (!res.ok || j.error) throw new Error(j.error || `오류 ${res.status}`)
      const blocked = (j.errors || []).some((e) => e.startsWith('공장창고'))
      setNote(`✅ ${j.fetched.toLocaleString()}건 확인 · 새로 ${j.added.toLocaleString()}건 추가 · 건물 연결 ${j.matched}건` +
        (blocked ? ' (공장·창고 자료는 아직 활용신청 승인 전이라 건너뛰었어요)' : ''))
    } catch (e) {
      setNote('⚠ 수집 실패: ' + e.message)
    }
    setBusy(''); load()
  }

  const last = runs[0]
  return (
    <div className="molit">
      <div className="molit-head">
        <div>
          <h3>🤖 국토부 실거래 자동수집</h3>
          <p className="muted small">매일 <b>새벽 3시 10분</b>에 성동·영등포·송파구 거래를 자동으로 가져와요. 최근 2개월은 매번 다시 확인해서 늦은 신고·계약 해제도 반영돼요.</p>
        </div>
        <div className="molit-btns">
          <button className="btn primary sm" disabled={!!busy} onClick={() => run(2)}>{busy === 'now' ? '수집 중…' : '지금 수집'}</button>
          <button className="btn white sm" disabled={!!busy} onClick={() => run(24)} title="최근 24개월을 다시 가져와요 (1~2분)">{busy === 'back' ? '수집 중… (1~2분)' : '과거 2년 다시 수집'}</button>
        </div>
      </div>
      {note && <p className={note.startsWith('⚠') ? 'molit-note err' : 'molit-note'}>{note}</p>}

      {stats && (
        <div className="molit-stats">
          <div><b>{stats.all.toLocaleString()}</b><span>모은 거래</span></div>
          <div><b>{stats.nrg.toLocaleString()}</b><span>상업·업무용</span></div>
          <div><b>{stats.indu.toLocaleString()}</b><span>공장·창고 (지산 호실)</span></div>
          <div><b>{stats.linked.toLocaleString()}</b><span>우리 건물과 연결</span></div>
          <div><b>{stats.canceled.toLocaleString()}</b><span>계약 해제 (제외)</span></div>
        </div>
      )}
      {stats && stats.indu === 0 && (
        <p className="molit-warn">⚠ <b>지식산업센터 호실 거래는 대부분 '공장·창고 등' 자료</b>에 들어 있어요. 공공데이터포털에서 <b>국토교통부_공장 및 창고 등 부동산 매매 실거래가 자료</b>도 활용신청해 주세요. 승인되면 다음 수집부터 자동으로 함께 들어와요.</p>
      )}

      <div className="af-section">최근 수집 기록</div>
      <table className="atable static">
        <thead><tr><th>시작</th><th>방식</th><th>기간</th><th>확인</th><th>새로 추가</th><th>건물 연결</th><th>상태</th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{fmtTime(r.started_at)}</td>
              <td>{r.trigger === 'cron' ? '자동' : '직접'}</td>
              <td>{r.months}</td>
              <td>{(r.fetched ?? 0).toLocaleString()}</td>
              <td>{(r.inserted ?? 0).toLocaleString()}</td>
              <td>{r.matched ?? 0}</td>
              <td title={r.error || ''}>{r.status === 'running' ? '⏳ 진행 중' : r.status === 'ok' ? (r.error ? '✅ (일부 건너뜀)' : '✅ 완료') : '❌ 실패'}</td>
            </tr>
          ))}
          {!runs.length && <tr><td colSpan="7" className="empty-cell">아직 수집 기록이 없어요</td></tr>}
        </tbody>
      </table>
      {last?.error && <p className="muted small">마지막 기록 참고: {last.error.slice(0, 160)}</p>}

      <div className="af-section">
        🏢 건물 후보 — 거래는 있는데 아직 지도에 없는 건물
        <select className="molit-min" value={minCount} onChange={(e) => setMinCount(Number(e.target.value))}>
          <option value={1}>1건 이상</option><option value={3}>3건 이상</option><option value={5}>5건 이상</option><option value={10}>10건 이상</option>
        </select>
        <label className="molit-all"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 상가·호텔 등 지산 아닌 건물도 보기</label>
      </div>
      <p className="muted small"><b>🏭 지산 추정</b> = '공장' 호실 거래가 있는 건물이에요. [건물로 등록]을 누르면 주소·지번이 채워진 등록 화면이 열려요. 등록하면 그 건물의 과거 거래가 <b>자동으로 실거래 탭과 말풍선 '실가'</b>에 붙어요.</p>
      {!!cands.length && (
        <p className="small"><b>🏭 지산 추정 {cands.filter((c) => c.is_jisan).length}곳</b>
          {showAll && <> · 상가·기타 {cands.filter((c) => !c.is_jisan).length}곳 (지산 목록 아래에 이어서 나와요)</>}</p>
      )}
      {candErr && <p className="molit-note err">⚠ {candErr}</p>}
      <div className="molit-bulk">
        <span className="muted small">{infoBusy ? '⏳ 건축물대장에서 건물명·층수·주차를 불러오는 중…' : '건물명·준공·층수·주차는 국토부 건축물대장에서 자동으로 가져와요.'}</span>
        <button className="btn primary sm" disabled={infoBusy || bulk.startsWith('등록 중')} onClick={bulkRegister}>
          🏭 지산 {cands.filter((c) => c.is_jisan && info[bldKey(c)]?.name).length}곳 한꺼번에 등록
        </button>
      </div>
      {cands.some((c) => c.is_jisan && info[bldKey(c)]?.ok && !info[bldKey(c)]?.name) && (
        <p className="muted small">📝 <b>현장 확인 필요</b> {cands.filter((c) => c.is_jisan && info[bldKey(c)]?.ok && !info[bldKey(c)]?.name).length}곳은 건축물대장에 건물명이 없어서 한꺼번에 등록에서 빠져요. 현장에서 이름을 확인한 뒤 그 줄의 <b>[건물로 등록]</b>으로 직접 넣어 주세요 (주소·층수·주차는 미리 채워져요).</p>
      )}
      {bulk && <p className={bulk.startsWith('⚠') ? 'molit-note err' : 'molit-note'}>{bulk}</p>}
      <table className="atable static cand">
        <thead><tr><th>위치 (지번)</th><th>건물명 (건축물대장)</th><th>거래</th><th>준공</th><th>용도</th><th>면적</th><th>평당 평균</th><th>최근</th><th></th></tr></thead>
        <tbody>
          {cands.map((c) => (
            <tr key={`${c.sgg_cd}-${c.umd_nm}-${c.jibun}`}>
              <td className="nowrap">
                {c.is_jisan ? <span className="jisan-tag">🏭 지산 추정</span> : <span className="jisan-tag other">상가·기타</span>}
                <b>{SGG_NAME[c.sgg_cd] || c.sgg_nm} {c.umd_nm} {c.jibun}</b>
              </td>
              <td><BldName b={info[bldKey(c)]} /></td>
              <td>{c.trade_count}건{c.is_jisan && <div className="sub">공장 {c.factory_count}</div>}</td>
              <td>{c.build_year || '-'}</td>
              <td className="sub">{c.uses}</td>
              <td>{Math.round(c.min_area)}~{Math.round(c.max_area)}㎡</td>
              <td>{c.avg_price_per_m2 ? wonShort(c.avg_price_per_m2 * 3.3058) : '-'}</td>
              <td className="nowrap">{c.last_deal}</td>
              <td><button className="btn dark sm" onClick={() => onRegister?.(prefillOf(c))}>건물로 등록</button></td>
            </tr>
          ))}
          {!cands.length && <tr><td colSpan="9" className="empty-cell">{showAll ? '조건에 맞는 후보가 없어요' : '지산 후보가 없어요 — 아래 체크박스로 다른 건물도 볼 수 있어요'}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function BldName({ b }) {
  if (!b) return <span className="muted small">…</span>
  if (!b.ok) return <span className="muted small" title={b.error || ''}>대장 없음{b.error && !/없어요/.test(b.error) ? ` (${b.error.slice(0, 40)})` : ''}</span>
  return (
    <>
      {b.name ? <b>{b.name}</b> : <span className="jisan-tag field" title="건축물대장에 건물명이 없어요. 현장에서 확인한 뒤 [건물로 등록]으로 직접 넣어 주세요">📝 현장 확인 필요</span>}
      {b.is_jisan && <span className="jisan-tag ok">지산 확인</span>}
      <div className="sub">{[b.floors_above && `지상 ${b.floors_above}층`, b.parking_spaces && `주차 ${b.parking_spaces}대`].filter(Boolean).join(' · ')}</div>
    </>
  )
}

function fmtTime(t) {
  if (!t) return '-'
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
