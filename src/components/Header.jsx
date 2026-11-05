const TYPES = ['매매', '경매', '분양']

// 지도 위 떠 있는 검색창 + 거래유형 + 필터
export default function Header({ dealType, onDealType, query, onQuery, onSearch, onlyListings, onOnlyListings, shifted }) {
  return (
    <div className={shifted ? 'topbar shifted' : 'topbar'}>
      <form className="search" onSubmit={(e) => { e.preventDefault(); onSearch() }}>
        <span aria-hidden="true">🔍</span>
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="지식산업센터 이름 · 주소 검색" />
      </form>
      <div className="seg" role="tablist" aria-label="거래 유형">
        {TYPES.map((t) => (
          <button key={t} role="tab" aria-selected={t === dealType} className={t === dealType ? 'on' : ''} onClick={() => onDealType(t)}>{t}</button>
        ))}
      </div>
      {dealType === '매매' && (
        <button className={onlyListings ? 'filter on' : 'filter'} onClick={() => onOnlyListings(!onlyListings)}>
          매물 있는 곳만
        </button>
      )}
    </div>
  )
}
