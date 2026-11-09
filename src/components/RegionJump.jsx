import { useState } from 'react'
import { useRegions, SIDO } from '../lib/regions'

// 지역 바로가기: 서울·경기·인천 → 시·군·구
const SIDO_CENTER = { 서울: [37.5400, 126.9900], 경기: [37.4000, 127.1000], 인천: [37.4600, 126.7000] }
export default function RegionJump() {
  const onJump = (lat, lng, zoom) => window.dispatchEvent(new CustomEvent('map-jump', { detail: { lat, lng, zoom } }))
  const R = useRegions()
  const [sido, setSido] = useState('')
  const list = R.list.filter((r) => r.sido === sido && r.center_lat)
  return (
    <div className="region-jump">
      <select value={sido} onChange={(e) => { const v = e.target.value; setSido(v); if (SIDO_CENTER[v]) onJump(...SIDO_CENTER[v], v === '경기' ? 10 : 11) }}>
        <option value="">📍 지역 이동</option>
        {SIDO.map((x) => <option key={x}>{x}</option>)}
      </select>
      {sido && (
        <select value="" onChange={(e) => { const r = R.by[e.target.value]; if (r) onJump(r.center_lat, r.center_lng, 14) }}>
          <option value="">시·군·구 선택</option>
          {list.map((r) => <option key={r.sgg_cd} value={r.sgg_cd}>{r.sgg_nm}</option>)}
        </select>
      )}
    </div>
  )
}
