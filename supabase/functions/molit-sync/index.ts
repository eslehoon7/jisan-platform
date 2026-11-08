// 국토부 실거래 자동 수집 (공장·창고 등 + 상업업무용) — 지산맵
// 서울·경기·인천 전 지역을 '작업 대기열(molit_jobs)'로 나눠 1분마다 조금씩 처리
//
// 호출
//  - { token, action: 'work' }               : 대기열에서 작업을 꺼내 처리 (1분마다 크론)
//  - { token, action: 'enqueue', months, offset?, sgg? } : 대기열에 넣기 (매일 새벽 / 과거 자료)
//  - { token, action: 'sggcheck', codes }    : 시군구 코드가 맞는지 국토부 응답으로 확인
//  - { token, action: 'probe', api?, sgg? }  : 응답 모양 확인
//  관리자 화면은 token 대신 관리자 로그인 토큰으로 호출
//
// 저장 기준 (무료 저장공간 절약 + 지산만 필요)
//  - 공장·창고(indu): 집합건물만 (지식산업센터 호실은 대부분 '공장' 용도)
//  - 상업업무(nrg): 집합건물 중 '지산 관련 지번'(공식 지산 목록·등록 건물·공장 거래가 있는 지번)만
//    지번이 가려진 옛 자료(예: 6**)는 지산이 있는 법정동이면 보관
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const APIS: Record<string, string> = {
  indu: "https://apis.data.go.kr/1613000/RTMSDataSvcInduTrade/getRTMSDataSvcInduTrade",
  nrg: "https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade",
};
const JOBS_PER_RUN = 12; // 한 번에 처리할 (시군구, 월) 개수 — 150초 제한 안에서 여유 있게

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
  const y = pick(o, "dealYear"), m = pick(o, "dealMonth"), d = pick(o, "dealDay");
  const man = num(pick(o, "dealAmount"));
  if (!y || !m || !d || man == null) return null;
  const deal_date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const cdd = pick(o, "cdealDay");
  const row = {
    sgg_cd: pick(o, "sggCd") || sgg,
    sgg_nm: pick(o, "sggNm") || null,
    umd_nm: pick(o, "umdNm") || null,
    jibun: pick(o, "jibun") || null,
    building_type: pick(o, "buildingType") || null,
    building_use: pick(o, "buildingUse") || null,
    land_use: pick(o, "landUse") || null,
    area_m2: num(pick(o, "buildingAr")),
    plottage_m2: num(pick(o, "plottageAr")),
    price_krw: Math.round(man * 10000),
    deal_date,
    floor: num(pick(o, "floor")),
    build_year: num(pick(o, "buildYear")),
    dealing_gbn: pick(o, "dealingGbn") || null,
    canceled: pick(o, "cdealType") === "O",
    cancel_date: /^\d{2}\.\d{2}\.\d{2}$/.test(cdd) ? `20${cdd.replace(/\./g, "-")}` : null,
    share_dealing: pick(o, "shareDealingType") || null,
    dataset,
    raw: null,
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
    let text = "", status = 0;
    for (let t = 0; t < 3; t++) { // 잠깐 거절되면 쉬었다가 다시
      const res = await fetch(url);
      status = res.status; text = await res.text();
      if (res.ok && !/LIMITED_NUMBER|TOO_MANY/i.test(text)) break;
      await new Promise((r) => setTimeout(r, 800 * (t + 1)));
    }
    if (status >= 400) throw new Error(`국토부 응답 오류 ${status}: ${text.replace(/<[^>]+>/g, " ").trim().slice(0, 150)}`);
    const p = parseXml(text);
    if (p.code && !["00", "000"].includes(p.code)) throw new Error(`국토부 오류 ${p.code}: ${p.msg}`);
    if (!p.code && !p.items.length && /SERVICE|ERROR|KEY|LIMITED/i.test(text)) throw new Error(`국토부 오류: ${text.replace(/<[^>]+>/g, " ").trim().slice(0, 150)}`);
    all.push(...p.items);
    if (all.length >= p.total || p.items.length === 0) break;
  }
  return all;
}

// 같은 날·같은 조건 여러 호실 동시 거래 → 순번을 붙여 모두 보존
function withSeq(rows: any[]) {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const n = (seen.get(r.trade_key) || 0) + 1;
    seen.set(r.trade_key, n);
    return n === 1 ? r : { ...r, trade_key: `${r.trade_key}#${n}` };
  });
}

async function upsertRows(rows: any[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("molit_trades")
      .upsert(rows.slice(i, i + 500).map((r) => ({ ...r, fetched_at: new Date().toISOString() })), { onConflict: "trade_key" });
    if (error) throw error;
  }
}

// 시군구별 '지산 관련 지번' (공식 목록 + 등록 건물 + 공장 거래 지번)
async function jisanLots(sgg: string) {
  const { data, error } = await db.rpc("molit_jisan_lots", { p_sgg: sgg });
  if (error) throw error;
  const lots = new Set<string>(), umds = new Set<string>();
  for (const r of data || []) { lots.add(`${r.umd_nm}|${r.jibun}`); umds.add(r.umd_nm); }
  return { lots, umds };
}

// (시군구, 월) 하나 처리
async function runJob(sgg: string, ym: string, key: string, cache: Map<string, any>) {
  let kept = 0, fetched = 0;
  // 1) 공장·창고: 집합건물만
  const indu = await fetchMonth("indu", sgg, ym, key);
  fetched += indu.length;
  const induRows = withSeq(indu.map((o) => toRow(sgg, o, "indu")).filter((r: any) => r && r.building_type === "집합"));
  await upsertRows(induRows);
  kept += induRows.length;

  // 2) 상업업무: 지산 관련 지번만
  if (!cache.has(sgg)) cache.set(sgg, await jisanLots(sgg));
  const set = cache.get(sgg);
  for (const r of induRows) if (r.jibun && !r.jibun.includes("*")) { set.lots.add(`${r.umd_nm}|${r.jibun}`); set.umds.add(r.umd_nm); }
  const nrg = await fetchMonth("nrg", sgg, ym, key);
  fetched += nrg.length;
  const nrgRows = withSeq(nrg.map((o) => toRow(sgg, o, "nrg")).filter((r: any) => {
    if (!r || r.building_type !== "집합" || !r.jibun) return false;
    return r.jibun.includes("*") ? set.umds.has(r.umd_nm) : set.lots.has(`${r.umd_nm}|${r.jibun}`);
  }));
  await upsertRows(nrgRows);
  kept += nrgRows.length;
  return { fetched, kept, canceled: [...induRows, ...nrgRows].filter((r) => r.canceled).length };
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
  try { body = await req.json(); } catch { /* 빈 요청 */ }

  let trigger = "";
  if (body.token) {
    const { data } = await db.rpc("molit_check_token", { p_token: String(body.token) });
    if (data === true) trigger = "cron";
  }
  if (!trigger && (await isAdmin(req))) trigger = "manual";
  if (!trigger) return json({ error: "권한이 없어요" }, 401);

  try {
    const key = serviceKey();
    const action = body.action || (body.months ? "enqueue" : "work");

    if (action === "probe") {
      const ym = recentMonths(2)[1];
      const api = APIS[body.api] ? body.api : "nrg";
      const res = await fetch(`${APIS[api]}?serviceKey=${key}&LAWD_CD=${body.sgg || "11200"}&DEAL_YMD=${ym}&pageNo=1&numOfRows=3`);
      const text = await res.text();
      const p = parseXml(text);
      return json({ api, http: res.status, ym, code: p.code, msg: p.msg, total: p.total, sample: p.items[0] ?? null });
    }

    // 시군구 코드 확인: 최근 몇 달 중 거래가 있는 달의 시군구 이름을 돌려줌
    if (action === "sggcheck") {
      const out: any[] = [];
      for (const c of (body.codes || []).slice(0, 40)) {
        let nm = "", total = 0;
        for (const ym of recentMonths(6)) {
          for (const api of ["nrg", "indu"]) {
            const res = await fetch(`${APIS[api]}?serviceKey=${key}&LAWD_CD=${c}&DEAL_YMD=${ym}&pageNo=1&numOfRows=1`);
            const p = parseXml(await res.text());
            total += p.total;
            if (p.items[0]?.sggNm) { nm = p.items[0].sggNm; break; }
          }
          if (nm) break;
        }
        out.push({ code: c, sggNm: nm || null, total });
        if (nm) await db.from("molit_regions").update({ verified_nm: nm }).eq("sgg_cd", c);
      }
      return json({ ok: true, results: out });
    }

    // 대기열에 넣기: 최근 months개월 (offset개월 건너뛰고)
    if (action === "enqueue") {
      const offset = Math.min(Math.max(Number(body.offset) || 0, 0), 120);
      const months = recentMonths(offset + Math.min(Math.max(Number(body.months) || 2, 1), 72)).slice(offset);
      let sggs: string[] = Array.isArray(body.sgg) ? body.sgg : [];
      if (!sggs.length) {
        const { data } = await db.from("molit_regions").select("sgg_cd").eq("enabled", true);
        sggs = (data || []).map((r: any) => r.sgg_cd);
      }
      const rows = sggs.flatMap((s) => months.map((ym) => ({ sgg_cd: s, ym, priority: Number(body.priority) || 0, status: "queued", tries: 0, error: null })));
      for (let i = 0; i < rows.length; i += 1000) {
        const { error } = await db.from("molit_jobs").upsert(rows.slice(i, i + 1000), { onConflict: "sgg_cd,ym", ignoreDuplicates: false });
        if (error) throw error;
      }
      return json({ ok: true, queued: rows.length, regions: sggs.length, months: months.length });
    }

    // 작업 처리
    const { data: jobs, error: ce } = await db.rpc("molit_claim_jobs", { p_n: Number(body.n) || JOBS_PER_RUN });
    if (ce) throw ce;
    if (!jobs?.length) return json({ ok: true, done: 0, message: "대기 중인 작업 없음" });
    const started = new Date().toISOString();
    const cache = new Map<string, any>();
    let fetched = 0, kept = 0, canceled = 0;
    const errors: string[] = [];
    for (const j of jobs) {
      try {
        const r = await runJob(j.sgg_cd, j.ym, key, cache);
        fetched += r.fetched; kept += r.kept; canceled += r.canceled;
        await db.from("molit_jobs").update({ status: "done", done_at: new Date().toISOString(), fetched: r.fetched, kept: r.kept, error: null }).eq("id", j.id);
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`${j.sgg_cd}/${j.ym}: ${msg}`);
        // 하루 사용 한도 초과면 다시 대기열로 (다음 날 이어서)
        const limited = /LIMITED_NUMBER|오류 22:|EXCEEDS/i.test(msg);
        await db.from("molit_jobs").update({ status: limited || j.tries < 3 ? "queued" : "error", error: msg.slice(0, 300) }).eq("id", j.id);
        if (limited) break;
      }
    }
    // 대기열이 비면 건물 연결 한 번에 정리
    const { count: left } = await db.from("molit_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]);
    let matched = null;
    if (!left) matched = (await db.rpc("molit_after_sync")).data ?? 0;
    await db.from("molit_sync_runs").insert({
      trigger, started_at: started, finished_at: new Date().toISOString(),
      months: `${jobs.length}개 작업 (남은 ${left ?? 0})`, fetched, inserted: kept, canceled, matched: matched ?? 0,
      status: errors.length && !kept ? "error" : "ok", error: errors.length ? errors.slice(0, 5).join(" / ") : null,
    });
    return json({ ok: true, done: jobs.length, fetched, kept, canceled, left, matched, errors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
