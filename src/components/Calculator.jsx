import { useEffect, useState } from 'react'
import { won } from '../lib/format'

// 대출·수익률 + 취득세 계산기 (참고용). 금액 입력 단위: 만원
const TAX = {
  normal: { label: '일반 (임대·매매)', rate: 4.6, note: '취득세 4% + 농어촌특별세 0.2% + 지방교육세 0.4%' },
  first: { label: '최초 분양 + 직접 사용 (감면)', rate: 3.3, note: '지식산업센터 최초 분양 후 직접 사용하면 취득세 35% 감면 대상일 수 있어요 (지방세특례제한법 제58조의2). 감면 기한·요건은 바뀔 수 있어 관할 구청 세무과 확인이 필요해요.' },
}

const w = (v) => (v < 0 ? '-' : '') + won(Math.abs(Math.round(v)))

export default function Calculator({ ins, b }) {
  const lastPrice = ins?.last?.price ? Math.round(ins.last.price / 1e4) : ''
  const area = ins?.last?.area
  const [f, setF] = useState({ price: lastPrice, loan: 70, rate: 4.5, deposit: '', rent: '', tax: 'normal' })
  useEffect(() => {
    const rent = b?.rent_per_py && area ? Math.round((b.rent_per_py * (area / 3.3058)) / 1e4) : ''
    const dep = b?.deposit_per_py && area ? Math.round((b.deposit_per_py * (area / 3.3058)) / 1e4) : ''
    setF((v) => ({ ...v, price: lastPrice, rent, deposit: dep }))
  }, [b?.id, lastPrice])

  const num = (v) => Number(String(v).replace(/,/g, '')) || 0
  const price = num(f.price) * 1e4
  const loan = price * (num(f.loan) / 100)
  const tax = price * (TAX[f.tax].rate / 100)
  const deposit = num(f.deposit) * 1e4
  const cash = price + tax - loan - deposit // 실제 내 돈
  const interestM = (loan * (num(f.rate) / 100)) / 12
  const rentM = num(f.rent) * 1e4
  const netM = rentM - interestM
  const yieldY = cash > 0 && rentM ? ((netM * 12) / cash) * 100 : null
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="calc">
      <p className="small muted">숫자를 바꾸면 바로 계산돼요. 매매가는 이 건물 최근 실거래가로 미리 채워 뒀어요{area ? ` (${(area / 3.3058).toFixed(1)}평)` : ''}.</p>
      <div className="calc-grid">
        <label>매매가 <span><input inputMode="numeric" value={f.price} onChange={set('price')} />만원</span></label>
        <label>대출 비율 <span><input inputMode="decimal" value={f.loan} onChange={set('loan')} />%</span></label>
        <label>대출 금리 <span><input inputMode="decimal" value={f.rate} onChange={set('rate')} />%</span></label>
        <label>보증금 <span><input inputMode="numeric" value={f.deposit} onChange={set('deposit')} placeholder="임대 시" />만원</span></label>
        <label>월세 <span><input inputMode="numeric" value={f.rent} onChange={set('rent')} placeholder="임대 시" />만원</span></label>
        <label>취득세 기준
          <select value={f.tax} onChange={set('tax')}>{Object.entries(TAX).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select>
        </label>
      </div>

      <div className="calc-out">
        <div><span>대출금</span><b>{w(loan)}</b></div>
        <div><span>취득세 등 (약 {TAX[f.tax].rate}%)</span><b>{w(tax)}</b></div>
        <div className="hl"><span>실제 필요한 내 돈</span><b>{w(Math.max(cash, 0))}</b></div>
        <div><span>월 대출이자</span><b>{w(interestM)}</b></div>
        {rentM > 0 && <div><span>월 순수익 (월세 − 이자)</span><b className={netM >= 0 ? '' : 'up'}>{w(netM)}</b></div>}
        {yieldY != null && <div className="hl"><span>연 수익률 (내 돈 기준)</span><b>{yieldY.toFixed(2)}%</b></div>}
      </div>
      <p className="small muted">{TAX[f.tax].note}</p>
      <p className="small muted">※ 참고용 계산이에요. 중개보수·법무사비·관리비·공실 기간·재산세는 빠져 있고, 실제 대출 한도와 세금은 은행·세무사와 꼭 확인하세요.</p>
    </div>
  )
}
