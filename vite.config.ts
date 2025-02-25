import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["lucide-react"],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["framer-motion", "sonner", "lucide-react"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "app-admin": [
            "./src/pages/AdminPage.tsx",
            "./src/lib/adminService.ts",
          ],
          "app-chat": ["./src/pages/ChatPage.tsx", "./src/pages/InboxPage.tsx"],
          "app-accounts": ["./src/pages/AccountsPage.tsx"],
        },
      },
    },
  },
});
