import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadNaverMap } from '../../lib/naverMap'
import { Field, Toast } from './ui'
import { lookupBld } from '../../lib/bldInfo'

const EMPTY = { id: null, name: '', district: '성수', address: '', lat: null, lng: null, completed_year: '', floors_above: '', floors_below: '',
  gross_area_m2: '', parking_spaces: '', transit: '', description: '', is_published: true, sgg_cd: '', umd_nm: '', jibun: '' }
const SGG = [['11200', '성동구'], ['11560', '영등포구'], ['11710', '송파구']]
const SGG_BY_NAME = Object.fromEntries(SGG.map(([c, n]) => [n, c]))
const num = (v) => (v === '' || v == null ? null : Number(v))

export default function BuildingsAdmin({ prefill }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')

  const load = () => supabase.rpc('admin_buildings').then(({ data, error }) => error ? setMsg('⚠ ' + error.message) : setRows(data || []))
  useEffect(() => { load() }, [])
  // 실거래 탭의 [건물로 등록]에서 넘어온 경우: 주소·지번이 채워진 새 등록 화면
  useEffect(() => { if (prefill) { const { _t, ...p } = prefill; setForm({ ...EMPTY, ...p }) } }, [prefill])

  // 구·법정동·지번으로 건축물대장 조회 → 건물명·준공·층수·연면적·주차 채우기
  async function fillFromRegistry() {
    if (!form.sgg_cd || !form.umd_nm || !form.jibun) return flash('⚠ 구·법정동·지번을 먼저 채워 주세요 ([주소로 위치 찾기]를 누르면 자동으로 채워져요)')
    flash('건축물대장 조회 중…')
    try {
      const [b] = await lookupBld([{ sgg_cd: form.sgg_cd, umd_nm: form.umd_nm.trim(), jibun: form.jibun.trim() }])
      if (!b?.ok) return flash('⚠ ' + (b?.error || '건축물대장에서 찾지 못했어요'))
      const s = (v, old) => (v == null || v === '' ? old : String(v))
      setForm((f) => ({ ...f,
        name: f.name || b.name || '',
        completed_year: s(b.completed_year, f.completed_year), floors_above: s(b.floors_above, f.floors_above),
        floors_below: s(b.floors_below, f.floors_below), parking_spaces: s(b.parking_spaces, f.parking_spaces),
        gross_area_m2: s(b.gross_area_m2 && Math.round(b.gross_area_m2 * 100) / 100, f.gross_area_m2),
      }))
      flash(`✅ ${b.name || '건물'} 정보를 채웠어요` + (b.is_jisan ? ' (지식산업센터 확인)' : ''))
    } catch (e) { flash('⚠ 조회 실패: ' + e.message) }
  }

  async function openRow(r) {
    const { data } = await supabase.from('buildings').select('sgg_cd, umd_nm, jibun').eq('id', r.id).maybeSingle()
    setForm({ ...EMPTY, ...r, completed_year: r.completed_year ?? '', floors_above: r.floors_above ?? '', floors_below: r.floors_below ?? '',
      gross_area_m2: r.gross_area_m2 ?? '', parking_spaces: r.parking_spaces ?? '', transit: r.transit ?? '', description: r.description ?? '',
      sgg_cd: data?.sgg_cd ?? '', umd_nm: data?.umd_nm ?? '', jibun: data?.jibun ?? '' })
  }
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  async function save() {
    if (!form.name || !form.address) return flash('⚠ 건물명과 주소는 꼭 넣어 주세요')
    if (form.lat == null) return flash('⚠ [주소로 위치 찾기]를 눌러 지도 위치를 정해 주세요')
    const row = {
      name: form.name.trim(), district: form.district, address: form.address.trim(),
      location: `SRID=4326;POINT(${form.lng} ${form.lat})`,
      completed_year: num(form.completed_year), floors_above: num(form.floors_above), floors_below: num(form.floors_below),
      gross_area_m2: num(form.gross_area_m2), parking_spaces: num(form.parking_spaces),
      transit: form.transit || null, description: form.description || null, is_published: form.is_published,
      sgg_cd: form.sgg_cd || null, umd_nm: form.umd_nm?.trim() || null, jibun: form.jibun?.trim() || null,
    }
    const { error } = form.id
      ? await supabase.from('buildings').update(row).eq('id', form.id)
      : await supabase.from('buildings').insert(row)
    if (error?.code === '23505') return flash('⚠ 같은 지번(구·법정동·지번)의 건물이 이미 등록돼 있어요. 건물 목록에서 찾아 수정해 주세요.')
    if (error) return flash('⚠ 저장 실패: ' + error.message)
    flash(form.id ? '수정했어요' : '새 건물을 등록했어요')
    setForm(null); load()
  }

  const list = rows.filter((r) => !q || r.name.includes(q) || r.address.includes(q))

  return (
    <div className={form ? 'admin-split' : 'admin-split solo'}>
      <section className="admin-list">
        <div className="admin-list-head">
          <input placeholder="건물명·주소 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary sm" onClick={() => setForm({ ...EMPTY })}>+ 건물 등록</button>
        </div>
        <table className="atable">
          <thead><tr><th>건물명</th><th>권역</th><th>준공</th><th>매물</th><th>실거래</th><th>공개</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={form?.id === r.id ? 'sel' : ''} onClick={() => openRow(r)}>
                <td><b>{r.name}</b><div className="sub">{r.address}</div></td>
                <td>{r.district}</td><td>{r.completed_year || '-'}</td><td>{r.listing_count}</td><td>{r.trade_count}</td>
                <td>{r.is_published ? '✅' : '🙈'}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="6" className="empty-cell">등록된 건물이 없어요</td></tr>}
          </tbody>
        </table>
      </section>

      {form && (
        <section className="admin-form">
          <div className="af-head">
            <h2>{form.id ? '건물 수정' : '새 건물 등록'}</h2>
            <button className="icon-btn" onClick={() => setForm(null)}>✕</button>
          </div>
          <div className="af-grid">
            <Field label="건물명 *" wide><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 성수 SK V1 타워" /></Field>
            <Field label="권역 *">
              <select value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })}>
                <option>성수</option><option>영등포</option><option>송파</option>
              </select>
            </Field>
            <Field label="공개 여부">
              <select value={form.is_published ? 'y' : 'n'} onChange={(e) => setForm({ ...form, is_published: e.target.value === 'y' })}>
                <option value="y">✅ 지도에 공개</option><option value="n">🙈 숨김 (준비 중)</option>
              </select>
            </Field>
            <AddressPicker form={form} setForm={setForm} />
            <div className="af-section wide">국토부 실거래 자동 연결 <small>— 주소로 위치를 찾으면 자동으로 채워져요. 지번이 맞아야 실거래가 붙어요.</small></div>
            <Field label="구">
              <select value={form.sgg_cd} onChange={(e) => setForm({ ...form, sgg_cd: e.target.value })}>
                <option value="">선택</option>
                {SGG.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </Field>
            <Field label="법정동"><input value={form.umd_nm} onChange={(e) => setForm({ ...form, umd_nm: e.target.value })} placeholder="성수동2가" /></Field>
            <Field label="지번" hint={form.jibun ? '' : '비워두면 실거래가 자동으로 붙지 않아요'}><input value={form.jibun} onChange={(e) => setForm({ ...form, jibun: e.target.value.replace(/[^\d-]/g, '') })} placeholder="289-10" /></Field>
            <div className="af"><span className="af-label">&nbsp;</span><button type="button" className="btn dark sm" onClick={fillFromRegistry}>🏢 건축물대장에서 채우기</button></div>
            <Field label="준공연도"><input inputMode="numeric" value={form.completed_year} onChange={(e) => setForm({ ...form, completed_year: e.target.value.replace(/\D/g, '') })} placeholder="2021" /></Field>
            <Field label="주차 (대)"><input inputMode="numeric" value={form.parking_spaces} onChange={(e) => setForm({ ...form, parking_spaces: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="지상 층수"><input inputMode="numeric" value={form.floors_above} onChange={(e) => setForm({ ...form, floors_above: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="지하 층수"><input inputMode="numeric" value={form.floors_below} onChange={(e) => setForm({ ...form, floors_below: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="연면적 (㎡)"><input inputMode="decimal" value={form.gross_area_m2} onChange={(e) => setForm({ ...form, gross_area_m2: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="교통"><input value={form.transit} onChange={(e) => setForm({ ...form, transit: e.target.value })} placeholder="2호선 성수역 도보 5분" /></Field>
            <Field label="소개" wide><textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
          <div className="af-actions">
            <button className="btn white" onClick={() => setForm(null)}>취소</button>
            <button className="btn primary" onClick={save}>{form.id ? '수정 저장' : '등록하기'}</button>
          </div>
        </section>
      )}
      <Toast msg={msg} />
    </div>
  )
}

// 주소 → 좌표 찾기 + 지도에서 핀 끌어서 미세 조정
export function AddressPicker({ form, setForm }) {
  const box = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    loadNaverMap().then((naver) => {
      if (!alive || !box.current) return
      const center = new naver.maps.LatLng(form.lat ?? 37.5445, form.lng ?? 127.054)
      map.current = new naver.maps.Map(box.current, { center, zoom: form.lat ? 17 : 13 })
      marker.current = new naver.maps.Marker({ position: center, map: form.lat ? map.current : null, draggable: true })
      naver.maps.Event.addListener(marker.current, 'dragend', (e) => setForm((f) => ({ ...f, lat: e.coord.y, lng: e.coord.x })))
      naver.maps.Event.addListener(map.current, 'click', (e) => {
        marker.current.setPosition(e.coord); marker.current.setMap(map.current)
        setForm((f) => ({ ...f, lat: e.coord.y, lng: e.coord.x }))
      })
    }).catch((e) => setErr(e.message))
    return () => { alive = false }
  }, [form.id])

  function geocode() {
    const { naver } = window
    if (!naver?.maps?.Service) return setErr('지도 주소검색을 불러오지 못했어요')
    naver.maps.Service.geocode({ query: form.address }, (status, res) => {
      const a = res?.v2?.addresses?.[0]
      if (status !== naver.maps.Service.Status.OK || !a) return setErr('주소를 찾지 못했어요. 도로명 주소로 다시 입력해 보세요.')
      setErr('')
      const pos = new naver.maps.LatLng(Number(a.y), Number(a.x))
      marker.current.setPosition(pos); marker.current.setMap(map.current); map.current.setCenter(pos); map.current.setZoom(17)
      // 지번 주소 "서울특별시 성동구 성수동2가 289-10" → 구·법정동·지번 (건물 등록 화면에서만)
      const m = (a.jibunAddress || '').match(/(\S+구)\s+(\S+)\s+(?:산\s*)?(\d+(?:-\d+)?)\s*$/)
      setForm((f) => ({ ...f, lat: Number(a.y), lng: Number(a.x), address: a.roadAddress || f.address,
        ...('jibun' in f && m ? { sgg_cd: SGG_BY_NAME[m[1]] || f.sgg_cd, umd_nm: m[2], jibun: m[3] } : {}) }))
    })
  }

  return (
    <div className="af wide">
      <span className="af-label">주소 * <small>— 찾은 뒤 지도에서 핀을 끌거나 클릭해서 정확한 위치로 옮길 수 있어요</small></span>
      <div className="row">
        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="서울 성동구 성수이로 ○○" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), geocode())} />
        <button type="button" className="btn dark sm" onClick={geocode}>주소로 위치 찾기</button>
      </div>
      <div ref={box} className="picker-map" />
      <span className="af-hint">{form.lat ? `📍 ${form.lat.toFixed(6)}, ${form.lng.toFixed(6)}` : '위치가 아직 정해지지 않았어요'}</span>
      {err && <span className="af-hint error">{err}</span>}
    </div>
  )
}
