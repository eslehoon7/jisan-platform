import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadNaverMap } from '../../lib/naverMap'
import { Field, Toast } from './ui'
import { lookupBld } from '../../lib/bldInfo'
import { useRegions, loadRegions, SIDO } from '../../lib/regions'

const EMPTY = { id: null, name: '', district: '', address: '', lat: null, lng: null, completed_year: '', floors_above: '', floors_below: '',
  gross_area_m2: '', parking_spaces: '', transit: '', description: '', is_published: true, sgg_cd: '', umd_nm: '', jibun: '',
  ceiling_height_m: '', drive_in: '', freight_elevators: '', floor_load_t: '', mgmt_fee_per_py: '', rent_per_py: '', deposit_per_py: '',
  allowed_industries: '', site_note: '', site_checked_at: '' }
const SITE_KEYS = ['ceiling_height_m', 'drive_in', 'freight_elevators', 'floor_load_t', 'mgmt_fee_per_py', 'rent_per_py', 'deposit_per_py', 'allowed_industries', 'site_note', 'site_checked_at']
const num = (v) => (v === '' || v == null ? null : Number(v))

export default function BuildingsAdmin({ prefill }) {
  const R = useRegions()
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
    const { data } = await supabase.from('buildings').select('sgg_cd, umd_nm, jibun, ceiling_height_m, drive_in, freight_elevators, floor_load_t, mgmt_fee_per_py, rent_per_py, deposit_per_py, allowed_industries, site_note, site_checked_at').eq('id', r.id).maybeSingle()
    setForm({ ...EMPTY, ...r, completed_year: r.completed_year ?? '', floors_above: r.floors_above ?? '', floors_below: r.floors_below ?? '',
      gross_area_m2: r.gross_area_m2 ?? '', parking_spaces: r.parking_spaces ?? '', transit: r.transit ?? '', description: r.description ?? '',
      sgg_cd: data?.sgg_cd ?? '', umd_nm: data?.umd_nm ?? '', jibun: data?.jibun ?? '',
      ...Object.fromEntries(SITE_KEYS.map((k) => [k, data?.[k] ?? ''])) })
  }
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  async function save() {
    if (!form.name || !form.address) return flash('⚠ 건물명과 주소는 꼭 넣어 주세요')
    if (form.lat == null) return flash('⚠ [주소로 위치 찾기]를 눌러 지도 위치를 정해 주세요')
    if (!form.district) return flash('⚠ 권역을 골라 주세요')
    const row = {
      name: form.name.trim(), district: form.district, address: form.address.trim(),
      location: `SRID=4326;POINT(${form.lng} ${form.lat})`,
      completed_year: num(form.completed_year), floors_above: num(form.floors_above), floors_below: num(form.floors_below),
      gross_area_m2: num(form.gross_area_m2), parking_spaces: num(form.parking_spaces),
      transit: form.transit || null, description: form.description || null, is_published: form.is_published,
      sgg_cd: form.sgg_cd || null, umd_nm: form.umd_nm?.trim() || null, jibun: form.jibun?.trim() || null,
      // 현장 확인 정보
      ceiling_height_m: num(form.ceiling_height_m), drive_in: form.drive_in || null, freight_elevators: num(form.freight_elevators),
      floor_load_t: num(form.floor_load_t), mgmt_fee_per_py: num(form.mgmt_fee_per_py), rent_per_py: num(form.rent_per_py),
      deposit_per_py: num(form.deposit_per_py), allowed_industries: form.allowed_industries?.trim() || null,
      site_note: form.site_note?.trim() || null, site_checked_at: form.site_checked_at || null,
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
                <option value="">선택 (구를 고르면 자동)</option>
                {SIDO.map((sd) => <optgroup key={sd} label={sd}>{R.list.filter((r) => r.sido === sd).map((r) => <option key={r.sgg_cd} value={r.label}>{r.label}</option>)}</optgroup>)}
              </select>
            </Field>
            <Field label="공개 여부">
              <select value={form.is_published ? 'y' : 'n'} onChange={(e) => setForm({ ...form, is_published: e.target.value === 'y' })}>
                <option value="y">✅ 지도에 공개</option><option value="n">🙈 숨김 (준비 중)</option>
              </select>
            </Field>
            <AddressPicker form={form} setForm={setForm} />
            <div className="af-section wide">국토부 실거래 자동 연결 <small>— 주소로 위치를 찾으면 자동으로 채워져요. 지번이 맞아야 실거래가 붙어요.</small></div>
            <Field label="시·군·구">
              <select value={form.sgg_cd} onChange={(e) => setForm({ ...form, sgg_cd: e.target.value, district: form.district || R.district(e.target.value) })}>
                <option value="">선택</option>
                {SIDO.map((sd) => <optgroup key={sd} label={sd}>{R.list.filter((r) => r.sido === sd).map((r) => <option key={r.sgg_cd} value={r.sgg_cd}>{r.sgg_nm}</option>)}</optgroup>)}
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
            <div className="af-section wide">🔎 현장 확인 정보 <small>— 직접 방문해서 확인한 내용. 넣은 것만 건물 화면에 보여요.</small></div>
            <Field label="확인한 날"><input type="date" value={form.site_checked_at} onChange={(e) => setForm({ ...form, site_checked_at: e.target.value })} /></Field>
            <Field label="층고 (m)"><input inputMode="decimal" value={form.ceiling_height_m} onChange={(e) => setForm({ ...form, ceiling_height_m: e.target.value.replace(/[^\d.]/g, '') })} placeholder="5.4" /></Field>
            <Field label="드라이브인">
              <select value={form.drive_in} onChange={(e) => setForm({ ...form, drive_in: e.target.value })}>
                <option value="">모름</option><option>드라이브인</option><option>도어투도어</option><option>드라이브인 + 도어투도어</option><option>없음</option>
              </select>
            </Field>
            <Field label="화물 엘리베이터 (대)"><input inputMode="numeric" value={form.freight_elevators} onChange={(e) => setForm({ ...form, freight_elevators: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="바닥하중 (톤/㎡)"><input inputMode="decimal" value={form.floor_load_t} onChange={(e) => setForm({ ...form, floor_load_t: e.target.value.replace(/[^\d.]/g, '') })} placeholder="1.2" /></Field>
            <Field label="관리비 (원/평, 월)"><input inputMode="numeric" value={form.mgmt_fee_per_py} onChange={(e) => setForm({ ...form, mgmt_fee_per_py: e.target.value.replace(/\D/g, '') })} placeholder="5000" /></Field>
            <Field label="임대료 (원/평, 월)"><input inputMode="numeric" value={form.rent_per_py} onChange={(e) => setForm({ ...form, rent_per_py: e.target.value.replace(/\D/g, '') })} placeholder="40000" /></Field>
            <Field label="보증금 (원/평)"><input inputMode="numeric" value={form.deposit_per_py} onChange={(e) => setForm({ ...form, deposit_per_py: e.target.value.replace(/\D/g, '') })} placeholder="400000" /></Field>
            <Field label="입주 가능 업종" wide><input value={form.allowed_industries} onChange={(e) => setForm({ ...form, allowed_industries: e.target.value })} placeholder="제조업, 지식산업, 정보통신업 (산업단지 내 제한 등)" /></Field>
            <Field label="현장 메모" wide><textarea rows="2" value={form.site_note} onChange={(e) => setForm({ ...form, site_note: e.target.value })} placeholder="예) 저층 드라이브인 호실 위주, 주차 진입로 좁음" /></Field>
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
      setForm((f) => ({ ...f, lat: Number(a.y), lng: Number(a.x), address: a.roadAddress || f.address }))
      // 지번 주소 → 시군구·법정동·지번 (건물 등록 화면에서만). 예) 경기도 수원시 영통구 / 매탄동 / 416  또는  김포시 / 양촌읍 학운리 / 2980
      if (!('jibun' in form)) return
      const el = Object.fromEntries((a.addressElements || []).map((x) => [x.types?.[0], x.longName]))
      const dong = [el.DONGMYUN, el.RI].filter(Boolean).join(' ')
      const land = (el.LAND_NUMBER || '').replace(/^산\s*/, '')
      loadRegions().then((list) => {
        const sido = (el.SIDO || '').slice(0, 2)
        const r = list.find((x) => x.sido === sido && x.sgg_nm === el.SIGUGUN)
        setForm((f) => ({ ...f,
          ...(r ? { sgg_cd: r.sgg_cd, district: f.district || r.label } : {}),
          ...(dong ? { umd_nm: dong } : {}), ...(/^\d+(-\d+)?$/.test(land) ? { jibun: land } : {}) }))
      }).catch(() => {})
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
