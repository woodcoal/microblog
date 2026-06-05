/**
 * PM2 进程管理配置文件
 *
 * 用法：
 *   pm2 start ecosystem.config.js          # 启动生产服务
 *   pm2 start ecosystem.config.js --env production  # 指定环境
 *   pm2 logs                                 # 查看日志
 *   pm2 restart mutan                        # 重启
 *
 * 环境变量优先顺序：
 *   1. 系统环境变量（export JWT_SECRET=xxx）
 *   2. .env 文件（通过 dotenv/config 自动加载）
 *   3. 下方 env 字段中定义的值
 */
module.exports = {
	apps: [
		{
			name: 'mutan',
			script: 'dist/server/entry.mjs',

			// 通过 node -r dotenv/config 预加载 .env 文件到 process.env
			// 确保生产运行时也能读取 .env 中的配置
			node_args: '-r dotenv/config',

			// 进程管理
			instances: 1,
			exec_mode: 'fork',
			max_restarts: 10,
			restart_delay: 5000,

			// 日志
			log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
			error_file: './logs/error.log',
			out_file: './logs/out.log',
			merge_logs: true,

			// 环境变量（仅做兜底，优先使用 .env 和系统环境变量）
			env: {
				NODE_ENV: 'production',
				HOST: '0.0.0.0',
				PORT: 4321
			}
		}
	]
};
