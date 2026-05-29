import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function staticSitePlugin() {
  const pages = [
    'index.html', 'blog.html', 'quienes.html',
    'perfil.html', 'post.html', 'admin.html', 'auth-bridge.html'
  ];

  const copyExts = new Set([
    '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif',
    '.ico', '.json', '.otf', '.ttf', '.woff', '.woff2', '.toml', '.txt'
  ]);

  const ignore = new Set([
    'node_modules', 'dist', 'vite.config.js', '_entry.js',
    'package.json', 'package-lock.json', '.gitignore', '.env',
    '.assetsignore', '_nav.html'
  ]);

  return {
    name: 'static-site',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Eliminar el chunk ficticio del entry point
      for (const key of Object.keys(bundle)) {
        if (key === '_entry.js' || bundle[key].name === '_entry') {
          delete bundle[key];
        }
      }

      // 1. Emitir HTMLs con @@include resuelto
      const emitted = new Set();
      for (const page of pages) {
        const pagePath = resolve(__dirname, page);
        if (!fs.existsSync(pagePath)) continue;
        let html = fs.readFileSync(pagePath, 'utf-8');
        html = html.replace(/@@include\(['"](.+?)['"]\)/g, (_, file) => {
          const inc = resolve(__dirname, file);
          return fs.existsSync(inc) ? fs.readFileSync(inc, 'utf-8') : '';
        });
        this.emitFile({ type: 'asset', fileName: page, source: html });
        emitted.add(page);
      }

      // 2. Copiar estáticos sin tocar
      for (const entry of fs.readdirSync(__dirname, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const name = entry.name;
        if (ignore.has(name) || emitted.has(name)) continue;
        const ext = path.extname(name).toLowerCase();
        if (!copyExts.has(ext)) continue;
        const content = fs.readFileSync(resolve(__dirname, name));
        this.emitFile({ type: 'asset', fileName: name, source: content });
        emitted.add(name);
      }
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssMinify: false,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    minify: false,
    rollupOptions: {
      input: { _entry: resolve(__dirname, '_entry.js') },
      output: { assetFileNames: '[name][extname]', entryFileNames: '_entry.js' }
    },
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [staticSitePlugin()],
  publicDir: false,
});
