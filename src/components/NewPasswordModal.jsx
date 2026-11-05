import { useState } from 'react'
import { supabase } from '../lib/supabase'

// 비밀번호 재설정 메일의 버튼을 누르고 들어오면 뜨는 창: 새 비밀번호 정하기
export default function NewPasswordModal({ onClose }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [state, setState] = useState('idle') // idle | busy | done | error
  const [msg, setMsg] = useState('')

  async function save(e) {
    e.preventDefault()
    if (pw.length < 8) { setState('error'); return setMsg('비밀번호는 8자 이상으로 입력해 주세요.') }
    if (pw !== pw2) { setState('error'); return setMsg('비밀번호가 서로 달라요.') }
    setState('busy')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setState('error'); return setMsg('변경하지 못했어요: ' + error.message) }
    setState('done')
  }

  return (
    <div className="modal-bg">
      <div className="modal" role="dialog" aria-label="새 비밀번호 정하기">
        <button className="close" onClick={onClose} aria-label="닫기">×</button>
        {state === 'done' ? (
          <div className="sent">
            <div className="sent-icon">✅</div>
            <h3>비밀번호를 바꿨어요</h3>
            <p className="muted">다음부터 새 비밀번호로 로그인해 주세요.</p>
            <button className="btn primary full" onClick={onClose}>확인</button>
          </div>
        ) : (
          <>
            <h3>새 비밀번호 정하기</h3>
            <p className="muted">앞으로 쓸 새 비밀번호를 입력해 주세요.</p>
            <form className="auth-form" onSubmit={save}>
              <input type="password" required placeholder="새 비밀번호 (8자 이상)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
              <input type="password" required placeholder="새 비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
              {state === 'error' && <p className="error">{msg}</p>}
              <button className="btn primary full" disabled={state === 'busy'}>{state === 'busy' ? '저장 중…' : '비밀번호 바꾸기'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
