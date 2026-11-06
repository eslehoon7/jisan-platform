// 국토부 실거래 자동 수집 (상업업무용 + 공장·창고 등) — 지산맵
// 호출: (1) 매일 새벽 크론 { token }  (2) 관리자 화면 [지금 수집] (관리자 로그인 토큰)
// body: { months?: 1~36 (기본 2), offset?: 건너뛸 최근 개월 수, apis?: ["nrg","indu"], action?: "probe", api?: "nrg"|"indu" }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// 수집 대상 구: 성동구(성수) · 영등포구(문래·양평) · 송파구(문정)
const SGG = ["11200", "11560", "11710"];
// 두 가지 자료: 상업업무용(근생·업무·판매) + 공장·창고 등(지식산업센터 호실 대부분이 '공장' 용도)
const APIS: Record<string, string> = {
  nrg: "https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade",
  indu: "https://apis.data.go.kr/1613000/RTMSDataSvcInduTrade/getRTMSDataSvcInduTrade",
};

function serviceKey() {
  const raw = (Deno.env.get("MOLIT_SERVICE_KEY") || Deno.env.get("NTS_SERVICE_KEY") || "").trim();
  if (!raw) throw new Error("공공데이터포털 인증키가 설정되지 않았어요");
  const decoded = /%[0-9A-Fa-f]{2}/.test(raw) ? decodeURIComponent(raw) : raw;
  return encodeURIComponent(decoded);
}

// 한국시간 기준 최근 n개월 (YYYYMM)
function recentMonths(n: number) {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// XML → 항목 목록 (태그 이름 그대로)
function parseXml(xml: string) {
  const code = xml.match(/<resultCode>([^<]*)<\/resultCode>/)?.[1]?.trim() ?? "";
  const msg = xml.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1]?.trim() ?? "";
  const total = Number(xml.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? 0);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const o: Record<string, string> = {};
    for (const t of m[1].matchAll(/<([^\/>\s]+)>([^<]*)<\/\1>/g)) o[t[1]] = t[2].trim();
    return o;
  });
  return { code, msg, total, items };
}

const pick = (o: Record<string, string>, ...keys: string[]) => { for (const k of keys) if (o[k] !== undefined && o[k] !== "") return o[k]; return ""; };
const num = (v: string) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && v !== "" ? n : null; };

function toRow(sgg: string, o: Record<string, string>, dataset: string) {
  const y = pick(o, "dealYear", "년"), m = pick(o, "dealMonth", "월"), d = pick(o, "dealDay", "일");
  const man = num(pick(o, "dealAmount", "거래금액"));
  if (!y || !m || !d || man == null) return null;
  const deal_date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const cancelFlag = pick(o, "cdealType", "해제여부");
  const cdd = pick(o, "cdealDay", "해제사유발생일");
  const row = {
    sgg_cd: pick(o, "sggCd", "지역코드") || sgg,
    sgg_nm: pick(o, "sggNm", "시군구") || null,
    umd_nm: pick(o, "umdNm", "법정동") || null,
    jibun: pick(o, "jibun", "지번") || null,
    building_type: pick(o, "buildingType", "유형", "건물유형") || null,
    building_use: pick(o, "buildingUse", "건물주용도") || null,
    land_use: pick(o, "landUse", "용도지역") || null,
    area_m2: num(pick(o, "buildingAr", "건물면적")),
    plottage_m2: num(pick(o, "plottageAr", "대지면적")),
    price_krw: Math.round(man * 10000),
    deal_date,
    floor: num(pick(o, "floor", "층")),
    build_year: num(pick(o, "buildYear", "건축년도")),
    dealing_gbn: pick(o, "dealingGbn", "거래유형") || null,
    canceled: cancelFlag === "O",
    cancel_date: /^\d{2}\.\d{2}\.\d{2}$/.test(cdd) ? `20${cdd.replace(/\./g, "-")}` : null,
    share_dealing: pick(o, "shareDealingType", "지분거래구분") || null,
    dataset,
    raw: o,
  };
  return {
    ...row,
    trade_key: (dataset === "nrg" ? "" : dataset + ":") + [row.sgg_cd, row.umd_nm, row.jibun, deal_date, row.price_krw, row.area_m2, row.floor, row.build_year, row.building_type].join("|"),
  };
}

async function fetchMonth(api: string, sgg: string, ym: string, key: string) {
  const all: Record<string, string>[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${APIS[api]}?serviceKey=${key}&LAWD_CD=${sgg}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=1000`;
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) throw new Error(`국토부 응답 오류 ${res.status}: ${text.replace(/<[^>]+>/g, " ").trim().slice(0, 150)}`);
    const p = parseXml(text);
    if (p.code && !["00", "000"].includes(p.code)) throw new Error(`국토부 오류 ${p.code}: ${p.msg}`);
    if (!p.code && !p.items.length && /SERVICE|ERROR|KEY/i.test(text)) throw new Error(`국토부 오류: ${text.replace(/<[^>]+>/g, " ").trim().slice(0, 150)}`);
    all.push(...p.items);
    if (all.length >= p.total || p.items.length === 0) break;
  }
  return all;
}

async function isAdmin(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token.split(".").length !== 3) return false;
  const { data } = await db.auth.getUser(token);
  if (!data?.user) return false;
  const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return p?.role === "admin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any = {};
  try { body = await req.json(); } catch { /* 빈 요청 허용 */ }

  // ── 호출자 확인 ──
  let trigger = "";
  if (body.token) {
    const { data } = await db.rpc("molit_check_token", { p_token: String(body.token) });
    if (data === true) trigger = "cron";
  }
  if (!trigger && (await isAdmin(req))) trigger = "manual";
  if (!trigger) return json({ error: "권한이 없어요" }, 401);

  try {
    const key = serviceKey();

    // ── 진단: 첫 페이지 항목 모양만 확인 ──
    if (body.action === "probe") {
      const ym = recentMonths(2)[1];
      const api = APIS[body.api] ? body.api : "nrg";
      const res = await fetch(`${APIS[api]}?serviceKey=${key}&LAWD_CD=11200&DEAL_YMD=${ym}&pageNo=1&numOfRows=3`);
      const text = await res.text();
      const p = parseXml(text);
      return json({ api, http: res.status, ym, code: p.code, msg: p.msg, total: p.total, fields: p.items[0] ? Object.keys(p.items[0]) : [], sample: p.items[0] ?? null, head: p.items.length ? undefined : text.slice(0, 300) });
    }

    // offset: 최근 몇 개월을 건너뛰고 그 이전부터 가져올지 (과거 자료를 나눠 받을 때 사용)
    const offset = Math.min(Math.max(Number(body.offset) || 0, 0), 120);
    const months = recentMonths(offset + Math.min(Math.max(Number(body.months) || 2, 1), 36)).slice(offset);
    const { data: run } = await db.from("molit_sync_runs")
      .insert({ trigger, months: `${months[months.length - 1]}~${months[0]}` }).select("id").single();

    const countAll = async () => (await db.from("molit_trades").select("id", { count: "exact", head: true })).count ?? 0;
    const before = await countAll();
    let fetched = 0, canceled = 0, upserted = 0;
    const errors: string[] = [];
    const apis = Array.isArray(body.apis) ? body.apis.filter((a: string) => APIS[a]) : Object.keys(APIS);
    const blocked = new Set<string>(); // 활용신청이 안 된 자료는 첫 오류 후 건너뜀
    for (const api of apis) for (const sgg of SGG) {
      for (const ym of months) {
        if (blocked.has(api)) break;
        try {
          const items = await fetchMonth(api, sgg, ym, key);
          fetched += items.length;
          const rows = items.map((o) => toRow(sgg, o, api)).filter(Boolean) as any[];
          // 같은 날·같은 조건 거래가 여러 건이면(한 건물 여러 호실 동시 매매) 순번을 붙여 모두 보존
          const seen = new Map<string, number>();
          const uniq = rows.map((r) => {
            const n = (seen.get(r.trade_key) || 0) + 1;
            seen.set(r.trade_key, n);
            return n === 1 ? r : { ...r, trade_key: `${r.trade_key}#${n}` };
          });
          canceled += uniq.filter((r) => r.canceled).length;
          for (let i = 0; i < uniq.length; i += 500) {
            const { error, count } = await db.from("molit_trades")
              .upsert(uniq.slice(i, i + 500).map((r) => ({ ...r, fetched_at: new Date().toISOString() })), { onConflict: "trade_key", count: "exact" });
            if (error) throw error;
            upserted += count ?? 0;
          }
        } catch (e) {
          if (/SERVICE.?KEY|NOT.?REGISTERED|등록되지|권한|\b(401|403)\b/i.test((e as Error).message)) blocked.add(api);
          errors.push(`${api === "nrg" ? "상업업무" : "공장창고"} ${sgg}/${ym}: ${(e as Error).message}`);
        }
      }
    }

    const { data: matched } = await db.rpc("molit_after_sync");
    const added = (await countAll()) - before; // 새로 쌓인 거래 수
    const status = errors.length ? (fetched ? "ok" : "error") : "ok";
    await db.from("molit_sync_runs").update({
      finished_at: new Date().toISOString(), fetched, inserted: added, canceled, matched: matched ?? 0,
      status, error: errors.length ? errors.slice(0, 10).join(" / ") : null,
    }).eq("id", run!.id);

    return json({ ok: status === "ok", months: months.length, fetched, upserted, added, canceled, matched: matched ?? 0, errors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
