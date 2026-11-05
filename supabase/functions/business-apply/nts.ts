// 국세청 사업자등록정보 진위확인 (공공데이터포털)
// 비밀값 NTS_SERVICE_KEY(일반 인증키 Decoding)가 없으면 { skipped: true } 를 돌려줌
export type NtsResult =
  | { skipped: true }
  | { skipped: false; ok: boolean; reason?: string; nameMismatch?: boolean; b_stt?: string; b_stt_cd?: string; tax_type?: string };

async function validate(key: string, b: Record<string, string>) {
  const k = key.trim().replace(/^["']|["']$/g, "");
  const isEncoded = /%[0-9A-Fa-f]{2}/.test(k);
  const decoded = isEncoded ? decodeURIComponent(k) : k;
  const body = JSON.stringify({ businesses: [b] });
  const url = "https://api.odcloud.kr/api/nts-businessman/v1/validate";
  // 방법 1: 주소에 serviceKey  /  방법 2: Authorization 헤더 (공공데이터포털이 둘 다 지원)
  const tries: [string, Record<string, string>][] = [
    [`${url}?serviceKey=${encodeURIComponent(decoded)}`, {}],
    [url, { Authorization: `Infuser ${decoded}` }],
  ];
  let last = { status: 0, text: "" };
  for (const [u, h] of tries) {
    const res = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...h }, body });
    if (res.ok) return (await res.json())?.data?.[0];
    last = { status: res.status, text: (await res.text()).slice(0, 200) };
    if (res.status !== 401 && res.status !== 403) break;
  }
  // 진단 정보 (키 내용은 노출하지 않고 길이·형태만)
  const shape = `키 길이 ${decoded.length}자, ${isEncoded ? "Encoding형" : "Decoding형"}, 끝 '${decoded.slice(-2) === "==" ? "==" : "기타"}'`;
  let msg = "";
  try { const j = JSON.parse(last.text); msg = j.msg || j.message || j.resultMsg || ""; } catch { msg = last.text.replace(/<[^>]+>/g, " ").trim(); }
  throw new Error(`국세청 조회 실패 (${last.status}) ${msg} [${shape}]`);
}

export async function ntsCheck(input: { b_no: string; start_dt: string; p_nm: string; b_nm?: string }): Promise<NtsResult> {
  const key = Deno.env.get("NTS_SERVICE_KEY");
  if (!key) return { skipped: true };
  const base = {
    b_no: input.b_no.replace(/\D/g, ""),
    start_dt: input.start_dt.replace(/\D/g, ""),
    p_nm: input.p_nm.trim(),
  };
  // 1차: 상호까지 함께 대조
  let row = await validate(key, input.b_nm ? { ...base, b_nm: input.b_nm.trim() } : base);
  let nameMismatch = false;
  if (row?.valid !== "01" && input.b_nm) {
    // 상호 표기 차이인지 확인: 상호 빼고 다시 대조
    const again = await validate(key, base);
    if (again?.valid === "01") { row = again; nameMismatch = true; }
  }
  if (row?.valid !== "01")
    return { skipped: false, ok: false, reason: "사업자등록번호·개업일자·대표자명이 국세청 기록과 일치하지 않아요" };
  const st = row.status || {};
  if (st.b_stt_cd && st.b_stt_cd !== "01")
    return { skipped: false, ok: false, reason: `${st.b_stt || "휴·폐업"} 상태라 가입할 수 없어요`, b_stt: st.b_stt, b_stt_cd: st.b_stt_cd, tax_type: st.tax_type };
  if (nameMismatch)
    return { skipped: false, ok: false, nameMismatch: true, reason: "상호가 사업자등록증과 달라요. 등록증에 적힌 그대로 입력해 주세요", b_stt: st.b_stt, tax_type: st.tax_type };
  return { skipped: false, ok: true, b_stt: st.b_stt, b_stt_cd: st.b_stt_cd, tax_type: st.tax_type };
}
