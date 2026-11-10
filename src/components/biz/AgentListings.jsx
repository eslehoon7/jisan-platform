import { useState } from 'react'
import ListingsAdmin from '../admin/ListingsAdmin'
import ExcelImport from '../admin/ExcelImport'

// 중개사 '내 매물' 화면: 한 건씩 등록 + 엑셀로 한꺼번에 등록
export default function AgentListings({ agentId, bizType }) {
  const [showImport, setShowImport] = useState(false)
  const [k, setK] = useState(0)
  return (
    <>
      <div className="ei-toggle">
        <button className={showImport ? 'btn dark sm' : 'btn white sm'} onClick={() => setShowImport(!showImport)}>📥 엑셀로 한꺼번에 등록 {showImport ? '닫기' : '열기'}</button>
      </div>
      {showImport && <ExcelImport fixedAgentId={agentId} onDone={() => setK((x) => x + 1)} />}
      <ListingsAdmin key={k} agentId={agentId} allowedTypes={bizType === '분양대행' ? ['분양'] : ['매매', '임대', '분양']} />
    </>
  )
}
