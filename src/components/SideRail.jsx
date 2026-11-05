// 왼쪽 세로 메뉴 (리치고의 아이콘 메뉴 자리)
const MENUS = [
  { key: '지산', icon: '🏢', label: '지산' },
  { key: '매물', icon: '🔑', label: '매물' },
  { key: '입주', icon: '🧰', label: '입주', soon: false },
  { key: '교육', icon: '🎓', label: '교육', soon: true },
  { key: '커뮤니티', icon: '💬', label: '커뮤니티', soon: true },
]

export default function SideRail({ menu, onMenu }) {
  return (
    <nav className="rail" aria-label="주 메뉴">
      <div className="rail-logo" title="지산맵">지</div>
      {MENUS.map((m) => (
        <button
          key={m.key}
          className={menu === m.key ? 'rail-item active' : 'rail-item'}
          onClick={() => !m.soon && onMenu(m.key)}
          disabled={m.soon}
          title={m.soon ? `${m.label} (준비 중)` : m.label}
        >
          <span className="rail-icon" aria-hidden="true">{m.icon}</span>
          <span className="rail-label">{m.label}</span>
        </button>
      ))}
    </nav>
  )
}
