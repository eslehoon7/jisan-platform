import { useState } from 'react'
import { supabase } from '../lib/supabase'
import BusinessApplyForm from './biz/BusinessApplyForm'

// 로그인 / 회원가입 창
// - 기본 회원가입: 이름 + 휴대폰 번호 + 이메일 + 비밀번호
// - 휴대폰 본인인증은 추후 포트원 계약 후 추가 (PhoneVerify.jsx 보관 중)
// - 카카오톡 · 네이버: 3초 간편가입 (Supabase 설정 후 작동)
export default function AuthModal({ onClose, initialMode = 'login', initialKind = 'person' }) {
  const [mode, setMode] = useState(initialMode) // signup | login
  const [kind, setKind] = useState(initialKind) // person(일반) | business(사업자)
  const [applied, setApplied] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', password2: '', terms: false, marketing: false })
  const [state, setState] = useState('idle') // idle | busy | sent | error
  const [msg, setMsg] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : k === 'phone' ? fmtPhone(e.target.value) : e.target.value })
  const fail = (m) => { setState('error'); setMsg(m) }

  async function submit(e) {
    e.preventDefault()
    if (mode === 'signup') {
      if (form.password.length < 8) return fail('비밀번호는 8자 이상으로 입력해 주세요.')
      if (form.password !== form.password2) return fail('비밀번호가 서로 달라요.')
      if (!/^01[016789]\d{7,8}$/.test(form.phone.replace(/\D/g, ''))) return fail('휴대폰 번호를 다시 확인해 주세요.')
      if (!form.terms) return fail('필수 약관에 동의해 주세요.')
      setState('busy')
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { name: form.name, marketing_agree: form.marketing, phone: form.phone.replace(/\D/g, '') },
        },
      })
      if (error) return fail(koError(error.message))
      if (data.session) return onClose() // 메일 인증 없이 바로 로그인된 경우
      setState('sent')
    } else {
      setState('busy')
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
      if (error) return fail(koError(error.message))
      if (kind === 'business') window.location.hash = '#/biz'
      onClose()
    }
  }

  // 비밀번호 재설정 메일 보내기
  async function sendReset(e) {
    e.preventDefault()
    if (!form.email) return fail('가입한 이메일을 입력해 주세요.')
    setState('busy')
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: window.location.origin })
    if (error) return fail(koError(error.message))
    setState('reset-sent')
  }

  async function social(provider) {
    if (provider === 'naver') return fail('네이버 간편가입은 준비 중이에요. 곧 열릴 예정이에요.')
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
    if (error) fail(koError(error.message))
  }

  const switchMode = (m) => { setMode(m); setState('idle'); setMsg('') }

  // 바깥을 눌러도 닫히지 않음 — X 버튼으로만 닫기
  return (
    <div className="modal-bg">
      <div className={kind === 'business' && mode === 'signup' && !applied ? 'modal wide' : 'modal'} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={mode === 'signup' ? '회원가입' : '로그인'}>
        <button className="close" onClick={onClose} aria-label="닫기">×</button>

        {!applied && state !== 'sent' && (
          <div className="kind-tabs" role="tablist" aria-label="회원 종류">
            <button role="tab" aria-selected={kind === 'person'} className={kind === 'person' ? 'on' : ''} onClick={() => { setKind('person'); setMode('login'); setState('idle') }}>👤 일반회원</button>
            <button role="tab" aria-selected={kind === 'business'} className={kind === 'business' ? 'on' : ''} onClick={() => { setKind('business'); setMode('login'); setState('idle') }}>🏢 사업자회원</button>
          </div>
        )}

        {applied ? (
          <div className="sent">
            <div className="sent-icon">📨</div>
            <h3>사업자 가입 신청이 접수됐어요</h3>
            <p className="muted">
              {applied.needsEmail && <><b>① {applied.email}</b> 로 보낸 인증 메일의 버튼을 눌러 주세요.<br /></>}
              <b>{applied.needsEmail ? '②' : ''} 관리자가 제출 서류를 확인</b>한 뒤 승인되면<br />사업자센터 기능이 열려요. (보통 1~2 영업일)
            </p>
            <button className="btn primary full" onClick={onClose}>확인</button>
          </div>
        ) : kind === 'business' && mode === 'signup' ? (
          <>
            <h3>사업자 회원가입</h3>
            <p className="muted">중개사·분양대행·인테리어·청소·금융·법무 등 지산 관련 사업자 전용이에요. <b>서류 확인 후 관리자 승인</b>으로 가입이 완료돼요.</p>
            <BusinessApplyForm onDone={setApplied} />
            <p className="switch">이미 사업자 회원이신가요? <button onClick={() => switchMode('login')}>로그인</button></p>
          </>
        ) : state === 'reset-sent' ? (
          <div className="sent">
            <div className="sent-icon">🔑</div>
            <h3>메일함을 확인해 주세요</h3>
            <p className="muted"><b>{form.email}</b> 로 비밀번호 재설정 메일을 보냈어요.<br />메일 속 버튼을 누르면 새 비밀번호를 정할 수 있어요.</p>
            <button className="btn primary full" onClick={onClose}>확인</button>
          </div>
        ) : mode === 'forgot' ? (
          <>
            <h3>비밀번호 찾기</h3>
            <p className="muted">가입한 이메일을 입력하면 비밀번호를 새로 정할 수 있는 메일을 보내드려요.</p>
            <form className="auth-form" onSubmit={sendReset}>
              <input type="email" required placeholder="가입한 이메일" value={form.email} onChange={set('email')} autoComplete="email" />
              {state === 'error' && <p className="error">{msg}</p>}
              <button className="btn primary full" disabled={state === 'busy'}>{state === 'busy' ? '보내는 중…' : '재설정 메일 받기'}</button>
            </form>
            <p className="switch"><button onClick={() => switchMode('login')}>← 로그인으로 돌아가기</button></p>
          </>
        ) : state === 'sent' ? (
          <div className="sent">
            <div className="sent-icon">📩</div>
            <h3>메일함을 확인해 주세요</h3>
            <p className="muted"><b>{form.email}</b> 로 인증 메일을 보냈어요.<br />메일 속 버튼을 누르면 가입이 완료돼요.</p>
            <button className="btn primary full" onClick={onClose}>확인</button>
          </div>
        ) : (
          <>
            <h3>{mode === 'signup' ? '지산맵 회원가입' : kind === 'business' ? '사업자 로그인' : '로그인'}</h3>
            <p className="muted">{mode === 'signup' ? '가입하면 전체 실거래 내역, 매물 상세, 업체 연락처를 볼 수 있어요.' : kind === 'business' ? '로그인하면 사업자센터로 이동해요.' : '다시 오신 걸 환영해요.'}</p>

            {/* ── 기본 회원가입 / 로그인 ── */}
            {mode === 'signup' && <div className="auth-section-title">기본 회원가입</div>}
            <form className="auth-form" onSubmit={submit}>
              {mode === 'signup' && <input required placeholder="이름" value={form.name} onChange={set('name')} autoComplete="name" />}
              {mode === 'signup' && <input type="tel" required inputMode="numeric" placeholder="휴대폰 번호 (010-0000-0000)" value={form.phone} onChange={set('phone')} autoComplete="tel" />}
              <input type="email" required placeholder={mode === 'signup' ? '이메일' : '아이디 (이메일)'} value={form.email} onChange={set('email')} autoComplete="email" />
              <input type="password" required placeholder={mode === 'signup' ? '비밀번호 (8자 이상)' : '비밀번호'} value={form.password} onChange={set('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
              {mode === 'signup' && (
                <>
                  <input type="password" required placeholder="비밀번호 확인" value={form.password2} onChange={set('password2')} autoComplete="new-password" />

                  <label className="check"><input type="checkbox" checked={form.terms} onChange={set('terms')} /> <span><b>[필수]</b> 이용약관 및 개인정보 수집·이용 동의</span></label>
                  <label className="check"><input type="checkbox" checked={form.marketing} onChange={set('marketing')} /> <span>[선택] 새 매물·분양 소식 받기</span></label>
                </>
              )}
              {state === 'error' && <p className="error">{msg}</p>}
              <button className="btn primary full" disabled={state === 'busy'}>
                {state === 'busy' ? '처리 중…' : mode === 'signup' ? '가입하기' : '로그인'}
              </button>
              {mode === 'login' && <button type="button" className="forgot-link" onClick={() => switchMode('forgot')}>비밀번호를 잊으셨나요?</button>}
            </form>

            {/* ── 간편가입 (일반회원만) ── */}
            {kind === 'person' && <>
            <div className="divider"><span>또는</span></div>
            <div className="auth-section-title center">카카오톡 · 네이버 계정으로 <em>3초만에 {mode === 'signup' ? '가입' : '시작'}</em></div>
            <div className="social">
              <button type="button" className="btn kakao" onClick={() => social('kakao')}>
                <span className="sns-mark">💬</span> 카카오톡으로 시작하기
              </button>
              <button type="button" className="btn naver" onClick={() => social('naver')}>
                <span className="sns-mark n">N</span> 네이버로 시작하기
              </button>
            </div>
            </>}

            <p className="switch">
              {mode === 'signup' ? (
                <>이미 회원이신가요? <button onClick={() => switchMode('login')}>로그인</button></>
              ) : kind === 'business' ? (
                <>처음 방문하시나요? <button onClick={() => switchMode('signup')}>사업자 회원가입</button></>
              ) : (
                <>처음 방문하시나요? <button onClick={() => switchMode('signup')}>회원가입</button></>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// 010-1234-5678 형태로 자동 하이픈
function fmtPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length < 4) return d
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`
}

// 자주 나오는 오류를 한국어로
function koError(m) {
  if (/already registered|already exists/i.test(m)) return '이미 가입된 이메일이에요. 로그인해 주세요.'
  if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요.'
  if (/Email not confirmed/i.test(m)) return '메일 인증이 아직 안 됐어요. 메일함을 확인해 주세요.'
  if (/provider is not enabled|Unsupported provider/i.test(m)) return '카카오 간편가입은 설정 마무리 중이에요. 잠시 후 이용해 주세요.'
  if (/rate limit/i.test(m)) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
  return m
}
