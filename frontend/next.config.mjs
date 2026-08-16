/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite acessar o dev server pelo IP da LAN (ex.: celular na mesma rede)
  allowedDevOrigins: ['192.168.31.60', '26.15.117.25'],
};

export default nextConfig;
