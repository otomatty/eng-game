import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// `next dev` 実行時に Cloudflare のバインディング（D1 など）をローカルで有効化する。
// 本番ビルド時は no-op。
initOpenNextCloudflareForDev();
