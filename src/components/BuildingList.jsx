import { wonShort, m2, priceLabel } from '../lib/format'

// 지도 위로 열리는 목록 서랍
export default function BuildingList({ dealType, buildings, error, onSelect, onClose, hint }) {
  return (
    <aside className="sheet">
      <div className="sheet-head">
        <h2>{dealType} · 지식산업센터 <span className="count">{buildings.length}</span></h2>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      {hint && <p className="hint">{hint}</p>}
      {error && <p className="error">{error}</p>}
      {!error && buildings.length === 0 && <p className="muted">조건에 맞는 {dealType} 물건이 없어요.</p>}
      <ul className="list">
        {buildings.map((b) => (
          <li key={b.id}>
            <button className="card" onClick={() => onSelect(b)}>
              <div className="card-row">
                <div>
                  <div className="card-title">{b.name}</div>
                  <div className="card-meta">{b.address}</div>
                </div>
                <div className="card-price">
                  {dealType === '경매' ? (
                    <>
                      <div className="mini"><span>1차 경매가</span><strong>{wonShort(b.first_price)}</strong></div>
                      <div className="mini"><span>현재 경매가{b.auction_round ? ` (${b.auction_round}차)` : ''}</span><strong>{wonShort(b.top_price)}</strong></div>
                    </>
                  ) : (
                    <div className="mini"><span>{priceLabel(dealType)}</span><strong>{b.top_price ? wonShort(b.top_price) : '-'}</strong></div>
                  )}
                  {dealType === '매매' && (
                    <div className="mini"><span>실가</span><strong>{b.trade_price ? wonShort(b.trade_price) : '-'}</strong></div>
                  )}
                  <div className="mini-area">{b.show_area ? m2(b.show_area) : ''}</div>
                </div>
              </div>
              <div className="chips">
                {b.completed_year && <span className="chip">{b.completed_year}년</span>}
                {b.floors_above && <span className="chip">지상 {b.floors_above}층</span>}
                <span className="chip">거래 {b.trade_count}</span>
                <span className={b.type_count > 0 ? 'chip strong' : 'chip'}>{dealType} {b.type_count}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
