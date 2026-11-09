import { useEffect, useRef, useState } from 'react'
import { loadNaverMap } from '../lib/naverMap'
import { wonShort, m2, priceLabel } from '../lib/format'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// 축척 300m 이상(멀리)에서는 '시세 알약', 100m 이하(가까이)에서는 전체 말풍선
export const FULL_ZOOM = 16 // 네이버 축척 16단계 = 100m, 15단계 = 300m
export const AREA_ZOOM = 13 // 이보다 멀면(1km 이상) 건물 대신 '지역 묶음'(시·군·구별 개수·평균 평단가)
const MAX_MARKERS = 400 // 화면 안 건물만, 최대 400개까지 그림

// 지역 묶음: 시·군·구(권역)별 건물 수 + 평균 평당가
function areaGroups(buildings) {
  const g = {}
  for (const b of buildings) {
    const k = b.district || '기타'
    const x = (g[k] ||= { name: k, n: 0, lat: 0, lng: 0, py: 0, pyN: 0 })
    x.n++; x.lat += b.lat; x.lng += b.lng
    if (b.last_price_per_py) { x.py += Number(b.last_price_per_py); x.pyN++ }
  }
  return Object.values(g).map((x) => ({ ...x, lat: x.lat / x.n, lng: x.lng / x.n, avgPy: x.pyN ? x.py / x.pyN : null }))
}
function areaHtml(a) {
  return `<div class="area-chip"><b>${esc(a.name)}</b><span>${a.n}곳</span>${a.avgPy ? `<i>평당 ${wonShort(a.avgPy)}</i>` : ''}</div>`
}

// 멀리서 볼 때: 대표 시세 하나만 작게 (겹침 줄이기)
function pillHtml(b, active, dealType) {
  const tone = dealType === '분양' ? 'sale' : dealType === '경매' ? 'auction' : 'buy'
  const act = active ? 'active' : ''
  const name = esc(b.name)
  let label = '', price = null
  if (dealType === '경매') { label = '경매'; price = b.top_price }
  else if (dealType === '분양') { label = '분양'; price = b.top_price }
  else if (b.top_price) { label = b.ask_is_recent ? '최근호가' : '호가'; price = b.top_price }
  else if (b.trade_price) { label = '실가'; price = b.trade_price }
  if (!price) return `<div class="pill dot ${tone} ${act}" title="${name}"></div>`
  return `<div class="pill ${tone} ${act}" title="${name}"><span>${label}</span><b>${wonShort(price)}</b></div>`
}

// 말풍선: 호가(감정가/분양가) → 실가(최근 실거래) → 면적
function pinHtml(b, active, dealType) {
  const tone = dealType === '분양' ? 'sale' : dealType === '경매' ? 'auction' : 'buy'
  const act = active ? 'active' : ''
  const name = esc(b.name)
  const title = `<div class="bubble-title">${name}</div>` // 말풍선 위 건물 이름
  if (!b.top_price && !b.trade_price) {
    // 매물도 거래도 없는 건물: 이름만 작게
    return `<div class="bubble nolist ${act}"><div class="bubble-row ask">${name}</div></div>`
  }
  if (dealType === '경매') {
    const more = b.same_count > 1 ? `<i class="pin-badge">+${b.same_count - 1}</i>` : ''
    const round = b.auction_round ? `<i class="round">${b.auction_round}차</i>` : ''
    return `<div class="bubble auction ${act}" title="${name}">${title}${more}`
      + `<div class="bubble-row ask"><span>1차 경매가</span><b>${wonShort(b.first_price)}</b></div>`
      + `<div class="bubble-row real"><span>현재 경매가${round}</span><b>${wonShort(b.top_price)}</b></div>`
      + `<div class="bubble-area">${b.show_area ? m2(b.show_area) : ''}</div></div>`
  }
  const more = b.same_count > 1 ? `<i class="pin-badge">+${b.same_count - 1}</i>` : ''
  const ask = b.top_price
    ? `<div class="bubble-row ask"><span>${b.ask_is_recent ? '최근 ' : ''}${priceLabel(dealType)}</span><b>${wonShort(b.top_price)}</b></div>`
    : `<div class="bubble-row ask none"><span>${priceLabel(dealType)}</span><b>-</b></div>`
  // 분양은 실가 없이 분양가 + 면적만
  const real = dealType === '분양' ? '' : `<div class="bubble-row real"><span>실가</span><b>${b.trade_price ? wonShort(b.trade_price) : '-'}</b></div>`
  const area = b.show_area
  return `<div class="bubble ${tone} ${act}" title="${name}">${title}${more}${ask}${real}`
    + `<div class="bubble-area">${area ? m2(area) : ''}</div></div>`
}

export default function MapView({ center, buildings, dealType, selected, vendors, onSelect }) {
  const box = useRef(null)
  const map = useRef(null)
  const layers = useRef({ buildings: [], vendors: [], circle: null })
  const [status, setStatus] = useState('loading')
  const [msg, setMsg] = useState('')
  const [zoomedOut, setZoomedOut] = useState(false)
  const [compact, setCompact] = useState(true) // 멀리서 보면 시세 알약
  const [view, setView] = useState(null) // 지금 보이는 범위 { zoom, bounds }

  useEffect(() => {
    let alive = true
    const onAuthFail = () => {
      setStatus('error')
      setMsg(`네이버 지도 인증에 실패했어요. 네이버 클라우드 콘솔 → Maps → Application → [수정]에서 Web 서비스 URL에 ${window.location.origin} 이 등록됐는지 확인해 주세요.`)
    }
    window.addEventListener('naver-auth-failure', onAuthFail)
    loadNaverMap()
      .then((naver) => {
        if (!alive) return
        map.current = new naver.maps.Map(box.current, {
          center: new naver.maps.LatLng(center.lat, center.lng),
          zoom: center.zoom,
          minZoom: 9,
          zoomControl: true,
          zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER, style: naver.maps.ZoomControlStyle.SMALL },
          mapDataControl: false,
          scaleControl: true,
        })
        naver.maps.Event.addListener(map.current, 'zoom_changed', (z) => { setZoomedOut(z < 14); setCompact(z < FULL_ZOOM) })
        setCompact(map.current.getZoom() < FULL_ZOOM)
        // 지도를 다 움직이고 멈췄을 때만 보이는 범위를 다시 계산 (건물이 많아도 가볍게)
        const sync = () => setView({ zoom: map.current.getZoom(), bounds: map.current.getBounds() })
        naver.maps.Event.addListener(map.current, 'idle', sync)
        sync()
        // 검색창 밑 '지역 이동'에서 보내는 이동 요청
        window.addEventListener('map-jump', (e) => map.current.morph(new naver.maps.LatLng(e.detail.lat, e.detail.lng), e.detail.zoom))
        setStatus('ready')
      })
      .catch((e) => { setStatus('error'); setMsg(e.message) })
    return () => { alive = false; window.removeEventListener('naver-auth-failure', onAuthFail) }
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    const { naver } = window
    map.current.morph(new naver.maps.LatLng(center.lat, center.lng), center.zoom)
  }, [center, status])

  // 건물 가격 말풍선
  useEffect(() => {
    if (status !== 'ready') return
    const { naver } = window
    layers.current.buildings.forEach((m) => m.setMap(null))
    layers.current.buildings = []
    if (!view) return
    // 멀리서 볼 때: 시·군·구 묶음 (누르면 그 지역으로 확대)
    if (view.zoom < AREA_ZOOM) {
      layers.current.buildings = areaGroups(buildings).map((a) => {
        const m = new naver.maps.Marker({
          position: new naver.maps.LatLng(a.lat, a.lng), map: map.current, zIndex: 100 + a.n,
          icon: { content: areaHtml(a), anchor: new naver.maps.Point(0, 0) },
        })
        naver.maps.Event.addListener(m, 'click', () => map.current.morph(new naver.maps.LatLng(a.lat, a.lng), 14))
        return m
      })
      return
    }
    // 가까이: 화면 안(조금 여유) 건물만 그림
    const bd = view.bounds
    const sw = bd.getSW(), ne = bd.getNE()
    const padLat = (ne.lat() - sw.lat()) * 0.2, padLng = (ne.lng() - sw.lng()) * 0.2
    const inView = buildings.filter((b) => selected?.id === b.id || (
      b.lat >= sw.lat() - padLat && b.lat <= ne.lat() + padLat && b.lng >= sw.lng() - padLng && b.lng <= ne.lng() + padLng))
      .slice(0, MAX_MARKERS)
    layers.current.buildings = inView.map((b) => {
      const active = selected?.id === b.id
      const m = new naver.maps.Marker({
        position: new naver.maps.LatLng(b.lat, b.lng),
        map: map.current,
        zIndex: active ? 300 : 100,
        icon: { content: compact && !active ? pillHtml(b, active, dealType) : pinHtml(b, active, dealType), anchor: new naver.maps.Point(0, 0) },
      })
      naver.maps.Event.addListener(m, 'click', () => onSelect(b))
      return m
    })
  }, [buildings, selected, dealType, status, compact, view])

  // 거래유형을 바꾸면 해당 물건들이 다 보이도록 지도 범위 맞추기
  const lastType = useRef(dealType)
  useEffect(() => {
    if (status !== 'ready' || lastType.current === dealType) return
    lastType.current = dealType
    if (!buildings.length) return
    const { naver } = window
    if (buildings.length === 1) return map.current.morph(new naver.maps.LatLng(buildings[0].lat, buildings[0].lng), 15)
    const bounds = new naver.maps.LatLngBounds(
      new naver.maps.LatLng(Math.min(...buildings.map((b) => b.lat)), Math.min(...buildings.map((b) => b.lng))),
      new naver.maps.LatLng(Math.max(...buildings.map((b) => b.lat)), Math.max(...buildings.map((b) => b.lng)))
    )
    map.current.fitBounds(bounds, { top: 90, right: 60, bottom: 80, left: 60 })
  }, [dealType, buildings, status])

  // 선택 건물 반경 3km + 주변 업체
  useEffect(() => {
    if (status !== 'ready') return
    const { naver } = window
    layers.current.vendors.forEach((m) => m.setMap(null))
    layers.current.circle?.setMap(null)
    layers.current.circle = null
    if (!selected) return
    const pos = new naver.maps.LatLng(selected.lat, selected.lng)
    layers.current.circle = new naver.maps.Circle({
      map: map.current, center: pos, radius: 3000,
      strokeColor: '#1b64da', strokeOpacity: 0.45, strokeWeight: 1.5, strokeStyle: 'shortdash',
      fillColor: '#1b64da', fillOpacity: 0.04,
    })
    // 왼쪽 패널에 가리지 않도록 건물을 지도 오른쪽으로 살짝 이동
    map.current.morph(pos, Math.max(map.current.getZoom(), 15))
    if (window.innerWidth > 760) setTimeout(() => map.current.panBy(new naver.maps.Point(-220, 0)), 350)
    layers.current.vendors = vendors.map((v) => new naver.maps.Marker({
      position: new naver.maps.LatLng(v.lat, v.lng),
      map: map.current,
      zIndex: 50,
      icon: {
        content: `<div class="vpin ${v.is_featured ? 'featured' : ''}" title="${esc(v.name)}">${esc(v.category.slice(0, 2))}</div>`,
        anchor: new naver.maps.Point(13, 13),
      },
    }))
  }, [selected, vendors, status])

  return (
    <div className={zoomedOut ? 'map zoomed-out' : 'map'}>
      <div ref={box} className="map-canvas" />
      {status === 'loading' && <div className="map-overlay">지도를 불러오는 중…</div>}
      {status === 'error' && <div className="map-overlay error">{msg}</div>}
    </div>
  )
}

