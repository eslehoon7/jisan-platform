// 회원 전용 정보 위에 덮는 "가입 유도" 박스
export default function Locked({ title, children, onLogin }) {
  return (
    <div className="locked">
      <div className="locked-blur" aria-hidden="true">{children}</div>
      <div className="locked-cta">
        <strong>{title}</strong>
        <button className="btn primary" onClick={onLogin}>무료 가입하고 보기</button>
      </div>
    </div>
  )
}
