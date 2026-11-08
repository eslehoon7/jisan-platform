// 건축물대장 조회 (국토부 건축HUB) — 지번 → 건물명·준공·층수·연면적·주차
// 호출: 관리자 로그인 토큰, 또는 { token } (크론 토큰)
// body: { action: 'probe' | 'dongs' | 'lookup', items?: [{ sgg_cd, umd_nm, jibun }] }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const BASE = "https://apis.data.go.kr/1613000/BldRgstHubService";
const SGG = ["11200", "11560", "11710"];

function serviceKey() {
  const raw = (Deno.env.get("MOLIT_SERVICE_KEY") || Deno.env.get("NTS_SERVICE_KEY") || "").trim();
  if (!raw) throw new Error("공공데이터포털 인증키가 설정되지 않았어요");
  const decoded = /%[0-9A-Fa-f]{2}/.test(raw) ? decodeURIComponent(raw) : raw;
  return encodeURIComponent(decoded);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 국토부 서버가 바쁘다고 거절하면 잠깐 쉬었다가 최대 4번 다시 시도
async function call(op: string, params: Record<string, string>) {
  let last: Error | null = null;
  for (let i = 0; i < 4; i++) {
    try { return await callOnce(op, params); }
    catch (e) {
      last = e as Error;
      if (/코드를|지번 형식/.test(last.message)) throw last;
      await sleep(600 * (i + 1));
    }
  }
  throw last!;
}

async function callOnce(op: string, params: Record<string, string>) {
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const res = await fetch(`${BASE}/${op}?serviceKey=${serviceKey()}&_type=json&${q}`);
  const text = await res.text();
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error(`건축물대장 응답 오류 ${res.status}: ${text.replace(/<[^>]+>/g, " ").trim().slice(0, 150)}`); }
  const h = j?.response?.header;
  if (h && !["00", "000"].includes(String(h.resultCode))) throw new Error(`건축물대장 오류 ${h.resultCode}: ${h.resultMsg}`);
  const body = j?.response?.body;
  let items = body?.items?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  return { total: Number(body?.totalCount ?? 0), items: items as Record<string, any>[] };
}

// "서울특별시 송파구 문정동 651번지" → 문정동
const dongOf = (plat: string) => (plat || "").trim().split(/\s+/).find((w, i) => i >= 2 && /(동|가)$/.test(w)) ?? "";

async function isAdmin(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token.split(".").length !== 3) return false;
  const { data } = await db.auth.getUser(token);
  if (!data?.user) return false;
  const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return p?.role === "admin";
}

const n = (v: any) => (v === undefined || v === null || v === "" ? null : Number(v));

async function lookup(it: { sgg_cd: string; umd_nm: string; jibun: string }) {
  const { data: c } = await db.from("bld_registry_cache").select("data").eq("sgg_cd", it.sgg_cd).eq("umd_nm", it.umd_nm).eq("jibun", it.jibun).maybeSingle();
  if (c?.data) return { ...it, ...c.data, cached: true };
  const r = await lookupLive(it);
  if (r.ok) await db.from("bld_registry_cache").upsert({ sgg_cd: it.sgg_cd, umd_nm: it.umd_nm, jibun: it.jibun, data: r, fetched_at: new Date().toISOString() });
  return r;
}

async function lookupLive(it: { sgg_cd: string; umd_nm: string; jibun: string }): Promise<any> {
  const { data: d } = await db.from("bjdong_codes").select("bjdong_cd").eq("sgg_cd", it.sgg_cd).eq("umd_nm", it.umd_nm).maybeSingle();
  if (!d) return { ...it, ok: false, error: "법정동 코드를 찾지 못했어요" };
  const m = String(it.jibun).replace(/^산\s*/, "").match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return { ...it, ok: false, error: "지번 형식이 달라요" };
  const p = { sigunguCd: it.sgg_cd, bjdongCd: d.bjdong_cd, bun: m[1].padStart(4, "0"), ji: (m[2] || "0").padStart(4, "0"), numOfRows: "100", pageNo: "1" };

  const title = await call("getBrTitleInfo", p);
  const main = title.items
    .filter((x) => !x.mainAtchGbCdNm || x.mainAtchGbCdNm === "주건축물")
    .sort((a, b) => (n(b.totArea) ?? 0) - (n(a.totArea) ?? 0));
  const t = main[0] || title.items[0];
  let name = (t?.bldNm || "").trim();
  let recap: any = null;
  if (!name || title.items.length > 1) {
    try { recap = (await call("getBrRecapTitleInfo", p)).items[0]; } catch { /* 총괄표제부 없음 */ }
    if (recap?.bldNm?.trim()) name = recap.bldNm.trim();
  }
  if (!t && !recap) return { ...it, ok: false, error: "건축물대장에 없어요" };
  const src = t || recap;
  const PK = ["indrMechUtcnt", "oudrMechUtcnt", "indrAutoUtcnt", "oudrAutoUtcnt"];
  const parkOf = (x: any) => PK.reduce((s, k) => s + (n(x?.[k]) ?? 0), 0);
  // 여러 동(A동·B동)이면: 주차는 총괄표제부(없으면 동별 합), 층수는 가장 높은 동
  const park = recap && parkOf(recap) ? parkOf(recap) : main.reduce((s, x) => s + parkOf(x), 0) || parkOf(src);
  const floorsUp = Math.max(0, ...main.map((x) => n(x.grndFlrCnt) ?? 0)) || n(src.grndFlrCnt);
  const floorsDown = Math.max(0, ...main.map((x) => n(x.ugrndFlrCnt) ?? 0)) || n(src.ugrndFlrCnt);
  const sumArea = main.reduce((s, x) => s + (n(x.totArea) ?? 0), 0);
  const purps = [src.mainPurpsCdNm, src.etcPurps, ...main.map((x) => x.etcPurps)].join(" ");
  const day = String(src.useAprDay || "").trim();
  return {
    ...it, ok: true,
    name: name || null,
    road_address: (src.newPlatPlc || "").trim() || null,
    jibun_address: (src.platPlc || "").trim() || null,
    completed_year: /^\d{8}$/.test(day) ? Number(day.slice(0, 4)) : null,
    floors_above: floorsUp,
    floors_below: floorsDown,
    gross_area_m2: n(recap?.totArea) || sumArea || n(src.totArea),
    parking_spaces: park || null,
    main_use: src.mainPurpsCdNm || null,
    is_jisan: /지식산업센터|아파트형공장/.test(purps),
    building_count: title.items.filter((x) => x.mainAtchGbCdNm === "주건축물").length || title.items.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any = {};
  try { body = await req.json(); } catch { /* 빈 요청 */ }

  let ok = false;
  if (body.token) { const { data } = await db.rpc("molit_check_token", { p_token: String(body.token) }); ok = data === true; }
  if (!ok) ok = await isAdmin(req);
  if (!ok) return json({ error: "권한이 없어요" }, 401);

  try {
    if (body.action === "probe") {
      const r = await call("getBrTitleInfo", { sigunguCd: body.sigunguCd || "11710", bjdongCd: body.bjdongCd || "10800", bun: body.bun || "0651", ji: body.ji || "0000", numOfRows: "3", pageNo: "1" });
      return json({ total: r.total, fields: r.items[0] ? Object.keys(r.items[0]) : [], sample: r.items[0] ?? null });
    }

    // 법정동 코드 표 만들기: 구별로 10100~13000 코드를 한 번씩 조회해서 동 이름을 알아냄 (최초 1회)
    if (body.action === "dongs") {
      const found: any[] = [];
      for (const sgg of (body.sgg || SGG)) {
        // 동 코드는 10100부터 100씩 이어짐 → 연속 6번 비면 그 구는 끝
        let miss = 0;
        for (let c = Number(body.from) || 10100; c <= (Number(body.to) || 19900); c += 100) {
          try {
            const r = await call("getBrTitleInfo", { sigunguCd: sgg, bjdongCd: String(c), numOfRows: "1", pageNo: "1" });
            const plat = r.items[0]?.platPlc;
            const dong = plat ? dongOf(plat) : "";
            if (dong) { found.push({ sgg_cd: sgg, umd_nm: dong, bjdong_cd: String(c) }); miss = 0; }
            else if (++miss >= 6) break;
          } catch { if (++miss >= 6) break; }
        }
      }
      if (found.length) await db.from("bjdong_codes").upsert(found, { onConflict: "sgg_cd,umd_nm" });
      return json({ ok: true, count: found.length, found });
    }

    if (body.action === "lookup") {
      const items = (body.items || []).slice(0, 100);
      const out = [];
      for (const it of items) {
        try { out.push(await lookup(it)); } catch (e) { out.push({ ...it, ok: false, error: (e as Error).message }); }
        await sleep(150);
      }
      return json({ ok: true, results: out });
    }
    return json({ error: "action을 알 수 없어요" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
