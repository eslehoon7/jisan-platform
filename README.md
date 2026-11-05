# 지산맵 · 지식산업센터 플랫폼

## 처음 한 번만 (준비)
1. Node.js 설치: https://nodejs.org 에서 **LTS** 버전 다운로드 → 설치 (계속 "다음")
2. 이 폴더(jisan-platform)를 열고, 주소창에 `cmd` 입력 후 Enter → 검은 창이 열림
3. 검은 창에 입력: `npm install` (1~2분 걸림)

## 사이트 미리보기 (매번)
검은 창에 입력: `npm run dev`
→ 브라우저가 자동으로 http://localhost:5173 을 열어요.
끌 때는 검은 창에서 `Ctrl + C`.

## 폴더 구성
- `src/config.js` : 열쇠 모음 (Supabase 주소/공개키, 네이버 지도 Client ID)
- `src/App.jsx` : 화면 전체 뼈대
- `src/components/` : 화면 조각들 (지도, 건물목록, 건물상세, 거래내역, 매물, 주변업체, 로그인)
- `src/styles.css` : 디자인(색·크기)

## 연결된 서비스
- Supabase 프로젝트: jisan-platform (Onbrandium 조직, 서울)
- 네이버 지도: Application `jisan-platform` (Web 서비스 URL: http://localhost:5173)
