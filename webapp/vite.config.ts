import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O GitHub Pages serve o site em https://<org>.github.io/<repo>/, então os
// assets precisam desse prefixo. Vale também em dev e preview, para que o
// caminho exercitado localmente seja o mesmo da publicação.
export default defineConfig({
  base: '/classificador-app/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
