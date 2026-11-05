// 화면의 [사업자 확인] 버튼용 — 결과만 알려줌 (실제 가입 시에는 business-apply 가 다시 확인)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ntsCheck } from "./nts.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    if (String(b.b_no || "").replace(/\D/g, "").length !== 10) return json({ error: "사업자등록번호 10자리를 확인해 주세요" }, 400);
    if (String(b.start_dt || "").replace(/\D/g, "").length !== 8) return json({ error: "개업일자를 확인해 주세요" }, 400);
    if (!String(b.p_nm || "").trim()) return json({ error: "대표자명을 입력해 주세요" }, 400);
    return json(await ntsCheck(b));
  } catch (e) {
    return json({ error: (e as Error).message || "서버 오류" }, 500);
  }
});
