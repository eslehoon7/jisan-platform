// 관리자 화면 공용 조각
import { won } from '../../lib/format'

export function Field({ label, hint, children, wide }) {
  return (
    <label className={wide ? 'af wide' : 'af'}>
      <span className="af-label">{label}</span>
      {children}
      {hint && <span className="af-hint">{hint}</span>}
    </label>
  )
}

// 만원 단위 입력 → 원 단위 저장
export function MoneyInput({ value, onChange, placeholder = '예: 125000 (=12억 5천만)' }) {
  const man = value == null || value === '' ? '' : Math.round(value / 1e4)
  return (
    <div className="money">
      <input inputMode="numeric" placeholder={placeholder} value={man}
        onChange={(e) => { const d = e.target.value.replace(/\D/g, ''); onChange(d ? Number(d) * 1e4 : null) }} />
      <span>만원</span>
      {value ? <em>= {won(value)}</em> : null}
    </div>
  )
}

export function Toast({ msg }) {
  if (!msg) return null
  return <div className={msg.startsWith('⚠') ? 'toast err' : 'toast'}>{msg}</div>
}
