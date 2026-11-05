// 숫자 → 읽기 쉬운 한국식 표기
export function won(v) {
  if (v == null) return '-'
  const eok = Math.floor(v / 1e8)
  const man = Math.round((v % 1e8) / 1e4)
  if (eok && man) return `${eok}억 ${man.toLocaleString()}만`
  if (eok) return `${eok}억`
  return `${man.toLocaleString()}만`
}
// 평당가 → "3,618만"
export const perPy = (v) => (v == null ? '-' : `${Math.round(v / 1e4).toLocaleString()}만`)
export const pyeong = (m2) => (m2 == null ? '-' : `${(m2 / 3.3058).toFixed(1)}평`)
export const km = (m) => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`)
// 직전 거래 대비 변동률
export function change(last, prev) {
  if (!last || !prev) return null
  return ((last - prev) / prev) * 100
}

// 말풍선용 짧은 금액: 12.5억 / 9,800만
export function wonShort(v) {
  if (v == null) return '-'
  if (v >= 1e8) return `${(Math.round(v / 1e7) / 10).toString()}억`
  return `${Math.round(v / 1e4).toLocaleString()}만`
}
export const m2 = (v) => (v == null ? '-' : `${Math.round(Number(v))}㎡`)
// 거래유형별 가격 이름
export const priceLabel = (t) => ({ 매매: '호가', 경매: '감정가', 분양: '분양가' }[t] || '가격')
