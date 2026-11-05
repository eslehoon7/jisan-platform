// 네이버 지도 스크립트를 한 번만 불러오는 도우미
import { CONFIG } from '../config'
let loading = null

export function loadNaverMap() {
  if (window.naver?.maps) return Promise.resolve(window.naver)
  if (loading) return loading
  const key = CONFIG.NAVER_MAP_KEY
  loading = new Promise((resolve, reject) => {
    if (!key) return reject(new Error('네이버 지도 키가 src/config.js에 없어요'))
    const s = document.createElement('script')
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${key}&submodules=geocoder`
    s.async = true
    s.onload = () => (window.naver?.maps ? resolve(window.naver) : reject(new Error('지도 로딩 실패')))
    s.onerror = () => reject(new Error('지도 스크립트를 불러오지 못했어요'))
    document.head.appendChild(s)
  })
  // 키가 틀리거나 주소가 등록 안 됐을 때 네이버가 호출하는 함수
  window.navermap_authFailure = () => {
    window.dispatchEvent(new CustomEvent('naver-auth-failure'))
  }
  return loading
}

// 권역별 지도 중심
export const DISTRICTS = {
  성수: { lat: 37.5445, lng: 127.0540, zoom: 15 },
  영등포: { lat: 37.5230, lng: 126.8910, zoom: 15 },
  송파: { lat: 37.4850, lng: 127.1235, zoom: 15 },
}
