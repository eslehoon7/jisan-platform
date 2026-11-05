import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { km } from '../lib/format'

const CATS = ['전체', '인테리어', '청소', '부동산', '은행/대출', '법무']

export default function NearbyVendors({ buildingId, session, onLogin, onVendors }) {
  const [cat, setCat] = useState('전체')
  const [items, setItems] = useState(null)
  const [details, setDetails] = useState({})

  useEffect(() => {
    setItems(null)
    supabase.rpc('nearby_vendors', {
      p_building_id: buildingId, p_radius_m: 3000, p_category: cat === '전체' ? null : cat,
    }).then(({ data }) => { setItems(data || []); onVendors(data || []) })
  }, [buildingId, cat])

  // 회원이면 연락처 등 상세정보 함께 불러오기
  useEffect(() => {
    if (!session || !items?.length) return setDetails({})
    supabase.from('vendor_details').select('vendor_id, phone, intro').in('vendor_id', items.map((v) => v.id))
      .then(({ data }) => setDetails(Object.fromEntries((data || []).map((d) => [d.vendor_id, d]))))
  }, [items, session])

  return (
    <>
      <p className="note">이 건물 기준 반경 3km</p>
      <div className="cat-row">
        {CATS.map((c) => (
          <button key={c} className={c === cat ? 'pill active' : 'pill'} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      {!items && <p className="muted">불러오는 중…</p>}
      {items && !items.length && <p className="muted">반경 3km 안에 등록된 업체가 없어요.</p>}
      <ul className="list">
        {items?.map((v) => (
          <li key={v.id} className={v.is_featured ? 'vendor featured' : 'vendor'}>
            <div className="vendor-top">
              <span className="vcat">{v.category}</span>
              <strong>{v.name}</strong>
              {v.is_featured && <span className="badge">제휴</span>}
              <span className="dist">{km(v.distance_m)}</span>
            </div>
            {session ? (
              <div className="card-meta">{details[v.id]?.phone || '연락처 미등록'}{details[v.id]?.intro ? ` · ${details[v.id].intro}` : ''}</div>
            ) : (
              <button className="link" onClick={onLogin}>🔒 연락처·상담신청은 회원 전용 → 가입하기</button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
