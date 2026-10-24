import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

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

// TEST-site branding. Only active when WIKIGAME_ENV=test, which is set solely on the
// omri-wiki-game-test Netlify site. Production builds never set it, so they are untouched:
// the test icons live in env-test/ (not public/) and are only copied into dist here.
const TEST_ICONS = {
  '/favicon-64.png': '/favicon-test-64.png',
  '/apple-touch-icon-v2.png': '/apple-touch-icon-test.png',
  '/icon-v2-192.png': '/icon-test-192.png',
  '/icon-v2-512.png': '/icon-test-512.png',
  '/icon-v2-maskable-512.png': '/icon-test-maskable-512.png',
};

function testSiteBranding(enabled) {
  let outDir = 'dist';
  return {
    name: 'test-site-branding',
    apply: () => enabled,
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      const swaps = [
        ['<title>משחק הוויקיפדיה</title>', '<title>TEST · משחק הוויקיפדיה</title>'],
        ['<meta name="apple-mobile-web-app-title" content="WikiWiki" />', '<meta name="apple-mobile-web-app-title" content="Wiki Test" />'],
        ['href="/favicon-64.png"', `href="${TEST_ICONS['/favicon-64.png']}"`],
        ['href="/apple-touch-icon-v2.png"', `href="${TEST_ICONS['/apple-touch-icon-v2.png']}"`],
        ['href="/manifest.webmanifest?v=2"', 'href="/manifest.webmanifest?v=test1"'],
      ];
      for (const [from, to] of swaps) {
        // Fail the test build loudly if index.html changed and a swap no longer matches.
        if (!html.includes(from)) throw new Error(`test-site-branding: "${from}" not found in index.html`);
        html = html.replace(from, to);
      }
      return html;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = Object.values(TEST_ICONS).find((icon) => req.url?.split('?')[0] === icon);
        if (file) {
          res.setHeader('content-type', 'image/png');
          res.end(fs.readFileSync(path.resolve('env-test' + file)));
          return;
        }
        next();
      });
    },
    closeBundle() {
      for (const icon of Object.values(TEST_ICONS)) {
        fs.copyFileSync(path.resolve('env-test' + icon), path.join(outDir, icon));
      }
      const manifestPath = path.join(outDir, 'manifest.webmanifest');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.name = 'WikiWiki Test – משחק הוויקיפדיה';
      manifest.short_name = 'Wiki Test';
      manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: TEST_ICONS[icon.src] ?? icon.src }));
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  }
  return {
    plugins: [react(), geminiDev(), testSiteBranding((process.env.WIKIGAME_ENV || env.WIKIGAME_ENV) === 'test')],
    build: {
      chunkSizeWarningLimit: 700,
      rolldownOptions: {
        output: {
          // Vendor code in its own long-cached files, so app deploys don't re-download Firebase/React.
          codeSplitting: {
            groups: [
              { name: 'firestore', test: /node_modules[\\/](@firebase[\\/]firestore|@firebase[\\/]webchannel-wrapper|re2js)/ },
              { name: 'firebase-auth', test: /node_modules[\\/](@firebase[\\/](auth|app|util|component|logger)|idb|tslib)/ },
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
