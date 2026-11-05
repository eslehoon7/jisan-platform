// 사업자 회원 가입 신청 (지산맵)
// multipart/form-data 로 사업자 정보 + 증빙서류를 한 번에 받아서
//  0) 국세청 진위확인 (인증키가 설정돼 있으면) — 불일치·휴폐업이면 접수 거절
//  1) 비공개 보관함(business-docs/{사용자ID}/...)에 서류 저장
//  2) businesses 에 '심사 대기(pending)' 로 등록
// 신청자 확인: (a) 로그인 토큰이 있으면 그 사용자, (b) 없으면 방금(30분 이내) 가입한 user_id
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ntsCheck } from "./nts.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const TYPES = ["중개사", "분양대행", "인테리어", "청소", "은행·대출", "대부업", "법무", "기타"];
const LICENSE_REQUIRED = ["중개사", "대부업"];
const OK_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX = 10 * 1024 * 1024;
const ext = (f: File) => (f.type === "application/pdf" ? "pdf" : f.type.split("/")[1] || "bin");
const s = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST만 지원해요" }, 405);

  try {
    const form = await req.formData();

    // ── 신청자 확인 ──
    let userId = "";
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (token && token.split(".").length === 3) {
      const { data } = await db.auth.getUser(token);
      if (data?.user) userId = data.user.id;
    }
    if (!userId) {
      const uid = s(form.get("user_id"));
      if (!uid) return json({ error: "가입 정보를 찾지 못했어요. 다시 시도해 주세요" }, 400);
      const { data, error } = await db.auth.admin.getUserById(uid);
      if (error || !data?.user) return json({ error: "가입 정보를 찾지 못했어요" }, 400);
      if (Date.now() - new Date(data.user.created_at).getTime() > 30 * 60 * 1000)
        return json({ error: "로그인한 뒤 다시 신청해 주세요" }, 401);
      userId = data.user.id;
    }

    const { data: existing } = await db.from("businesses").select("id, status").eq("profile_id", userId).maybeSingle();
    if (existing && existing.status !== "rejected") return json({ error: "이미 사업자 신청이 있어요" }, 409);

    // ── 입력값 검사 ──
    const f = {
      biz_type: s(form.get("biz_type")), company_name: s(form.get("company_name")), representative: s(form.get("representative")),
      business_no: s(form.get("business_no")).replace(/\D/g, ""), start_dt: s(form.get("start_dt")).replace(/\D/g, ""),
      license_no: s(form.get("license_no")),
      address: s(form.get("address")), office_phone: s(form.get("office_phone")),
      contact_name: s(form.get("contact_name")), contact_phone: s(form.get("contact_phone")).replace(/\D/g, ""), intro: s(form.get("intro")),
    };
    if (!TYPES.includes(f.biz_type)) return json({ error: "업종을 골라 주세요" }, 400);
    for (const [k, label] of [["company_name", "상호"], ["representative", "대표자"], ["address", "사업장 주소"], ["office_phone", "대표 전화"]] as const)
      if (!f[k]) return json({ error: `${label}를 입력해 주세요` }, 400);
    if (f.business_no.length !== 10) return json({ error: "사업자등록번호 10자리를 확인해 주세요" }, 400);
    if (f.start_dt.length !== 8) return json({ error: "개업일자를 확인해 주세요" }, 400);
    if (LICENSE_REQUIRED.includes(f.biz_type) && !f.license_no) return json({ error: "업종 등록번호를 입력해 주세요" }, 400);

    // ── 국세청 진위확인 (서버에서 다시 확인 → 화면을 건너뛰어도 우회 불가) ──
    const nts = await ntsCheck({ b_no: f.business_no, start_dt: f.start_dt, p_nm: f.representative, b_nm: f.company_name });
    if (!nts.skipped && !nts.ok) return json({ error: nts.reason || "국세청 확인을 통과하지 못했어요" }, 400);

    const cert = form.get("cert");
    const license = form.get("license");
    if (!(cert instanceof File) || !cert.size) return json({ error: "사업자등록증을 첨부해 주세요" }, 400);
    if (LICENSE_REQUIRED.includes(f.biz_type) && (!(license instanceof File) || !license.size))
      return json({ error: "업종 등록증을 첨부해 주세요" }, 400);
    for (const file of [cert, license]) {
      if (file instanceof File && file.size) {
        if (!OK_MIME.includes(file.type)) return json({ error: "서류는 사진(JPG·PNG) 또는 PDF만 올릴 수 있어요" }, 400);
        if (file.size > MAX) return json({ error: "서류 파일은 10MB 이하로 올려 주세요" }, 400);
      }
    }

    // ── 서류 저장 ──
    const ts = Date.now();
    const certPath = `${userId}/cert-${ts}.${ext(cert)}`;
    const up1 = await db.storage.from("business-docs").upload(certPath, cert, { contentType: cert.type });
    if (up1.error) throw up1.error;
    let licensePath: string | null = null;
    if (license instanceof File && license.size) {
      licensePath = `${userId}/license-${ts}.${ext(license)}`;
      const up2 = await db.storage.from("business-docs").upload(licensePath, license, { contentType: license.type });
      if (up2.error) throw up2.error;
    }

    // ── 신청 등록 (반려됐던 신청은 다시 심사 대기로) ──
    const startDate = `${f.start_dt.slice(0, 4)}-${f.start_dt.slice(4, 6)}-${f.start_dt.slice(6, 8)}`;
    const row = {
      profile_id: userId, ...f, start_dt: startDate, license_no: f.license_no || null, contact_name: f.contact_name || null,
      contact_phone: f.contact_phone || null, intro: f.intro || null,
      cert_path: certPath, license_path: licensePath, status: "pending", reject_reason: null,
      nts_verified_at: nts.skipped ? null : new Date().toISOString(),
      nts_status: nts.skipped ? null : nts.b_stt || null,
      nts_tax_type: nts.skipped ? null : nts.tax_type || null,
      nts_note: nts.skipped ? "국세청 인증키 미설정 — 자동 확인 생략, 서류로 확인 필요" : null,
    };
    const { error } = existing
      ? await db.from("businesses").update(row).eq("id", existing.id)
      : await db.from("businesses").insert(row);
    if (error) throw error;

    return json({ ok: true, nts_checked: !nts.skipped });
  } catch (e) {
    return json({ error: (e as Error).message || "서버 오류" }, 500);
  }
});
