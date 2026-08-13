/**
 * 睦谈部署包打包脚本
 *
 * 用法：pnpm pub  或  node scripts/pack-output.mjs
 *
 * 流程：
 *   1. pnpm run build          — 构建产物
 *   2. 清空 .output/           — 移除旧包
 *   3. 复制 dist/ generated/ prisma/ 等部署文件（不含 node_modules）
 *   4. 生成生产 package.json   — 仅运行时依赖
 *   5. 启动验证（HTTP 200 探针，用源项目 node_modules）
 *   6. 清理测试残留
 *
 * 部署时由 deploy.sh 执行：
 *   pnpm install --prod → prisma generate → prisma migrate deploy
 */

import { existsSync, mkdirSync, copyFileSync, cpSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const isWindows = platform() === 'win32';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.output');

const log = (msg) => console.log(`\x1b[36m[pack]\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m  ✓\x1b[0m ${msg}`);
const fail = (msg) => {
	console.error(`\x1b[31m  ✗\x1b[0m ${msg}`);
	process.exit(1);
};

function run(cmd, opts = {}) {
	try {
		execSync(cmd, { stdio: 'inherit', cwd: opts.cwd ?? root, env: opts.env ?? process.env });
	} catch {
		fail(`命令失败: ${cmd}`);
	}
}

/**
 * 跨平台强制删除目录
 *
 * Windows 上 pnpm 创建的 junction 链接无法被 Node 的 rmSync 删除，
 * 必须使用系统命令 rd /s /q 或 rm -rf。
 *
 * @param dir - 要删除的目录路径
 */
function forceRemove(dir) {
	if (!existsSync(dir)) return;
	if (isWindows) {
		execSync(`rd /s /q "${dir}"`, { stdio: 'pipe' });
	} else {
		execSync(`rm -rf "${dir}"`, { stdio: 'pipe' });
	}
}

// ── 1. 构建 ──────────────────────────────────────────
log('构建项目 ...');
run('pnpm run build');
if (!existsSync(join(root, 'dist/server/entry.mjs'))) fail('构建产物 dist/server/entry.mjs 不存在');
ok('构建完成');

// ── 2. 清空 .output ─────────────────────────────────
log('清空 .output/ ...');
if (existsSync(output)) forceRemove(output);
mkdirSync(output, { recursive: true });
ok('.output/ 已就绪');

// ── 3. 复制部署文件 ──────────────────────────────────
log('复制构建产物和部署文件 ...');
cpSync(join(root, 'dist'), join(output, 'dist'), { recursive: true });
cpSync(join(root, 'generated'), join(output, 'generated'), { recursive: true });
cpSync(join(root, 'prisma'), join(output, 'prisma'), { recursive: true });

// 部署配置文件
for (const f of [
	'pnpm-workspace.yaml',
	'prisma.config.ts',
	'ecosystem.config.js',
	'.env.example'
]) {
	copyFileSync(join(root, f), join(output, f));
}
ok('文件复制完成');

// ── 4. 生成生产 package.json ─────────────────────────
log('生成生产 package.json ...');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const prodPkg = {
	name: pkg.name,
	version: pkg.version,
	description: pkg.description,
	author: pkg.author,
	license: pkg.license,
	private: true,
	type: 'module',
	scripts: {
		start: 'node -r dotenv/config dist/server/entry.mjs',
		'db:generate': 'prisma generate',
		'db:migrate': 'prisma migrate deploy',
		'db:prepare': 'prisma generate && prisma migrate deploy',
		'db:seed': 'npx tsx prisma/seed.ts',
		pm2: 'pm2 start ecosystem.config.js'
	},
	dependencies: {}
};
// 只保留运行时依赖，排除构建工具和类型定义
const buildOnly = new Set([
	'@astrojs/node', '@astrojs/react', 'astro',
	'@scalar/api-reference',
	'@tiptap/core', '@tiptap/extension-bubble-menu', '@tiptap/extension-code-block-lowlight',
	'@tiptap/extension-image', '@tiptap/extension-link', '@tiptap/extension-placeholder',
	'@tiptap/extension-task-item', '@tiptap/extension-task-list', '@tiptap/extension-underline',
	'@tiptap/pm', '@tiptap/react', '@tiptap/starter-kit', '@tiptap/suggestion', 'tiptap-markdown',
	'react', 'react-dom', 'tippy.js'
]);
for (const [name, version] of Object.entries(pkg.dependencies)) {
	if (!buildOnly.has(name)) {
		prodPkg.dependencies[name] = version;
	}
}
// 迁移部署需要 prisma 和 @prisma/config
prodPkg.dependencies['prisma'] = pkg.dependencies['prisma'] ?? '^7.9.1';
prodPkg.dependencies['@prisma/config'] = pkg.devDependencies['@prisma/config'] ?? '^7.9.1';

writeFileSync(join(output, 'package.json'), JSON.stringify(prodPkg, null, '\t') + '\n');
ok('生产 package.json 已生成');

// ── 4b. 生成部署辅助文件 ────────────────────────────
log('生成部署辅助文件 ...');

// start.sh — Linux/macOS 启动脚本
writeFileSync(
	join(output, 'start.sh'),
	`#!/usr/bin/env bash
# 睦谈生产启动脚本
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "错误：未找到 .env 文件。请复制 .env.example 为 .env 并填写生产配置。"
  exit 1
fi

export NODE_ENV=production
export HOST="\${HOST:-0.0.0.0}"
export PORT="\${PORT:-4321}"

if [ "\${1:-}" = "--pm2" ]; then
  exec pm2 start ecosystem.config.js --env production
else
  exec node -r dotenv/config dist/server/entry.mjs
fi
`
);

// start.bat — Windows 启动脚本
writeFileSync(
	join(output, 'start.bat'),
	`@echo off
cd /d "%~dp0"

if not exist .env (
  echo 错误：未找到 .env 文件。请复制 .env.example 为 .env 并填写生产配置。
  exit /b 1
)

set NODE_ENV=production
if not defined HOST set HOST=0.0.0.0
if not defined PORT set PORT=4321

if "%1"=="--pm2" (
  pm2 start ecosystem.config.js --env production
) else (
  node -r dotenv/config dist/server/entry.mjs
)
`
);

// deploy.sh — 首次部署脚本
writeFileSync(
	join(output, 'deploy.sh'),
	`#!/usr/bin/env bash
# 睦谈首次部署脚本
set -euo pipefail
cd "$(dirname "$0")"

echo "=== 睦谈部署 ==="

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "错误：Node.js 版本需要 >= 22.12.0，当前为 $(node -v)"
  exit 1
fi
echo "✓ Node.js $(node -v)"

if [ ! -f .env ]; then
  echo "→ 从 .env.example 创建 .env ..."
  cp .env.example .env
  echo "⚠ 请编辑 .env 填写生产配置（至少修改 JWT_SECRET 和 SITE_URL），然后重新运行此脚本。"
  exit 0
fi
echo "✓ .env 已存在"

echo "→ 安装生产依赖 ..."
if command -v pnpm &>/dev/null; then
  pnpm install --prod
else
  npm install --omit=dev
fi
echo "✓ 依赖安装完成"

echo "→ 生成 Prisma Client ..."
npx prisma generate

echo "→ 应用数据库迁移 ..."
npx prisma migrate deploy
echo "✓ 数据库就绪"

mkdir -p uploads logs

echo ""
echo "=== 部署完成 ==="
echo "启动方式："
echo "  前台：  ./start.sh"
echo "  PM2：  ./start.sh --pm2"
`
);

ok('部署辅助文件已生成');

// ── 5. 启动验证 ──────────────────────────────────────
// 不在 .output 中安装依赖，而是用源项目的 node_modules 做启动探针。
// 部署时由 deploy.sh 执行 pnpm install --prod + prisma generate + migrate。
log('启动服务验证 ...');
const testPort = 14399;

// 生成临时 .env 供服务启动读取
writeFileSync(
	join(output, '.env'),
	`DATABASE_PROVIDER="sqlite"\nDATABASE_URL="file:./_test.db"\nJWT_SECRET="mutan-dev-secret-change-in-production"\nSITE_URL="http://localhost:${testPort}"\nSITE_MODES="weibo,forum,blog"\n`
);

// 应用迁移到测试库（用环境变量覆盖 DATABASE_URL，确保不读到源项目的 .env）
run(`npx prisma migrate deploy`, {
	cwd: output,
	env: { ...process.env, DATABASE_PROVIDER: 'sqlite', DATABASE_URL: 'file:./_test.db' }
});

// 用源项目的 node_modules 启动服务
const probe = execSync(
	`node -e "
		const { spawn } = require('child_process');
		const srv = spawn(process.execPath, ['-r', 'dotenv/config', 'dist/server/entry.mjs'], {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, PORT: '${testPort}', NODE_ENV: 'test' },
			cwd: process.cwd()
		});
		let buf = '';
		srv.stdout.on('data', d => { buf += d; if (buf.includes('listening')) check(); });
		srv.stderr.on('data', d => { buf += d; if (buf.includes('listening')) check(); });
		let checked = false;
		function check() {
			if (checked) return; checked = true;
			setTimeout(async () => {
				const routes = ['/', '/login', '/register', '/weibo', '/api/v1/posts?page=1&pageSize=1', '/robots.txt'];
				let allOk = true;
				for (const r of routes) {
					try {
						const res = await fetch('http://localhost:${testPort}' + r);
						if (!res.ok) { console.log('FAIL ' + res.status + ' ' + r); allOk = false; }
						else console.log('OK   ' + res.status + ' ' + r);
					} catch (e) { console.log('ERR  ' + r + ' ' + e.message); allOk = false; }
				}
				srv.kill('SIGTERM');
				process.exit(allOk ? 0 : 1);
			}, 1500);
		}
		setTimeout(() => { console.log('TIMEOUT'); srv.kill('SIGTERM'); process.exit(1); }, 15000);
	"`,
	{ cwd: output, env: { ...process.env, PORT: String(testPort), NODE_ENV: 'test' }, stdio: 'pipe', timeout: 20000 }
).toString();

console.log(probe);
ok('服务验证通过');

// ── 6. 清理测试残留 ──────────────────────────────────
log('清理测试残留 ...');
if (existsSync(join(output, '.env'))) unlinkSync(join(output, '.env'));
if (existsSync(join(output, '_test.db'))) unlinkSync(join(output, '_test.db'));
if (existsSync(join(output, 'app.db'))) unlinkSync(join(output, 'app.db'));
// uploads 和 logs 保留空目录
mkdirSync(join(output, 'uploads'), { recursive: true });
mkdirSync(join(output, 'logs'), { recursive: true });
ok('清理完成');

// ── 完成 ────────────────────────────────────────────
/**
 * 递归计算目录总大小（字节）
 * 替代 du 命令，Windows 没有 du。
 *
 * @param dir - 目录路径
 * @returns 字节数
 */
function dirSize(dir) {
	let total = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			total += dirSize(path);
		} else {
			total += statSync(path).size;
		}
	}
	return total;
}

/**
 * 将字节数格式化为人类可读的大小
 *
 * @param bytes - 字节数
 * @returns 如 "12.3M"
 */
function formatSize(bytes) {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
	return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

const size = formatSize(dirSize(output));
console.log('');
log(`\x1b[32m部署包已生成: .output/ (${size})\x1b[0m`);
console.log('  部署方式：');
console.log('    cd .output && ./deploy.sh   # 首次部署（安装依赖 + 迁移）');
console.log('    ./start.sh                  # 启动');
console.log('    ./start.sh --pm2             # PM2 托管');
