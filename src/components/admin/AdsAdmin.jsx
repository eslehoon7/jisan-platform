import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CONFIG } from '../../config'
import { AD_KINDS, adImg } from '../../lib/ads'
import { useRegions, SIDO } from '../../lib/regions'

// 관리자: 광고 관리
// 1) 왼쪽 아래 세로 배너 (청소·이사·분양·인테리어·대출)  2) 분양 현장 지도 핀 (건물 이미지)
export default function AdsAdmin() {
  const [sec, setSec] = useState('banner')
  return (
    <div>
      <div className="seg small" style={{ marginBottom: 12 }}>
        <button className={sec === 'banner' ? 'on' : ''} onClick={() => setSec('banner')}>🪧 왼쪽 배너</button>
        <button className={sec === 'pin' ? 'on' : ''} onClick={() => setSec('pin')}>🏗 분양 지도 광고</button>
      </div>
      {sec === 'banner' ? <AdTable kind="banner" /> : <AdTable kind="pin" />}
    </div>
  )
}

const TABLE = { banner: 'ad_banners', pin: 'ad_sale_pins' }
const EMPTY = {
  banner: { id: null, kind: '청소', title: '', advertiser: '', image_path: '', link_url: '', phone: '', regions: [], starts_on: '', ends_on: '', priority: 0, active: true, memo: '' },
  pin: { id: null, title: '', subtitle: '', advertiser: '', image_path: '', address: '', lat: null, lng: null, link_url: '', phone: '', starts_on: '', ends_on: '', priority: 0, active: true, memo: '' },
}
const today = () => new Date().toISOString().slice(0, 10)
const state = (r) => !r.active ? ['꺼짐', 'off'] : r.ends_on && r.ends_on < today() ? ['기간 끝', 'off'] : r.starts_on && r.starts_on > today() ? ['예약', 'wait'] : ['노출 중', 'on']

function AdTable({ kind }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const R = useRegions()

  async function load() {
    const { data, error } = await supabase.from(TABLE[kind]).select('*').order('active', { ascending: false }).order('priority', { ascending: false }).order('id', { ascending: false })
    if (error) setMsg('⚠ ' + error.message)
    setRows(data || [])
  }
  useEffect(() => { load(); setForm(null); setMsg('') }, [kind])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return setMsg('⚠ 5MB 이하 이미지로 올려 주세요')
    setBusy(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
    const { error } = await supabase.storage.from('ads').upload(path, file, { contentType: file.type, upsert: false })
    setBusy(false)
    if (error) return setMsg('⚠ 이미지 올리기 실패: ' + error.message)
    setForm((f) => ({ ...f, image_path: path })); setMsg('✅ 이미지를 올렸어요 — [저장]을 눌러야 반영돼요')
  }

  // 주소 → 위치 (서버의 네이버 주소검색)
  async function findPlace() {
    if (!form.address?.trim()) return setMsg('⚠ 주소를 먼저 넣어 주세요')
    setBusy(true)
    const { data: s } = await supabase.auth.getSession()
    const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/geo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY, Authorization: `Bearer ${s.session?.access_token}` },
      body: JSON.stringify({ queries: [form.address.trim()] }),
    }).then((r) => r.json()).catch((e) => ({ error: e.message }))
    setBusy(false)
    const r = res?.results?.[0]
    if (!r?.ok) return setMsg('⚠ 위치를 못 찾았어요. 도로명 주소나 지번 주소로 다시 넣어 주세요' + (res?.error ? ` (${res.error})` : ''))
    setForm((f) => ({ ...f, lat: r.lat, lng: r.lng, address: r.road || f.address }))
    setMsg(`✅ 위치를 찾았어요: ${r.road || r.jibun}`)
  }

  async function save() {
    const f = form
    if (!f.title.trim()) return setMsg(kind === 'pin' ? '⚠ 현장 이름을 넣어 주세요' : '⚠ 관리용 이름을 넣어 주세요')
    if (kind === 'pin' && (f.lat == null || f.lng == null)) return setMsg('⚠ [위치 찾기]로 지도 위치를 정해 주세요')
    if (!f.link_url && !f.phone) return setMsg('⚠ 눌렀을 때 갈 곳(링크 또는 전화번호)을 하나는 넣어 주세요')
    if (f.link_url && !/^https?:\/\//.test(f.link_url)) return setMsg('⚠ 링크는 https:// 로 시작해야 해요')
    const row = { ...f }
    delete row.id; delete row.views; delete row.clicks; delete row.created_at
    for (const k of ['starts_on', 'ends_on', 'link_url', 'phone', 'advertiser', 'image_path', 'memo', 'subtitle', 'address']) if (k in row && row[k] === '') row[k] = null
    row.priority = Number(row.priority) || 0
    row.updated_at = new Date().toISOString()
    const q = f.id ? supabase.from(TABLE[kind]).update(row).eq('id', f.id) : supabase.from(TABLE[kind]).insert(row)
    const { error } = await q
    if (error) return setMsg('⚠ 저장 실패: ' + error.message)
    setMsg(f.id ? '✅ 수정했어요' : '✅ 새 광고를 등록했어요 — 사이트를 새로고침하면 보여요')
    setForm(null); load()
  }

  async function toggle(r) {
    const { error } = await supabase.from(TABLE[kind]).update({ active: !r.active, updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) return setMsg('⚠ ' + error.message)
    load()
  }

  const regionName = (codes) => !codes?.length ? '전체 지역' : codes.length > 3 ? `${codes.slice(0, 3).map((c) => R.by[c]?.sgg_nm || c).join(', ')} 외 ${codes.length - 3}곳` : codes.map((c) => R.by[c]?.sgg_nm || c).join(', ')

  return (
    <div className={form ? 'admin-split' : 'admin-split solo'}>
      <section className="admin-list">
        <div className="admin-list-head">
          <p className="muted small" style={{ margin: 0 }}>
            {kind === 'banner'
              ? '왼쪽 메뉴 맨 아래 세로 배너예요. 지도에서 보고 있는 지역에 맞는 배너가 5초마다 바뀌며 나와요. (휴대폰에서는 안 보여요)'
              : '분양 현장을 지도 위에 건물 모양 이미지로 크게 띄워요. 지도를 어느 정도 확대(줌 11 이상)하면 보여요.'}
          </p>
          <button className="btn primary sm" onClick={() => { setForm({ ...EMPTY[kind] }); setMsg('') }}>+ 광고 등록</button>
        </div>
        {msg && !form && <p className={msg.startsWith('⚠') ? 'molit-note err' : 'molit-note'}>{msg}</p>}
        <table className="atable">
          <thead><tr><th>상태</th>{kind === 'banner' && <th>종류</th>}<th>{kind === 'pin' ? '현장' : '이름 / 광고주'}</th><th>{kind === 'pin' ? '위치' : '지역'}</th><th>기간</th><th>노출·클릭</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const [label, cls] = state(r)
              return (
                <tr key={r.id} className={form?.id === r.id ? 'sel' : ''} onClick={() => { setForm({ ...EMPTY[kind], ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? (Array.isArray(EMPTY[kind][k]) ? [] : EMPTY[kind][k] === null ? null : '')])) }); setMsg('') }}>
                  <td><span className={`ad-state ${cls}`}>{label}</span></td>
                  {kind === 'banner' && <td>{r.kind}</td>}
                  <td><b>{r.title}</b>{r.advertiser && <div className="sub">{r.advertiser}</div>}</td>
                  <td className="sub">{kind === 'pin' ? r.address || `${r.lat?.toFixed(4)}, ${r.lng?.toFixed(4)}` : regionName(r.regions)}</td>
                  <td className="sub nowrap">{r.starts_on || '바로'} ~ {r.ends_on || '계속'}</td>
                  <td className="sub nowrap">{r.views.toLocaleString()} · {r.clicks.toLocaleString()}</td>
                  <td><button className="btn white sm" onClick={(e) => { e.stopPropagation(); toggle(r) }}>{r.active ? '끄기' : '켜기'}</button></td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan="7" className="empty-cell">아직 등록된 광고가 없어요. [+ 광고 등록]을 눌러 주세요.</td></tr>}
          </tbody>
        </table>
      </section>

      {form && (
        <section className="admin-form">
          <div className="af-head"><h3>{form.id ? '광고 수정' : '새 광고'}</h3><button className="btn white sm" onClick={() => setForm(null)}>닫기</button></div>
          {msg && <p className={msg.startsWith('⚠') ? 'molit-note err' : 'molit-note'}>{msg}</p>}
          <div className="af-grid">
            {kind === 'banner' && (
              <label className="af-field">종류
                <select value={form.kind} onChange={set('kind')}>{AD_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
              </label>
            )}
            <label className="af-field">{kind === 'pin' ? '현장 이름 (지도에 보임)' : '관리용 이름'}<input value={form.title} onChange={set('title')} placeholder={kind === 'pin' ? '예) 동탄 ○○ 지식산업센터' : '예) 깨끗한청소 11월'} /></label>
            {kind === 'pin' && <label className="af-field wide">한 줄 문구 (지도에 보임)<input value={form.subtitle} onChange={set('subtitle')} placeholder="예) 분양중 · 평당 1,100만~ · 2027년 준공" /></label>}
            <label className="af-field">광고주 상호<input value={form.advertiser} onChange={set('advertiser')} /></label>
            <label className="af-field">전화번호<input value={form.phone} onChange={set('phone')} placeholder="010-0000-0000" /></label>
            <label className="af-field wide">눌렀을 때 이동할 링크 (없으면 전화 걸기)<input value={form.link_url} onChange={set('link_url')} placeholder="https://" /></label>

            <div className="af-field wide">
              {kind === 'pin' ? '건물 이미지 (배경이 투명한 PNG 추천, 세로형)' : '배너 이미지 (세로형 3:4, 예: 600×800px)'}
              <div className="ad-upload">
                <div className={kind === 'pin' ? 'ad-preview pin' : 'ad-preview'}>
                  {form.image_path ? <img src={adImg(form.image_path)} alt="" /> : <span className="muted small">{kind === 'pin' ? '없으면 기본 건물 그림' : '없으면 글자 배너'}</span>}
                </div>
                <div>
                  <label className="btn white sm file-btn">🖼 이미지 고르기<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={upload} /></label>
                  {form.image_path && <button className="btn white sm" onClick={() => setForm({ ...form, image_path: '' })}>이미지 빼기</button>}
                  <p className="muted small">5MB 이하 · PNG / JPG / WEBP / GIF</p>
                </div>
              </div>
            </div>

            {kind === 'pin' && (
              <div className="af-field wide">현장 주소
                <div className="ad-addr">
                  <input value={form.address} onChange={set('address')} placeholder="예) 경기 화성시 동탄첨단산업1로 27" />
                  <button className="btn dark sm" disabled={busy} onClick={findPlace}>📍 위치 찾기</button>
                </div>
                {form.lat != null && <span className="muted small">위치: {Number(form.lat).toFixed(5)}, {Number(form.lng).toFixed(5)}</span>}
              </div>
            )}

            {kind === 'banner' && (
              <div className="af-field wide">보여줄 지역
                <RegionPicker value={form.regions || []} onChange={(regions) => setForm({ ...form, regions })} R={R} />
              </div>
            )}

            <label className="af-field">시작일 (비우면 바로)<input type="date" value={form.starts_on} onChange={set('starts_on')} /></label>
            <label className="af-field">종료일 (비우면 계속)<input type="date" value={form.ends_on} onChange={set('ends_on')} /></label>
            <label className="af-field">우선순위 (클수록 먼저)<input type="number" value={form.priority} onChange={set('priority')} /></label>
            <label className="af-field check"><input type="checkbox" checked={form.active} onChange={set('active')} /> 켜기 (노출)</label>
            <label className="af-field wide">메모 (관리자만 보임)<textarea rows="2" value={form.memo} onChange={set('memo')} placeholder="예) 월 ○만 원, 12월 말 재계약" /></label>
          </div>
          <div className="af-actions"><button className="btn primary" disabled={busy} onClick={save}>저장</button></div>
        </section>
      )}
    </div>
  )
}

// 지역 고르기: 전체 / 시도 → 시군구 체크
function RegionPicker({ value, onChange, R }) {
  const [sido, setSido] = useState('서울')
  const all = !value.length
  const toggle = (cd) => onChange(value.includes(cd) ? value.filter((x) => x !== cd) : [...value, cd])
  const inSido = R.list.filter((r) => r.sido === sido)
  return (
    <div className="region-picker">
      <label className="check"><input type="checkbox" checked={all} onChange={() => onChange(all ? [inSido[0]?.sgg_cd].filter(Boolean) : [])} /> 전체 지역에 보여주기</label>
      {!all && (
        <>
          <div className="seg small">{SIDO.map((s) => <button key={s} className={s === sido ? 'on' : ''} onClick={() => setSido(s)}>{s} ({value.filter((c) => R.by[c]?.sido === s).length})</button>)}</div>
          <div className="rp-grid">
            <button className="linkish" onClick={() => onChange([...new Set([...value, ...inSido.map((r) => r.sgg_cd)])])}>{sido} 전체 선택</button>
            <button className="linkish" onClick={() => onChange(value.filter((c) => R.by[c]?.sido !== sido))}>{sido} 전체 해제</button>
            {inSido.map((r) => <label key={r.sgg_cd} className="check"><input type="checkbox" checked={value.includes(r.sgg_cd)} onChange={() => toggle(r.sgg_cd)} /> {r.sgg_nm}</label>)}
          </div>
          <span className="muted small">선택 {value.length}곳: 지도 가운데가 이 지역일 때 나와요</span>
        </>
      )}
    </div>
  )
}
