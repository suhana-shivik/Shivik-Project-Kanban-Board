import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The app calls relative /api endpoints. In development those have to be
// proxied to wherever the backend actually runs — set VITE_API_TARGET in a
// .env file, e.g. VITE_API_TARGET=http://localhost:8080
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_TARGET;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      ...(target
        ? { proxy: { "/api": { target, changeOrigin: true } } }
        : {})
    }
  };
});
