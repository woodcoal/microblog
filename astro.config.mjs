import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

// Cloudflare 适配器（部署时取消注释并安装 @astrojs/cloudflare）
// import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
	output: 'server',
	adapter: node({
		mode: 'standalone'
	}),
	server: {
		host: '0.0.0.0',
		allowedHosts: true
	},
	// 核心配置：在这里关闭 Origin 校验
	security: {
		checkOrigin: false
	},
	// 部署到 Cloudflare 时切换：
	// adapter: cloudflare(),
	integrations: [react()],
	vite: {
		resolve: {
			alias: {
				'@': '/src'
			}
		}
	}
});
