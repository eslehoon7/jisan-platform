// 건축물대장(국토부 건축HUB) 조회 + 네이버 주소→좌표 도우미 (관리자 화면용)
import { supabase } from './supabase'
import { CONFIG } from '../config'
import { loadNaverMap } from './naverMap'

// items: [{ sgg_cd, umd_nm, jibun }] → [{ ...item, ok, name, road_address, completed_year, floors_above, floors_below, gross_area_m2, parking_spaces, is_jisan }]
export async function lookupBld(items, onProgress) {
  const { data: s } = await supabase.auth.getSession()
  const chunks = []
  for (let i = 0; i < items.length; i += 15) chunks.push(items.slice(i, i + 15))
  // 15곳씩, 동시에 2묶음까지만 조회 (국토부 서버가 한꺼번에 많이 물으면 거절함). 한 번 조회한 건물은 서버에 저장돼서 다음부터 바로 나옴
  const run = async (chunk) => {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/bld-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY, Authorization: `Bearer ${s.session?.access_token}` },
      body: JSON.stringify({ action: 'lookup', items: chunk }),
    })
    const j = await res.json()
    if (!res.ok || j.error) throw new Error(j.error || `오류 ${res.status}`)
    return j.results.map((r) => ({ ...r, is_jisan: r.is_jisan || /지식산업센터|아파트형공장/.test(r.name || '') }))
  }
  const out = []
  for (let i = 0; i < chunks.length; i += 2) {
    const parts = await Promise.all(chunks.slice(i, i + 2).map(run))
    out.push(...parts.flat())
    onProgress?.(out)
  }
  return out
}

export const bldKey = (c) => `${c.sgg_cd}|${c.umd_nm}|${c.jibun}`

// 주소 → { lat, lng, road } (네이버 지도 주소검색)
// 주소검색 기능(geocoder)은 지도 스크립트보다 늦게 준비되므로 최대 8초 기다림. 응답이 없으면 8초 후 포기(null)
export async function geocode(query) {
  const naver = await loadNaverMap()
  for (let i = 0; i < 40 && !naver.maps.Service?.geocode; i++) await new Promise((r) => setTimeout(r, 200))
  if (!naver.maps.Service?.geocode) throw new Error('네이버 주소검색 기능을 불러오지 못했어요')
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000)
    try {
      naver.maps.Service.geocode({ query }, (status, res) => {
        clearTimeout(timer)
        const a = res?.v2?.addresses?.[0]
        if (status !== naver.maps.Service.Status.OK || !a) return resolve(null)
        resolve({ lat: Number(a.y), lng: Number(a.x), road: a.roadAddress || '' })
      })
    } catch { clearTimeout(timer); resolve(null) }
  })
}
