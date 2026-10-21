import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Local stand-in for the Netlify function, so Refresh can call Gemini from `npm run dev`.
function geminiDev() {
  return {
    name: 'gemini-dev',
    configureServer(server) {
      server.middlewares.use('/.netlify/functions/gemini', async (req, res) => {
        try {
          const { handleGemini } = await import('./netlify/functions/gemini.js');
          const raw = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
          const headers = new Headers();
          Object.entries(req.headers).forEach(([key, value]) => {
            if (typeof value === 'string') headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(', '));
          });
          const request = new Request('http://127.0.0.1/gemini', {
            method: req.method,
            headers,
            body: raw,
          });
          const response = await handleGemini(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          console.error(error);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'gemini' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  }
  return {
    plugins: [react(), geminiDev()],
  };
});
