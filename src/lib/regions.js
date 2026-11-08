// 수도권 지역(시군구) 목록 — DB의 molit_regions 표에서 한 번만 불러와서 씀
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

let cache = null
let loading = null

export function loadRegions() {
  if (cache) return Promise.resolve(cache)
  if (loading) return loading
  loading = supabase.from('molit_regions')
    .select('sgg_cd, sido, sgg_nm, label, enabled, center_lat, center_lng')
    .eq('enabled', true).order('sgg_cd')
    .then(({ data, error }) => {
      loading = null
      if (error) throw error
      cache = data || []
      return cache
    })
  return loading
}

export function useRegions() {
  const [list, setList] = useState(cache || [])
  useEffect(() => { if (!cache) loadRegions().then(setList).catch(() => {}) }, [])
  const by = Object.fromEntries(list.map((r) => [r.sgg_cd, r]))
  return {
    list,
    by,
    // 지도 '권역' 값 (buildings.district)
    district: (cd) => by[cd]?.label || '',
    // 화면에 보이는 이름: "서울 성동구", "경기 수원시 영통구"
    name: (cd) => (by[cd] ? `${by[cd].sido} ${by[cd].sgg_nm}` : cd || ''),
    // 주소 검색용 "서울 성동구 성수동2가 333-1"
    addr: (cd, umd, jibun) => [by[cd]?.sido, by[cd]?.sgg_nm, umd, jibun].filter(Boolean).join(' '),
  }
}

export const SIDO = ['서울', '경기', '인천']
