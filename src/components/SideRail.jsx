// 왼쪽 세로 메뉴 (진한 남색 사이드바)
// 사업명·로고는 BRAND 에서 바꾸면 돼요. 로고 이미지가 생기면 public/logo.svg 로 넣고 BRAND.logo 에 '/logo.svg'
export const BRAND = {
  name: '지산맵',
  sub: '지식산업센터 데이터 플랫폼',
  logo: null, // 예) '/logo.svg'
}

const I = {
  map: <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  key: <path d="M3 10.5 12 4l9 6.5 M5 9v11h14V9 M10 20v-4.5a2 2 0 0 1 4 0V20 M15.5 7.5V4.5h2.5v4.8" />,
  tools: <path d="M4 8h16v11H4z M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M4 13h16 M11 13v2h2v-2" />,
  edu: <path d="M3 9l9-5 9 5-9 5-9-5Z M7 11.5V16c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5" />,
  chat: <path d="M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-3 2.5Z M9 9h6 M9 12h4" />,
}
const MENUS = [
  { key: '지산', icon: 'map', label: '지산 지도' },
  { key: '매물', icon: 'key', label: '매물 찾기' },
  { key: '입주', icon: 'tools', label: '입주 업체' },
  { key: '교육', icon: 'edu', label: '교육', soon: true },
  { key: '커뮤니티', icon: 'chat', label: '커뮤니티', soon: true },
]
const Icon = ({ name }) => (
  <svg className="rail-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[name]}</svg>
)

// 기본 로고: 건물 모양 (로고 이미지가 없을 때)
const DefaultLogo = () => (
  <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 27V12l8-5v20 M13 27V4l14 7v16 M3 27h26 M17 12h2 M21 12h2 M17 16h2 M21 16h2 M17 20h2 M21 20h2 M8 15h2 M8 19h2" />
  </svg>
)

// 아래쪽 건물 그림 (직접 그린 단순한 실루엣)
const Skyline = () => (
  <svg className="rail-skyline" viewBox="0 0 160 110" aria-hidden="true">
    <defs>
      <linearGradient id="rs-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6d9cf2" /><stop offset="1" stopColor="#24438f" /></linearGradient>
      <linearGradient id="rs-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9fc0ff" /><stop offset="1" stopColor="#3a5cb8" /></linearGradient>
    </defs>
    <rect x="14" y="46" width="30" height="64" fill="url(#rs-b)" opacity=".7" />
    <rect x="58" y="8" width="38" height="102" fill="url(#rs-c)" />
    <rect x="100" y="30" width="32" height="80" fill="url(#rs-b)" />
    <rect x="134" y="58" width="22" height="52" fill="url(#rs-b)" opacity=".6" />
    {Array.from({ length: 9 }).map((_, r) => [0, 1, 2].map((c) => <rect key={`${r}-${c}`} x={63 + c * 11} y={16 + r * 10} width="6" height="5" fill="#e6efff" opacity=".55" />))}
    {Array.from({ length: 7 }).map((_, r) => [0, 1].map((c) => <rect key={`b${r}-${c}`} x={106 + c * 11} y={38 + r * 10} width="6" height="5" fill="#e6efff" opacity=".4" />))}
    <ellipse cx="34" cy="106" rx="16" ry="7" fill="#2f6b4f" /><ellipse cx="128" cy="107" rx="18" ry="6" fill="#2f6b4f" />
    <rect x="0" y="106" width="160" height="4" fill="#16294f" />
  </svg>
)

export default function SideRail({ menu, onMenu }) {
  return (
    <nav className="rail" aria-label="주 메뉴">
      <a className="rail-brand" href="#/" title={BRAND.name}>
        <span className="rail-logo">{BRAND.logo ? <img src={BRAND.logo} alt="" /> : <DefaultLogo />}</span>
        <span className="rail-brand-text"><b>{BRAND.name}</b><small>{BRAND.sub}</small></span>
      </a>
      <div className="rail-menu">
        {MENUS.map((m) => (
          <button key={m.key} className={menu === m.key ? 'rail-item active' : 'rail-item'}
            onClick={() => !m.soon && onMenu(m.key)} disabled={m.soon} title={m.soon ? `${m.label} (준비 중)` : m.label}>
            <Icon name={m.icon} />
            <span className="rail-label">{m.label}</span>
            {m.soon && <span className="rail-soon">준비중</span>}
          </button>
        ))}
      </div>
      <div className="rail-promo">
        <Skyline />
        <p>지식산업센터 투자,<br />데이터로 더 똑똑하게!</p>
        <a className="rail-cta" href="#/biz">중개사 입점 신청 <span aria-hidden="true">→</span></a>
      </div>
    </nav>
  )
}
