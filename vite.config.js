import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 네이버 지도에 등록한 주소(http://localhost:5173)와 맞추기 위해 포트를 5173으로 고정
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, open: true },
})
