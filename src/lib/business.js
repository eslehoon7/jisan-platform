// 사업자 업종 정보 (화면 공용)
export const BIZ_TYPES = [
  { key: '중개사', icon: '🏠', desc: '매물 등록·관리', license: '중개사무소 등록번호', licenseRequired: true },
  { key: '분양대행', icon: '🏗️', desc: '분양 물건 등록', license: '분양대행 관련 등록번호', licenseRequired: false },
  { key: '인테리어', icon: '🛠️', desc: '입주 인테리어', license: '건설업·실내건축 면허번호', licenseRequired: false },
  { key: '청소', icon: '🧽', desc: '입주·호실 청소', license: null, licenseRequired: false },
  { key: '은행·대출', icon: '🏦', desc: '담보·시설자금 대출', license: '금융기관·대출모집인 등록번호', licenseRequired: false },
  { key: '대부업', icon: '💳', desc: '대부업 등록 업체', license: '대부업 등록번호', licenseRequired: true },
  { key: '법무', icon: '⚖️', desc: '등기·법률 자문', license: '변호사·법무사 등록번호', licenseRequired: false },
  { key: '기타', icon: '📦', desc: '이사·가구·통신 등', license: null, licenseRequired: false },
]
export const bizInfo = (k) => BIZ_TYPES.find((t) => t.key === k) || BIZ_TYPES[BIZ_TYPES.length - 1]
// 매물을 올리는 업종
export const LISTING_TYPES = ['중개사', '분양대행']

export const fmtBizNo = (v) => {
  const d = String(v || '').replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}
export const fmtTel = (v) => {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11)
  if (d.startsWith('02')) {
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`
    return `${d.slice(0, 2)}-${d.slice(2, d.length - 4)}-${d.slice(-4)}`
  }
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`
}
