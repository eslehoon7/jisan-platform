import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { won, pyeong, m2, priceLabel } from '../lib/format'
import Locked from './Locked'

function AgentInfo({ listingId }) {
  const [a, setA] = useState(undefined)
  useEffect(() => {
    supabase.rpc('listing_agent_info', { p_listing_id: listingId }).then(({ data }) => setA(data?.[0] || null))
  }, [listingId])
  if (a === undefined) return null
  if (!a) return <p className="agent muted">중개사 정보 없음</p>
  // 법정 표시사항: 비회원에게도 공개
  return (
    <p className="agent">
      {a.office_name} · 대표 {a.representative} · 등록번호 {a.registration_no}<br />
      {a.office_address} · {a.office_phone}
    </p>
  )
}

export default function Listings({ buildingId, dealType, session, onLogin }) {
  const [items, setItems] = useState(null)
  useEffect(() => {
    setItems(null)
    const cols = session
      ? 'id, deal_type, title, area_m2, price_range, asking_price_krw, auction_first_price_krw, auction_current_price_krw, auction_round, auction_case_no, auction_court, auction_sale_date, listing_details(unit_no, floor, price_krw, deposit_krw, monthly_rent_krw, maintenance_fee_krw, description)'
      : 'id, deal_type, title, area_m2, price_range, asking_price_krw, auction_first_price_krw, auction_current_price_krw, auction_round, auction_case_no, auction_court, auction_sale_date'
    supabase.from('listings').select(cols).eq('building_id', buildingId).eq('status', 'active')
      // 선택한 거래유형(매매·경매·분양)을 먼저 보여주기
      .order('created_at', { ascending: false })
      .then(({ data }) => setItems((data || []).sort((a, b) => (b.deal_type === dealType) - (a.deal_type === dealType))))
  }, [buildingId, session, dealType])

  if (!items) return <p className="muted">불러오는 중…</p>
  if (!items.length)
    return (
      <div className="empty">
        <p>아직 등록된 물건이 없어요.</p>
        <p className="muted">입점 중개사가 매물을 등록하면 여기에 표시돼요.</p>
      </div>
    )

  return (
    <ul className="list">
      {items.map((l) => {
        const d = Array.isArray(l.listing_details) ? l.listing_details[0] : l.listing_details
        return (
          <li key={l.id} className="listing">
            <div className="listing-top">
              <span className={`deal ${l.deal_type}`}>{l.deal_type}</span>
              <strong>{l.title}</strong>
            </div>
            {l.deal_type === '경매' ? (
              <div className="auction-prices">
                <div><span>1차 경매가</span><strong>{won(l.auction_first_price_krw)}</strong></div>
                <div><span>현재 경매가{l.auction_round ? ` (${l.auction_round}차)` : ''}</span><strong className="down">{won(l.auction_current_price_krw)}</strong></div>
                {l.auction_sale_date && <div><span>매각기일</span><strong>{l.auction_sale_date}</strong></div>}
                {l.auction_case_no && <div className="auction-case"><span>{l.auction_court || '법원'}</span><strong>{l.auction_case_no}</strong></div>}
                <em>{m2(l.area_m2)} ({pyeong(l.area_m2)})</em>
              </div>
            ) : (
              <div className="listing-price"><span>{priceLabel(l.deal_type)}</span><strong>{l.asking_price_krw ? won(l.asking_price_krw) : l.price_range}</strong><em>{m2(l.area_m2)} ({pyeong(l.area_m2)})</em></div>
            )}
            {session ? (
              d && (
                <dl className="facts small">
                  <div><dt>호실/층</dt><dd>{d.unit_no || '-'} / {d.floor ? `${d.floor}층` : '-'}</dd></div>
                  <div><dt>가격</dt><dd>{d.price_krw ? won(d.price_krw) : `보증금 ${won(d.deposit_krw)} / 월 ${won(d.monthly_rent_krw)}`}</dd></div>
                  <div><dt>관리비</dt><dd>{won(d.maintenance_fee_krw)}</dd></div>
                </dl>
              )
            ) : (
              <Locked title="호실·층·관리비 등 상세정보는 회원 전용이에요" onLogin={onLogin}>
                <dl className="facts small"><div><dt>호실/층</dt><dd>000호 / 0층</dd></div><div><dt>가격</dt><dd>00억 0,000만</dd></div></dl>
              </Locked>
            )}
            <AgentInfo listingId={l.id} />
          </li>
        )
      })}
    </ul>
  )
}
