import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Serve /data/* in dev/preview: per file, prefer ../data/public (real engine output
// and the map geometry), otherwise fall back to ./mock-data.
// DADOS=mock inverts the order (mock first; geo still comes from data/public).
const REAL = path.resolve(__dirname, '../data/public');
const MOCK = path.resolve(__dirname, 'mock-data');

function dataMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/data/')) return next();
    const rel = decodeURIComponent(url.slice('/data/'.length));
    if (rel.includes('..')) {
      res.statusCode = 400;
      return res.end();
    }
    const ordem = process.env.DADOS === 'mock' ? [MOCK, REAL] : [REAL, MOCK];
    for (const base of ordem) {
      const file = path.join(base, rel);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const ext = path.extname(file);
        const type =
          ext === '.json' ? 'application/json; charset=utf-8'
          : ext === '.jpeg' || ext === '.jpg' ? 'image/jpeg'
          : ext === '.png' ? 'image/png'
          : 'application/octet-stream';
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Data-Source', base === REAL ? 'real' : 'mock');
        return fs.createReadStream(file).pipe(res);
      }
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end('{"erro":"nao encontrado"}');
  };
}

const dataPlugin: Plugin = {
  name: 'dados-locais',
  configureServer(server) {
    server.middlewares.use(dataMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(dataMiddleware());
  },
};

export default defineConfig({
  plugins: [react(), dataPlugin],
  base: '/',
  build: {
    outDir: 'dist',
    target: 'es2019',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
          geo: ['d3-geo', 'topojson-client'],
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
