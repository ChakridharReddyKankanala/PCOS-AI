import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The app talks to the backend at VITE_API_URL (default http://127.0.0.1:8000), which must allow
  // this origin through CORS. The backend already allows http://localhost:5173.
})
