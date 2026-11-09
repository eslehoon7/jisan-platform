// 주소 → 좌표 (네이버 클라우드 Geocoding API, 서버용)
// 비밀 열쇠는 Supabase Edge Function Secrets 의 NAVER_MAP_CLIENT_SECRET 에만 저장 (코드·채팅에 넣지 않음)
// 호출: 관리자 로그인 토큰 또는 { token } (크론 토큰)
// body: { queries: ["서울 구로구 구로동 197-10", ...] } → { results: [{ query, ok, lat, lng, road, jibun }] }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ID = Deno.env.get("NAVER_MAP_CLIENT_ID") || "1hfle2y940"; // 공개 값 (지도 키와 같음)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isAdmin(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token.split(".").length !== 3) return false;
  const { data } = await db.auth.getUser(token);
  if (!data?.user) return false;
  const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return p?.role === "admin";
}

async function geocode(query: string, secret: string) {
  for (const host of ["https://maps.apigw.ntruss.com", "https://naveropenapi.apigw.ntruss.com"]) {
    const res = await fetch(`${host}/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`, {
      headers: { "x-ncp-apigw-api-key-id": ID, "x-ncp-apigw-api-key": secret, Accept: "application/json" },
    });
    if (res.status === 404) continue; // 옛 주소 체계면 다른 주소로 한 번 더
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`네이버 주소검색 오류 ${res.status}: ${j?.error?.message || j?.errorMessage || ""}`.trim());
    const a = j?.addresses?.[0];
    if (!a) return { query, ok: false };
    return { query, ok: true, lat: Number(a.y), lng: Number(a.x), road: a.roadAddress || null, jibun: a.jibunAddress || null };
  }
  return { query, ok: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any = {};
  try { body = await req.json(); } catch { /* 빈 요청 */ }
  let ok = false;
  if (body.token) { const { data } = await db.rpc("molit_check_token", { p_token: String(body.token) }); ok = data === true; }
  if (!ok) ok = await isAdmin(req);
  if (!ok) return json({ error: "권한이 없어요" }, 401);

  const secret = (Deno.env.get("NAVER_MAP_CLIENT_SECRET") || "").trim();
  if (!secret) return json({ error: "NAVER_MAP_CLIENT_SECRET 이 Supabase Secrets 에 없어요" }, 500);
  const out = [];
  for (const q of (body.queries || []).slice(0, 100)) {
    try { out.push(await geocode(String(q), secret)); } catch (e) { out.push({ query: q, ok: false, error: (e as Error).message }); }
    await sleep(60);
  }
  return json({ ok: true, results: out });
});
