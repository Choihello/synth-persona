/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 워크스페이스 밖(../web, ../src)의 TS를 직접 import해 컴파일
    externalDir: true,
  },
  webpack: (config) => {
    // ESM 스타일 ".js" 상대 import를 .ts/.tsx 소스로 해석 (web/·src/ 공유 모듈)
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
export default nextConfig;
