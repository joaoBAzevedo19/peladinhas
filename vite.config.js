import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages under /<repo-name>/.
// Routing is hash-based (#/jogos), so no server rewrites are needed.
export default defineConfig({
  plugins: [react()],
  base: './',
});
