import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import splitMobileCss from './splitMobileCss.js'

export default defineConfig({
  plugins: [splitMobileCss(), react(), svgr()],
})
