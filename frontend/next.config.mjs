import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite acessar o dev server pelo IP da LAN (ex.: celular na mesma rede)
  allowedDevOrigins: ['192.168.31.60', '26.15.117.25'],
  // O package-lock.json da raiz faria o Next tratar thy.self/ como workspace.
  // Estas duas opções mantêm o frontend como raiz no dev e no build.
  turbopack: {
    root: frontendRoot,
  },
  outputFileTracingRoot: frontendRoot,
};

export default nextConfig;
