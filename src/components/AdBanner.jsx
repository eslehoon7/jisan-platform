import { useEffect, useState } from 'react'
import { loadAds, adImg, adView, adClick } from '../lib/ads'
import { loadRegions } from '../lib/regions'

// 왼쪽 아래 세로형 배너: 지금 보는 지역(시군구)에 맞는 광고를 5초마다 돌려 보여줌
export default function AdBanner({ fallback }) {
  const [banners, setBanners] = useState([])
  const [sgg, setSgg] = useState(null)
  const [i, setI] = useState(0)

  useEffect(() => { loadAds().then((a) => setBanners(a.banners)) }, [])
  // 지도가 멈출 때 가운데 위치 → 가장 가까운 시군구
  useEffect(() => {
    const on = (e) => loadRegions().then((list) => {
      const { lat, lng } = e.detail
      let best = null, bd = Infinity
      for (const r of list) {
        if (!r.center_lat) continue
        const d = (r.center_lat - lat) ** 2 + ((r.center_lng - lng) * 0.8) ** 2
        if (d < bd) { bd = d; best = r.sgg_cd }
      }
      setSgg(best)
    }).catch(() => {})
    window.addEventListener('map-idle', on)
    return () => window.removeEventListener('map-idle', on)
  }, [])

  const list = banners.filter((b) => !b.regions?.length || (sgg && b.regions.includes(sgg)))
  useEffect(() => { setI(0) }, [sgg, banners.length])
  useEffect(() => {
    if (list.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % list.length), 5000)
    return () => clearInterval(t)
  }, [list.length])
  const ad = list[i % (list.length || 1)]
  useEffect(() => { if (ad) adView('banner', ad.id) }, [ad?.id])

  if (!ad) return fallback
  return (
    <div className="ad-banner">
      <button className="ad-card" onClick={() => adClick('banner', ad)} title={ad.advertiser || ad.title}>
        {ad.image_path ? <img src={adImg(ad.image_path)} alt={ad.advertiser || ad.title} /> : (
          <span className="ad-text"><i>{ad.kind}</i><b>{ad.advertiser || ad.title}</b>{ad.phone && <small>{ad.phone}</small>}</span>
        )}
        <span className="ad-mark">AD</span>
      </button>
      {list.length > 1 && (
        <div className="ad-dots">{list.map((b, k) => <i key={b.id} className={k === i % list.length ? 'on' : ''} onClick={() => setI(k)} />)}</div>
      )}
    </div>
  )
}
