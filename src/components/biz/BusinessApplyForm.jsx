import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CONFIG } from '../../config'
import { BIZ_TYPES, bizInfo, fmtBizNo, fmtTel } from '../../lib/business'

const EMPTY = {
  biz_type: '', company_name: '', representative: '', business_no: '', start_dt: '', license_no: '', address: '', office_phone: '',
  contact_name: '', contact_phone: '', intro: '', email: '', password: '', password2: '', terms: false,
}

// 사업자 가입 신청서
// - session 없음: 계정 만들기 + 신청 + 서류를 한 번에
// - session 있음(일반회원이 사업자 전환/반려 후 재신청): 신청 + 서류만
export default function BusinessApplyForm({ session, onDone, prefill }) {
  const [f, setF] = useState({ ...EMPTY, ...(prefill || {}) })
  const [cert, setCert] = useState(null)
  const [license, setLicense] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // 국세청 확인: idle | checking | ok | skipped | fail
  const [nts, setNts] = useState({ state: prefill?.nts_verified_at ? 'ok' : 'idle' })
  const verified = nts.state === 'ok' || nts.state === 'skipped'
  const [step, setStep] = useState(1) // 1: 사업자 확인, 2: 나머지 입력
  const info = f.biz_type ? bizInfo(f.biz_type) : null
  const set = (k, fmt) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : fmt ? fmt(e.target.value) : e.target.value })

  async function checkNts() {
    setErr('')
    if (f.business_no.replace(/\D/g, '').length !== 10) return setNts({ state: 'fail', msg: '사업자등록번호 10자리를 확인해 주세요.' })
    if (!f.start_dt) return setNts({ state: 'fail', msg: '개업일자를 입력해 주세요.' })
    if (!f.representative.trim() || !f.company_name.trim()) return setNts({ state: 'fail', msg: '상호와 대표자명을 입력해 주세요.' })
    setNts({ state: 'checking' })
    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/nts-check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY },
        body: JSON.stringify({ b_no: f.business_no, start_dt: f.start_dt, p_nm: f.representative, b_nm: f.company_name }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) return setNts({ state: 'fail', msg: r.error || '국세청 확인 중 오류가 났어요.' })
      if (r.skipped) { setNts({ state: 'skipped' }); return setStep(2) }
      if (!r.ok) return setNts({ state: 'fail', msg: r.reason })
      setNts({ state: 'ok', b_stt: r.b_stt, tax_type: r.tax_type }); setStep(2)
    } catch { setNts({ state: 'fail', msg: '국세청 확인 서버에 연결하지 못했어요.' }) }
  }
  // 확인에 쓴 4가지를 바꾸면 다시 확인
  const setKey = (k, fmt) => (e) => { setF({ ...f, [k]: fmt ? fmt(e.target.value) : e.target.value }); if (nts.state !== 'idle') setNts({ state: 'idle' }) }

  async function submit(e) {
    e.preventDefault(); setErr('')
    if (!verified) return setErr('먼저 [사업자 확인]을 눌러 주세요.')
    if (!f.biz_type) return setErr('업종을 골라 주세요.')
    if (f.business_no.replace(/\D/g, '').length !== 10) return setErr('사업자등록번호 10자리를 확인해 주세요.')
    if (info.licenseRequired && !f.license_no) return setErr(`${info.license}를 입력해 주세요.`)
    if (!cert) return setErr('사업자등록증을 첨부해 주세요.')
    if (info.licenseRequired && !license) return setErr(`${info.license.replace('번호', '증')}을 첨부해 주세요.`)
    if (!session) {
      if (f.password.length < 8) return setErr('비밀번호는 8자 이상으로 입력해 주세요.')
      if (f.password !== f.password2) return setErr('비밀번호가 서로 달라요.')
    }
    if (!f.terms) return setErr('필수 약관에 동의해 주세요.')
    setBusy(true)
    try {
      let userId = session?.user?.id
      if (!session) {
        const { data, error } = await supabase.auth.signUp({
          email: f.email, password: f.password,
          options: { emailRedirectTo: window.location.origin, data: { name: f.contact_name || f.representative, phone: f.contact_phone.replace(/\D/g, ''), account_type: 'business' } },
        })
        if (error) throw new Error(/already/i.test(error.message) ? '이미 가입된 이메일이에요. 로그인 후 사업자센터에서 신청해 주세요.' : error.message)
        if (!data.user || !data.user.identities?.length) throw new Error('이미 가입된 이메일이에요. 로그인 후 사업자센터에서 신청해 주세요.')
        userId = data.user.id
      }
      const fd = new FormData()
      fd.append('user_id', userId)
      for (const k of ['biz_type', 'company_name', 'representative', 'business_no', 'start_dt', 'license_no', 'address', 'office_phone', 'contact_name', 'contact_phone', 'intro']) fd.append(k, f[k])
      fd.append('cert', cert)
      if (license) fd.append('license', license)
      const headers = { apikey: CONFIG.SUPABASE_KEY }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/business-apply`, { method: 'POST', headers, body: fd })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || '신청을 보내지 못했어요')
      onDone({ email: f.email || session?.user?.email, needsEmail: !session })
    } catch (e2) { setErr(e2.message) }
    setBusy(false)
  }

  return (
    <form className="biz-form" onSubmit={submit}>
      {step === 1 ? (
        <div className="nts-step">
          <div className="biz-step">사업자 확인</div>
          <p className="nts-guide">국세청 자료 기준으로 확인합니다. <b>(휴·폐업 사업자는 가입 불가)</b></p>
          <div className={`nts-box ${nts.state}`}>
            <input required placeholder="상호 (사업자등록증 그대로)" value={f.company_name} onChange={setKey('company_name')} />
            <input required placeholder="대표자명" value={f.representative} onChange={setKey('representative')} />
            <input required inputMode="numeric" placeholder="사업자등록번호 (000-00-00000)" value={f.business_no} onChange={setKey('business_no', fmtBizNo)} />
            <label className="date-field"><span>개업일자</span><input required type="date" value={f.start_dt} onChange={setKey('start_dt')} /></label>
            {nts.state === 'fail' && <p className="error">❌ {nts.msg}</p>}
            <button type="button" className="btn primary full" onClick={checkNts} disabled={nts.state === 'checking'}>
              {nts.state === 'checking' ? '국세청 자료 확인 중…' : '확인'}
            </button>
          </div>
        </div>
      ) : (
      <>
      <div className={`nts-done ${nts.state}`}>
        <div>
          <b>{f.company_name}</b> · {f.representative} · {f.business_no}
          <div className="nts-msg">
            {nts.state === 'ok' && <>✅ 국세청 확인 완료 · {nts.b_stt || '계속사업자'}{nts.tax_type ? ` · ${nts.tax_type}` : ''}</>}
            {nts.state === 'skipped' && <>ℹ️ 국세청 자동 확인 준비 중 — 첨부 서류로 관리자가 확인해요</>}
          </div>
        </div>
        <button type="button" className="link" onClick={() => { setStep(1); setNts({ state: 'idle' }) }}>수정</button>
      </div>
      <div className="biz-step">1. 업종 선택</div>
      <div className="biz-types">
        {BIZ_TYPES.map((t) => (
          <button type="button" key={t.key} className={f.biz_type === t.key ? 'biz-type on' : 'biz-type'} onClick={() => setF({ ...f, biz_type: t.key })}>
            <span className="bt-icon">{t.icon}</span><b>{t.key}</b><small>{t.desc}</small>
          </button>
        ))}
      </div>

      <div className="biz-step">2. 사업장 · 연락처</div>
      <div className="biz-grid">
        {info?.license && <input required={info.licenseRequired} className="wide" placeholder={`${info.license}${info.licenseRequired ? '' : ' (선택)'}`} value={f.license_no} onChange={set('license_no')} />}
        <input required className="wide" placeholder="사업장 주소" value={f.address} onChange={set('address')} />
        <input required inputMode="tel" placeholder="대표 전화" value={f.office_phone} onChange={set('office_phone', fmtTel)} />
        <input placeholder="담당자 이름" value={f.contact_name} onChange={set('contact_name')} />
        <input inputMode="tel" placeholder="담당자 휴대폰" value={f.contact_phone} onChange={set('contact_phone', fmtTel)} />
        <textarea className="wide" rows="2" placeholder="업체 소개 (선택) — 승인 후 고객에게 보여져요" value={f.intro} onChange={set('intro')} />
      </div>

      <div className="biz-step">3. 증빙서류 첨부 <small>사진(JPG·PNG) 또는 PDF, 10MB 이하</small></div>
      <div className="biz-files">
        <FilePick label="사업자등록증 *" file={cert} onPick={setCert} />
        {info?.license && <FilePick label={`${info.license.replace('번호', '증')}${info.licenseRequired ? ' *' : ' (선택)'}`} file={license} onPick={setLicense} />}
      </div>

      {!session && (
        <>
          <div className="biz-step">4. 로그인 계정</div>
          <div className="biz-grid">
            <input required type="email" className="wide" placeholder="이메일 (로그인 아이디)" value={f.email} onChange={set('email')} autoComplete="email" />
            <input required type="password" placeholder="비밀번호 (8자 이상)" value={f.password} onChange={set('password')} autoComplete="new-password" />
            <input required type="password" placeholder="비밀번호 확인" value={f.password2} onChange={set('password2')} autoComplete="new-password" />
          </div>
        </>
      )}

      <label className="check"><input type="checkbox" checked={f.terms} onChange={set('terms')} /> <span><b>[필수]</b> 이용약관·개인정보 수집·이용 및 <b>제출 서류 검토</b>에 동의</span></label>
      {err && <p className="error">{err}</p>}
      <button className="btn primary full" disabled={busy}>{busy ? '신청서를 보내는 중…' : '사업자 가입 신청하기'}</button>
      <p className="muted small center">관리자가 서류를 확인한 뒤 승인되면 사업자 기능이 열려요.</p>
      </>
      )}
    </form>
  )
}

function FilePick({ label, file, onPick }) {
  return (
    <label className={file ? 'file-pick picked' : 'file-pick'}>
      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden
        onChange={(e) => onPick(e.target.files?.[0] || null)} />
      <span className="fp-label">{label}</span>
      <span className="fp-name">{file ? `📎 ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)` : '＋ 파일 선택'}</span>
    </label>
  )
}
