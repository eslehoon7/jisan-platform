import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { lookupBld, bldKey, geocode } from '../../lib/bldInfo'
import { useRegions, SIDO } from '../../lib/regions'

const LOOKUP_MAX = 150
// 공식 목록(한국산업단지공단 전국 지식산업센터 현황) 중 아직 지도에 없는 지산
// - 건축완료: 건축물대장에서 층수·주차 등을 가져와 바로 등록 가능
// - 건축중·미착공: 참고용 (나중에 분양 정보로 활용)
export default function KicoxPanel({ onRegister }) {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [info, setInfo] = useState({})
  const [busy, setBusy] = useState(false)
  const [showUnbuilt, setShowUnbuilt] = useState(false)
  const [bulk, setBulk] = useState('')
  const [sido, setSido] = useState('')
  const [sgg, setSgg] = useState('')
  const R = useRegions()
  const inArea = (r) => (!sgg || r.sgg_cd === sgg) && (!sido || R.by[r.sgg_cd]?.sido === sido)

  async function load() {
    setErr('')
    const { data, error } = await supabase.rpc('admin_kicox_missing')
    if (error) return setErr('공식 목록을 불러오지 못했어요: ' + error.message)
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  // 건축완료 건물만 건축물대장 조회
  useEffect(() => {
    const todo = rows.filter((r) => r.built && inArea(r)).slice(0, LOOKUP_MAX).filter((r) => !info[bldKey(r)])
    if (!todo.length) return
    let alive = true
    setBusy(true)
    const put = (rs) => alive && setInfo((m) => ({ ...m, ...Object.fromEntries(rs.map((x) => [bldKey(x), x])) }))
    lookupBld(todo.map(({ sgg_cd, umd_nm, jibun }) => ({ sgg_cd, umd_nm, jibun })), put)
      .then(put)
      .catch((e) => alive && setErr('건축물대장 조회 실패: ' + e.message))
      .finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [rows, sido, sgg])

  const nameOf = (r) => info[bldKey(r)]?.name || cleanName(r.name)
  const prefillOf = (r) => {
    const b = info[bldKey(r)] || {}
    const s = (v) => (v == null ? '' : String(v))
    return {
      name: nameOf(r),
      district: R.district(r.sgg_cd),
      address: b.road_address || r.road_address || R.addr(r.sgg_cd, r.umd_nm, r.jibun),
      sgg_cd: r.sgg_cd, umd_nm: r.umd_nm, jibun: r.jibun,
      completed_year: s(b.completed_year), floors_above: s(b.floors_above), floors_below: s(b.floors_below),
      gross_area_m2: s(b.gross_area_m2 && Math.round(b.gross_area_m2 * 100) / 100), parking_spaces: s(b.parking_spaces),
    }
  }

  const built = rows.filter((r) => r.built && inArea(r))
  const unbuilt = rows.filter((r) => !r.built && inArea(r))
  const ready = built.filter((r) => info[bldKey(r)]) // 대장 조회 끝난 곳

  async function bulkRegister() {
    // 같은 지번이 목록에 두 번 있으면 한 번만
    const seen = new Set()
    const targets = ready.filter((r) => { const k = bldKey(r); if (seen.has(k)) return false; seen.add(k); return true })
    if (!targets.length) return setBulk('⚠ 등록할 건물이 없어요')
    if (!window.confirm(`공식 목록의 지산 ${targets.length}곳을 건물로 한꺼번에 등록할까요?\n등록하면 바로 지도에 나오고, 실거래가 있으면 자동으로 붙어요.`)) return
    let ok = 0, dup = 0
    const fail = []
    for (const [i, r] of targets.entries()) {
      setBulk(`등록 중… ${i + 1} / ${targets.length}`)
      const p = prefillOf(r)
      let pos = r.lat ? { lat: r.lat, lng: r.lng, road: '' } : null
      if (!pos) try {
        pos = (await geocode(p.address)) || (await geocode(R.addr(r.sgg_cd, r.umd_nm, r.jibun)))
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
        sgg_cd: r.sgg_cd, umd_nm: r.umd_nm, jibun: r.jibun, is_published: true,
      })
      if (error?.code === '23505') dup++ // 이미 같은 지번 건물이 있음 → 건너뜀
      else if (error) fail.push(p.name); else ok++
    }
    setBulk(`✅ ${ok}곳 등록 완료` + (dup ? ` · 이미 있던 ${dup}곳은 건너뜀` : '') + (fail.length ? ` · ⚠ ${fail.length}곳 실패 (${fail.slice(0, 5).join(', ')}${fail.length > 5 ? ' 외' : ''}) — 하나씩 [건물로 등록]으로 해 주세요` : ''))
    load()
  }

  const list = showUnbuilt ? [...built, ...unbuilt] : built
  return (
    <div className="molit kicox">
      <div className="af-section big">📋 공식 목록 대조 — 한국산업단지공단 지식산업센터 중 아직 지도에 없는 곳</div>
      <p className="muted small">
        서울·경기·인천 공식 지산 목록(2025.06.30 기준)과 지도를 비교했어요. 최근 거래가 없어서 실거래 후보에 안 잡히던 건물도 여기서 찾을 수 있어요.
      </p>
      {err && <p className="molit-note err">⚠ {err}</p>}
      <p className="small">
        <b>🏢 건축완료 {built.length}곳</b> 지도에 없음
        {unbuilt.length > 0 && <> · 🏗 건축중·미착공 {unbuilt.length}곳</>}
        <select className="molit-min" value={sido} onChange={(e) => { setSido(e.target.value); setSgg('') }}>
          <option value="">서울·경기·인천 전체</option>{SIDO.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="molit-min" value={sgg} onChange={(e) => setSgg(e.target.value)}>
          <option value="">시·군·구 전체</option>
          {R.list.filter((x) => !sido || x.sido === sido).map((x) => <option key={x.sgg_cd} value={x.sgg_cd}>{x.sgg_nm}</option>)}
        </select>
        <label className="molit-all"><input type="checkbox" checked={showUnbuilt} onChange={(e) => setShowUnbuilt(e.target.checked)} /> 건축중·미착공도 보기</label>
      </p>
      <div className="molit-bulk">
        <span className="muted small">{busy ? '⏳ 건축물대장에서 층수·주차를 불러오는 중…' : '이름은 건축물대장 이름을 먼저 쓰고, 없으면 공식 목록 이름을 써요.'}</span>
        <button className="btn primary sm" disabled={busy || !ready.length || bulk.startsWith('등록 중')} onClick={bulkRegister}>
          🏢 건축완료 {ready.length}곳 한꺼번에 등록
        </button>
      </div>
      {bulk && <p className={bulk.startsWith('⚠') ? 'molit-note err' : 'molit-note'}>{bulk}</p>}
      <table className="atable static cand">
        <thead><tr><th>위치 (지번)</th><th>공식 이름</th><th>건축물대장 이름</th><th>상태</th><th>실거래</th><th>분양형태</th><th></th></tr></thead>
        <tbody>
          {list.map((r) => {
            const b = info[bldKey(r)]
            return (
              <tr key={r.id}>
                <td className="nowrap">{r.built ? <span className="jisan-tag ok">건축완료</span> : <span className="jisan-tag field">{r.build_status || '진행중'}</span>}
                  <b>{R.name(r.sgg_cd)} {r.umd_nm} {r.jibun}</b></td>
                <td>{cleanName(r.name)}</td>
                <td>{!r.built ? <span className="muted small">-</span> : !b ? <span className="muted small">…</span>
                  : b.ok ? <>{b.name || <span className="muted small">(대장에 이름 없음)</span>}<div className="sub">{[b.floors_above && `지상 ${b.floors_above}층`, b.parking_spaces && `주차 ${b.parking_spaces}대`].filter(Boolean).join(' · ')}</div></>
                  : <span className="muted small" title={b.error || ''}>대장 없음</span>}</td>
                <td className="sub">{r.status}</td>
                <td>{r.trade_count ? `${r.trade_count}건` : <span className="muted small">없음</span>}</td>
                <td className="sub">{r.sale_type || '-'}</td>
                <td>{r.built && <button className="btn dark sm" onClick={() => onRegister?.(prefillOf(r))}>건물로 등록</button>}</td>
              </tr>
            )
          })}
          {!list.length && <tr><td colSpan="7" className="empty-cell">공식 목록의 지산이 모두 지도에 있어요 🎉</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// "남영아파트형공장(변경전:아주)" → "남영아파트형공장", 공백 정리
function cleanName(n) {
  return (n || '').replace(/\(변경전[^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}
