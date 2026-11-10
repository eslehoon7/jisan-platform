import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { wonShort, won, pyeong } from '../../lib/format'

// 중개사 매물 엑셀 일괄 등록
// 1) 중개사무소 고르기(없으면 새로 등록) → 2) 양식 받아 채우기 → 3) 파일 올리기 → 4) 건물 연결 확인 → 5) 등록
const COLS = [
  { key: 'building', label: '건물명', aliases: ['건물명', '건물', '단지명', '지산명', '건물이름'], width: 26, ex: '에이스테크노타워 5차' },
  { key: 'address', label: '주소', aliases: ['주소', '소재지', '지번', '도로명주소'], width: 30, ex: '서울 구로구 구로동 197-10' },
  { key: 'unit', label: '호실', aliases: ['호실', '호수', '호'], width: 10, ex: '1105호' },
  { key: 'floor', label: '층', aliases: ['층', '해당층', '층수'], width: 8, ex: 11 },
  { key: 'm2', label: '전용면적(㎡)', aliases: ['전용면적(㎡)', '전용면적(m2)', '전용면적', '전용(㎡)', '면적(㎡)', '면적'], width: 14, ex: 84.5 },
  { key: 'py', label: '전용면적(평)', aliases: ['전용면적(평)', '전용(평)', '평수', '면적(평)'], width: 14, ex: '' },
  { key: 'price', label: '매매가(만원)', aliases: ['매매가(만원)', '매매가', '가격', '금액', '호가', '매매가격'], width: 14, ex: 98000 },
  { key: 'mgmt', label: '관리비(만원/월)', aliases: ['관리비(만원/월)', '관리비', '관리비(만원)'], width: 14, ex: 25 },
  { key: 'movein', label: '입주가능일', aliases: ['입주가능일', '입주일', '입주'], width: 14, ex: '즉시' },
  { key: 'desc', label: '설명', aliases: ['설명', '메모', '특이사항', '비고'], width: 40, ex: '드라이브인, 코너 호실' },
]
const EX_MARK = '예)'

// 이름 비교용: 띄어쓰기·기호 빼고, 로마숫자를 숫자로
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/ⅰ/g, '1').replace(/ⅱ|ii(?![a-z])/g, '2').replace(/ⅲ|iii/g, '3').replace(/ⅳ/g, '4').replace(/ⅴ/g, '5')
    .replace(/지식산업센터|아파트형공장|knowledge industry center/g, '')
    .replace(/[\s()\[\]·.,\-_'"~]/g, '')
}
// "3억 5,000" / "35000" / "3.5억" → 원
function parsePrice(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Math.round(v * 1e4)
  const s = String(v).replace(/[,\s원]/g, '')
  const m = s.match(/^(?:(\d+(?:\.\d+)?)억)?(\d+)?만?$/)
  if (!m) return null
  const eok = m[1] ? Number(m[1]) * 1e8 : 0
  const man = m[2] ? Number(m[2]) * 1e4 : 0
  return eok + man || null
}
function parseFloor(v) {
  if (v == null || v === '') return null
  const s = String(v).toUpperCase().replace(/\s|층|F/g, '')
  const b = s.match(/^(?:B|지하)(\d+)$/)
  if (b) return -Number(b[1])
  const n = parseInt(s, 10)
  return Number.isNaN(n) ? null : n
}
const toNum = (v) => (v == null || v === '' ? null : Number(String(v).replace(/[^\d.]/g, '')) || null)

export default function ExcelImport({ onDone, fixedAgentId = null }) {
  const [agents, setAgents] = useState([])
  const [agentId, setAgentId] = useState(fixedAgentId ? String(fixedAgentId) : '')
  const [newAgent, setNewAgent] = useState(null)
  const [buildings, setBuildings] = useState([])
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [batch, setBatch] = useState('')
  const [confirmed, setConfirmed] = useState(new Date().toISOString().slice(0, 10))

  async function loadAgents() {
    const { data } = await supabase.from('agents').select('id, office_name, representative, office_phone, status').eq('status', 'approved').order('office_name')
    setAgents(data || [])
  }
  useEffect(() => {
    if (!fixedAgentId) loadAgents()
    // 건물 목록 (1000개씩 나눠서)
    ;(async () => {
      const all = []
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('buildings').select('id, name, address, umd_nm, jibun, district').range(from, from + 999)
        all.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      setBuildings(all)
    })()
  }, [])

  const index = useMemo(() => buildings.map((b) => ({ ...b, n: norm(b.name) })), [buildings])

  // 건물 찾기: 이름 같음 → 이름 포함 → 주소(동+지번, 도로명)
  function match(r) {
    const n = norm(r.building)
    const exact = n ? index.filter((b) => b.n === n) : []
    if (exact.length === 1) return { id: exact[0].id, how: '이름 일치' }
    const addr = String(r.address || '').replace(/\s+/g, ' ').trim()
    const lot = addr.match(/(\S+(?:동|가|리))\s+(?:산\s*)?(\d+(?:-\d+)?)/)
    if (lot) {
      const hit = index.filter((b) => b.umd_nm === lot[1] && b.jibun === lot[2])
      if (hit.length === 1) return { id: hit[0].id, how: '지번 일치' }
    }
    if (addr) {
      const road = index.filter((b) => b.address && addr.length > 6 && (b.address.includes(addr) || addr.includes(b.address.replace(/\s*\(.*\)$/, ''))))
      if (road.length === 1) return { id: road[0].id, how: '주소 일치' }
    }
    const part = n && n.length >= 3 ? index.filter((b) => b.n && (b.n.includes(n) || n.includes(b.n))) : []
    if (exact.length > 1 || part.length) return { id: '', how: '확인 필요', cands: (exact.length ? exact : part).slice(0, 8) }
    return { id: '', how: '못 찾음', cands: [] }
  }

  async function downloadTemplate() {
    const { default: writeXlsxFile } = await import('write-excel-file')
    const head = COLS.map((c) => ({ value: c.label, fontWeight: 'bold', backgroundColor: '#E8F0FD' }))
    const ex = COLS.map((c, i) => ({ value: i === 0 ? `${EX_MARK} ${c.ex}` : c.ex === '' ? null : c.ex, color: '#8B95A1' }))
    await writeXlsxFile([head, ex], { columns: COLS.map((c) => ({ width: c.width })), fileName: '지산맵_매물_일괄등록_양식.xlsx', sheet: '매물' })
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg(''); setRows([])
    try {
      const { default: readXlsxFile } = await import('read-excel-file')
      const sheet = await readXlsxFile(file)
      const hi = sheet.findIndex((r) => r.some((c) => COLS[0].aliases.includes(String(c || '').trim())))
      if (hi < 0) return setMsg('⚠ 첫 줄에서 "건물명" 칸을 찾지 못했어요. [양식 받기]로 받은 파일에 채워 주세요.')
      const head = sheet[hi].map((c) => String(c || '').trim())
      const col = Object.fromEntries(COLS.map((c) => [c.key, head.findIndex((h) => c.aliases.includes(h))]))
      const out = []
      sheet.slice(hi + 1).forEach((r, i) => {
        const get = (k) => (col[k] >= 0 ? r[col[k]] : null)
        const building = String(get('building') ?? '').trim()
        if (!building || building.startsWith(EX_MARK)) return // 빈 줄·예시 줄은 건너뜀
        const m2 = toNum(get('m2')) || (toNum(get('py')) ? Math.round(toNum(get('py')) * 3.3058 * 100) / 100 : null)
        const row = {
          line: hi + i + 2, building, address: String(get('address') ?? '').trim(), unit: String(get('unit') ?? '').trim(),
          floor: parseFloor(get('floor')), m2, price: parsePrice(get('price')),
          mgmt: parsePrice(get('mgmt')), movein: String(get('movein') ?? '').trim(), desc: String(get('desc') ?? '').trim(),
        }
        row.errors = [!row.m2 && '면적', !row.price && '매매가'].filter(Boolean)
        Object.assign(row, match(row))
        out.push(row)
      })
      if (!out.length) return setMsg('⚠ 등록할 줄이 없어요 (예시 줄은 빼고 읽어요)')
      // 이미 올라온 같은 매물(같은 건물·면적·층) 표시
      const ids = [...new Set(out.map((r) => r.id).filter(Boolean))]
      if (ids.length) {
        const { data: ex } = await supabase.from('listings').select('building_id, area_m2, listing_details(floor)').in('building_id', ids).eq('status', 'active')
        for (const r of out) r.dup = (ex || []).some((x) => x.building_id === r.id && Math.abs(Number(x.area_m2) - r.m2) < 0.5 && ((Array.isArray(x.listing_details) ? x.listing_details[0]?.floor : x.listing_details?.floor) ?? null) === r.floor)
      }
      setRows(out.map((r) => ({ ...r, use: !r.errors.length && !r.dup })))
      setBatch(`${file.name.replace(/\.xlsx?$/i, '')} (${new Date().toLocaleDateString('ko-KR')})`)
    } catch (err) {
      setMsg('⚠ 파일을 읽지 못했어요: ' + err.message + ' — 엑셀(.xlsx) 파일인지 확인해 주세요')
    }
  }

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const ready = rows.filter((r) => r.use && r.id && !r.errors.length)

  async function saveAgent() {
    const a = newAgent
    if (!a.office_name || !a.representative || !a.registration_no || !a.office_phone || !a.office_address)
      return setMsg('⚠ 중개사무소 5칸을 모두 채워 주세요 (인터넷 매물 광고에 꼭 표시해야 하는 정보예요)')
    const { data, error } = await supabase.from('agents').insert({ ...a, status: 'approved', source: 'offline', approved_at: new Date().toISOString() }).select('id').single()
    if (error) return setMsg('⚠ 중개사무소 등록 실패: ' + error.message)
    await loadAgents(); setAgentId(String(data.id)); setNewAgent(null); setMsg('✅ 중개사무소를 등록했어요')
  }

  async function register() {
    if (!agentId) return setMsg('⚠ 맨 위에서 중개사무소를 먼저 골라 주세요')
    if (!ready.length) return setMsg('⚠ 등록할 매물이 없어요')
    if (!window.confirm(`매물 ${ready.length}건을 등록할까요?\n등록하면 바로 지도와 매물 목록에 나와요.`)) return
    setBusy(true)
    let ok = 0
    const fail = []
    for (const [k, r] of ready.entries()) {
      setMsg(`등록 중… ${k + 1} / ${ready.length}`)
      const b = buildings.find((x) => x.id === Number(r.id))
      const title = [r.floor != null && `${r.floor < 0 ? 'B' + -r.floor : r.floor}층`, pyeong(r.m2), r.desc && r.desc.slice(0, 20)].filter(Boolean).join(' · ')
      const { data, error } = await supabase.from('listings').insert({
        building_id: Number(r.id), deal_type: '매매', title: title || `${b?.name} 매매`, area_m2: r.m2,
        asking_price_krw: r.price, price_range: wonShort(r.price), status: 'active',
        agent_id: Number(agentId), import_batch: batch || null, confirmed_at: confirmed || null,
      }).select('id').single()
      if (error) { fail.push(`${r.line}줄`); continue }
      await supabase.from('listing_details').upsert({
        listing_id: data.id, unit_no: r.unit || null, floor: r.floor, price_krw: r.price,
        maintenance_fee_krw: r.mgmt, description: r.desc || null, move_in: r.movein || null,
      })
      ok++
    }
    setBusy(false)
    setMsg(`✅ ${ok}건 등록 완료` + (fail.length ? ` · ⚠ ${fail.length}건 실패 (${fail.join(', ')})` : ''))
    setRows([])
    onDone?.()
  }

  const agentOpts = agents.map((a) => <option key={a.id} value={a.id}>{a.office_name} · {a.representative}</option>)
  return (
    <div className="excel-import">
      <h3>📥 엑셀로 매물 한꺼번에 등록</h3>
      <p className="muted small">{fixedAgentId ? '매물 목록 엑셀을 올리면 건물을 자동으로 찾아 내 매물로 한꺼번에 등록해요.' : '중개사에게 받은 매물 목록을 올리면 건물을 자동으로 찾아 연결해요. 한 파일 = 한 중개사무소 기준이에요.'}</p>

      {!fixedAgentId && <div className="ei-step"><b>1</b> 중개사무소 고르기
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">선택하세요</option>{agentOpts}
        </select>
        <button className="btn white sm" onClick={() => setNewAgent(newAgent ? null : { office_name: '', representative: '', registration_no: '', office_phone: '', office_address: '' })}>+ 새 중개사무소</button>
      </div>}
      {newAgent && (
        <div className="ei-agent">
          {[['office_name', '사무소 이름'], ['representative', '대표 공인중개사'], ['registration_no', '중개사무소 등록번호'], ['office_phone', '대표 전화'], ['office_address', '사무소 주소']].map(([k, l]) => (
            <label key={k}>{l}<input value={newAgent[k]} onChange={(e) => setNewAgent({ ...newAgent, [k]: e.target.value })} /></label>
          ))}
          <button className="btn primary sm" onClick={saveAgent}>중개사무소 저장</button>
        </div>
      )}

      <div className="ei-step"><b>{fixedAgentId ? 1 : 2}</b> 양식 받아서 채우기 <button className="btn white sm" onClick={downloadTemplate}>📄 양식 받기 (.xlsx)</button>
        <span className="muted small">회색 예시 줄은 그대로 둬도 자동으로 빼고 읽어요</span></div>

      <div className="ei-step"><b>{fixedAgentId ? 2 : 3}</b> 채운 파일 올리기 <label className="btn primary sm file-btn">📂 파일 고르기<input type="file" accept=".xlsx" onChange={onFile} hidden /></label>
        <label className="small">확인일 <input type="date" value={confirmed} onChange={(e) => setConfirmed(e.target.value)} /></label></div>

      {msg && <p className={msg.startsWith('⚠') ? 'molit-note err' : 'molit-note'}>{msg}</p>}

      {rows.length > 0 && (
        <>
          <p className="small"><b>{fixedAgentId ? 3 : 4}</b> 건물 연결 확인 — 전체 {rows.length}줄 · 등록 예정 <b>{ready.length}건</b>
            {rows.some((r) => !r.id) && <span className="muted"> · '확인 필요/못 찾음'은 오른쪽에서 건물을 골라 주세요</span>}</p>
          <div className="ei-table-wrap">
            <table className="atable static">
              <thead><tr><th></th><th>줄</th><th>엑셀 건물명</th><th>연결된 건물</th><th>층·면적</th><th>매매가</th><th>상태</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={!r.use ? 'off' : ''}>
                    <td><input type="checkbox" checked={r.use} disabled={!!r.errors.length} onChange={(e) => setRow(i, { use: e.target.checked })} /></td>
                    <td className="muted">{r.line}</td>
                    <td><b>{r.building}</b>{r.address && <div className="sub">{r.address}</div>}</td>
                    <td>
                      {r.id && r.how !== '직접 선택' ? <>{buildings.find((b) => b.id === Number(r.id))?.name}<div className="sub">✅ {r.how}</div></> : (
                        <BuildingPick value={r.id} cands={r.cands} buildings={index} onPick={(id) => setRow(i, { id, how: '직접 선택' })} />
                      )}
                    </td>
                    <td className="nowrap">{r.floor != null ? `${r.floor}층` : '-'} · {r.m2 ? `${r.m2}㎡` : '-'}</td>
                    <td className="nowrap">{r.price ? won(r.price) : '-'}</td>
                    <td className="small">{r.errors.length ? <span className="err">⚠ {r.errors.join('·')} 없음</span> : r.dup ? <span className="muted">이미 있는 매물</span> : r.id ? '등록 가능' : '건물 선택 필요'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="molit-bulk">
            <label className="small">묶음 이름 <input value={batch} onChange={(e) => setBatch(e.target.value)} style={{ width: 240 }} /></label>
            <button className="btn primary" disabled={busy || !ready.length} onClick={register}>✅ 매물 {ready.length}건 등록</button>
          </div>
        </>
      )}
    </div>
  )
}

// 건물 고르기: 후보 + 이름 검색
function BuildingPick({ value, cands, buildings, onPick }) {
  const [q, setQ] = useState('')
  const hits = q.length >= 2 ? buildings.filter((b) => b.n.includes(norm(q)) || (b.address || '').includes(q)).slice(0, 20) : []
  const opts = [...(cands || []), ...hits.filter((h) => !(cands || []).some((c) => c.id === h.id))]
  return (
    <div className="bpick">
      <input placeholder="건물명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={value || ''} onChange={(e) => onPick(e.target.value)}>
        <option value="">{opts.length ? `후보 ${opts.length}곳 중 선택` : '검색해서 고르세요'}</option>
        {opts.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.district}</option>)}
      </select>
    </div>
  )
}
