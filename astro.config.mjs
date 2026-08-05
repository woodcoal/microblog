import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

// Cloudflare 适配器（部署时取消注释并安装 @astrojs/cloudflare）
// import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
	output: 'server',
	// 保持 Astro 6 及以前版本的完整 HTML 压缩行为，避免内联元素间距变化。
	compressHTML: true,
	adapter: node({
		mode: 'standalone'
	}),
	server: {
		host: '0.0.0.0',
		allowedHosts: true
	},
	// 开启 Astro 内置的 Origin 校验，拒绝跨站表单 POST。
	security: {
		checkOrigin: true
	},
	// 部署到 Cloudflare 时切换：
	// adapter: cloudflare(),
	// React 集成：当前无 React Island 在用，保留供 T6 BlogEditor（Tiptap）使用
	integrations: [react()],
	vite: {
		resolve: {
			alias: {
				'@': '/src'
			}
		}
	}
});
