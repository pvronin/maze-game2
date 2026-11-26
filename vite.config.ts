import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function copyStaticGameFolders() {
  return {
    name: 'copy-static-game-folders',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      for (const dir of ['css', 'js']) {
        const src = path.resolve(__dirname, dir);
        const dest = path.join(outDir, dir);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, {recursive: true});
        }
      }
      const pubDir = path.resolve(__dirname, 'public');
      if (fs.existsSync(pubDir)) {
        for (const entry of fs.readdirSync(pubDir)) {
          if (entry === 'assets') continue;
          const s = path.join(pubDir, entry);
          const d = path.join(outDir, entry);
          fs.cpSync(s, d, {recursive: true});
        }
      }
      const readmeSrc = path.resolve(__dirname, 'README.md');
      if (fs.existsSync(readmeSrc)) {
        fs.copyFileSync(readmeSrc, path.join(outDir, 'README.md'));
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [copyStaticGameFolders()],
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
