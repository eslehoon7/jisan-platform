// 광고(배너·분양 지도 핀) 도우미
import { supabase } from './supabase'
import { CONFIG } from '../config'

export const AD_KINDS = ['분양', '청소', '이사', '인테리어', '대출', '기타']
export const adImg = (path) => (path ? `${CONFIG.SUPABASE_URL}/storage/v1/object/public/ads/${path}` : null)

// 노출 1번은 같은 화면에서 한 번만 셈
const seen = new Set()
export function adView(kind, id) {
  const k = `${kind}:${id}`
  if (seen.has(k)) return
  seen.add(k)
  supabase.rpc('ad_hit', { p_kind: kind, p_id: id, p_click: false }).then(() => {})
}
export function adClick(kind, ad) {
  supabase.rpc('ad_hit', { p_kind: kind, p_id: ad.id, p_click: true }).then(() => {})
  if (ad.link_url) window.open(ad.link_url, '_blank', 'noopener')
  else if (ad.phone) window.location.href = `tel:${ad.phone.replace(/[^\d+]/g, '')}`
}

// 진행 중인 광고 불러오기 (한 번만)
let cache = null
export function loadAds() {
  if (!cache) cache = Promise.all([
    supabase.from('ad_banners').select('id, kind, title, advertiser, image_path, link_url, phone, regions, priority').eq('active', true).order('priority', { ascending: false }),
    supabase.from('ad_sale_pins').select('id, title, subtitle, advertiser, image_path, lat, lng, link_url, phone, priority').eq('active', true).order('priority', { ascending: false }),
  ]).then(([b, p]) => ({ banners: b.data || [], pins: p.data || [] }))
  return cache
}
