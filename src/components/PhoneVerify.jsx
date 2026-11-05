import { useEffect, useState } from 'react'
import { CONFIG } from '../config'

// 서버 인증 함수 호출
async function callVerify(body) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/phone-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || '인증 서버에 연결하지 못했어요')
  return data
}

const fmtPhone = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length < 4) return d
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`
}

// 휴대폰 인증: 고객이 [문자 인증번호] / [PASS 본인인증] 중 선택
export default function PhoneVerify({ onVerified }) {
  const [method, setMethod] = useState('sms')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [reqId, setReqId] = useState(null)
  const [left, setLeft] = useState(0)
  const [devCode, setDevCode] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // 남은 시간 카운트다운
  useEffect(() => {
    if (!left) return
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left])

  async function send() {
    setBusy(true); setMsg('')
    try {
      const r = await callVerify({ action: 'send', phone })
      setReqId(r.id); setLeft(r.expires_in); setCode('')
      setDevCode(r.dev_code || '')
      setMsg(r.dev_mode ? '' : '인증번호를 문자로 보냈어요.')
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }

  async function check() {
    setBusy(true); setMsg('')
    try {
      await callVerify({ action: 'check', id: reqId, code })
      setDone(true); setLeft(0)
      onVerified({ id: reqId, phone: phone.replace(/\D/g, '') })
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }

  if (done) {
    return <div className="verified">✅ 휴대폰 인증 완료 · {phone}</div>
  }

  return (
    <div className="phone-verify">
      <div className="verify-tabs" role="tablist" aria-label="인증 방법">
        <button type="button" role="tab" aria-selected={method === 'sms'} className={method === 'sms' ? 'on' : ''} onClick={() => setMethod('sms')}>문자 인증번호</button>
        <button type="button" role="tab" aria-selected={method === 'pass'} className={method === 'pass' ? 'on' : ''} onClick={() => setMethod('pass')}>PASS 본인인증</button>
      </div>

      {method === 'sms' ? (
        <>
          <div className="row">
            <input type="tel" inputMode="numeric" placeholder="휴대폰 번호 (010-0000-0000)" value={phone}
              onChange={(e) => setPhone(fmtPhone(e.target.value))} disabled={!!reqId && left > 0} />
            <button type="button" className="btn outline" onClick={send} disabled={busy || phone.replace(/\D/g, '').length < 10 || (reqId && left > 120)}>
              {reqId ? '재전송' : '인증번호 받기'}
            </button>
          </div>
          {reqId && (
            <div className="row">
              <div className="code-box">
                <input inputMode="numeric" maxLength={6} placeholder="인증번호 6자리" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                {left > 0 && <span className="timer">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
              </div>
              <button type="button" className="btn dark" onClick={check} disabled={busy || code.length !== 6 || left === 0}>확인</button>
            </div>
          )}
          {devCode && (
            <p className="dev-note">🧪 테스트 모드 — 문자 대신 여기에 표시돼요: <b>{devCode}</b><br />(문자 발송 업체 연결 후 사라져요)</p>
          )}
        </>
      ) : (
        <div className="pass-box">
          <button type="button" className="btn pass" onClick={() => setMsg('PASS 본인인증은 본인인증 업체와 계약 후 열려요. 지금은 문자 인증번호를 이용해 주세요.')}>
            <b>PASS</b> 앱으로 본인인증
          </button>
          <p className="muted small">이름·생년월일·휴대폰 명의를 한 번에 확인해요.</p>
        </div>
      )}
      {msg && <p className={/보냈어요/.test(msg) ? 'ok small' : 'error small'}>{msg}</p>}
    </div>
  )
}
