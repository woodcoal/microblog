/**
 * 睦谈部署包打包脚本
 *
 * 用法：pnpm pub  或  node scripts/pack-output.mjs
 *
 * 流程：
 *   1. pnpm run build          — 构建产物
 *   2. 清空 .output/           — 移除旧包
 *   3. 复制 dist/ generated/ prisma/ 等部署文件（不含 node_modules）
 *   4. 生成生产 package.json   — 保留全部声明的生产依赖
 *   5. 在 .output 安装生产依赖并启动验证
 *   6. 清理测试残留和根目录 dist/
 *
 * 部署时由 deploy.sh 执行：
 *   pnpm install --prod → prisma generate → prisma migrate deploy
 */

import {
	existsSync,
	mkdirSync,
	copyFileSync,
	cpSync,
	writeFileSync,
	readFileSync,
	unlinkSync,
	readdirSync,
	statSync
} from 'node:fs';
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

/**
 * 清空既有目录但保留目录本身，避免 Windows 下编辑器占用目录句柄时删除失败。
 *
 * @param dir - 要清空的目录路径
 */
function clearDirectory(dir) {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
		return;
	}
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory() || entry.isSymbolicLink()) forceRemove(path);
		else unlinkSync(path);
	}
}

// ── 1. 构建 ──────────────────────────────────────────
log('构建项目 ...');
run('pnpm run build');
if (!existsSync(join(root, 'dist/server/entry.mjs'))) fail('构建产物 dist/server/entry.mjs 不存在');
ok('构建完成');

// ── 2. 清空 .output ─────────────────────────────────
log('清空 .output/ ...');
clearDirectory(output);
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
// 源 package.json 的 dependencies 即应用声明的生产运行时依赖。
// Astro 的服务端产物保留 React、Tiptap 等外部导入，不能按构建时用途排除。
prodPkg.dependencies = { ...pkg.dependencies };
// 迁移部署额外需要 Prisma CLI 与配置加载器。
prodPkg.dependencies.prisma = pkg.devDependencies.prisma;
prodPkg.dependencies['@prisma/config'] = pkg.devDependencies['@prisma/config'];

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

# dotenv 在本次进程启动时读取 .env；修改 .env 后必须重启此脚本或 PM2 进程。
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

rem dotenv 在本次进程启动时读取 .env；修改 .env 后必须重新运行此脚本或重启 PM2 进程。
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

// README.md — 部署说明
writeFileSync(
	join(output, 'README.md'),
	`# 睦谈部署包 v${pkg.version}

## 目录结构

\`\`\`
.output/
├── dist/                  # Astro 构建产物（服务端入口 + 客户端静态资源）
│   ├── server/entry.mjs   # Node standalone 服务端入口
│   └── client/            # 静态资源（JS/CSS/图片/logo/favicon）
├── generated/prisma/      # Prisma Client 生成输出
├── prisma/                # 数据库 schema 和迁移
│   ├── schema.sqlite.prisma
│   ├── schema.mysql.prisma
│   ├── migrations/
│   └── seed.ts
├── uploads/               # 上传目录（空，运行时写入）
├── logs/                  # 日志目录（空，PM2 写入）
├── package.json           # 生产依赖声明（仅运行时依赖）
├── pnpm-workspace.yaml    # pnpm 工作区配置
├── prisma.config.ts       # Prisma 多 provider 配置
├── ecosystem.config.js    # PM2 进程配置
├── .env.example           # 环境变量模板
├── deploy.sh              # 首次部署脚本（安装依赖 + 迁移）
├── start.sh               # Linux/macOS 启动脚本
└── start.bat              # Windows 启动脚本
\`\`\`

## 前置条件

- **Node.js >= 22.12.0**
- **pnpm**（推荐）或 npm
- **PM2**（可选，进程托管）：\`npm install -g pm2\`

## 快速部署

### Linux / macOS

\`\`\`bash
cd .output
./deploy.sh               # 安装依赖 + 生成 Client + 迁移数据库
# 编辑 .env 填写生产配置（JWT_SECRET、SITE_URL 等）
./deploy.sh               # 再次执行应用迁移
./start.sh                # 前台启动
./start.sh --pm2          # PM2 托管
\`\`\`

### Windows

\`\`\`bat
cd .output
copy .env.example .env
:: 编辑 .env 填写生产配置
pnpm install --prod
npx prisma generate
npx prisma migrate deploy
start.bat
\`\`\`

## 关键环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| \`DATABASE_PROVIDER\` | sqlite 或 mysql | sqlite |
| \`DATABASE_URL\` | SQLite \`file:\` 或 MySQL \`mysql://\` | \`file:./prisma/dev.db\` |
| \`JWT_SECRET\` | JWT 签名密钥，生产必填 | 开发占位值（生产阻止启动） |
| \`SITE_URL\` | 站点对外 URL | \`http://localhost:4321\` |
| \`PORT\` | 监听端口 | 4321 |
| \`HOST\` | 监听地址 | 0.0.0.0 |
| \`CONFIG_ENCRYPTION_KEY\` | SMTP 密码加密密钥 | 未设置（不配 SMTP 密码时无需） |
| \`MAIL_DELIVERY_MODE\` | 邮件投递模式 disabled/webhook | disabled |
| \`SITE_MODES\` | 启用的频道 | weibo,forum,blog |
| \`API_V1_ENABLED\` | 是否启用 v1 JSON API | true |
| \`API_AGENT_ENABLED\` | 是否启用 Agent API | true |

## 数据库切换

切换 provider 后必须重新运行 \`npx prisma generate && npx prisma migrate deploy\`。
两个 provider 使用各自的 \`0_init\` 基线，不是相互转换迁移。

## 常用命令

\`\`\`bash
npx prisma generate           # 重新生成 Client
npx prisma migrate deploy     # 应用迁移
npx prisma studio             # 数据库管理界面
npx tsx prisma/seed.ts        # 执行种子数据
pm2 logs mutan                # 查看日志
pm2 restart mutan             # 重启
\`\`\`
`
);
ok('部署辅助文件已生成');

// 在 .output 中安装声明的生产依赖，避免根目录 node_modules 掩盖部署包缺依赖。
log('启动服务验证 ...');
const testPort = 14399;

// 生成临时 .env 供服务启动读取
writeFileSync(
	join(output, '.env'),
	`DATABASE_PROVIDER="sqlite"\nDATABASE_URL="file:./_test.db"\nJWT_SECRET="mutan-dev-secret-change-in-production"\nSITE_URL="http://localhost:${testPort}"\nSITE_TITLE="运行期配置验证"\nSITE_MODES="weibo,forum,blog"\n`
);

log('安装生产依赖进行隔离验证 ...');
run('pnpm install --prod --ignore-scripts --lockfile=false', { cwd: output });
ok('生产依赖安装完成');

// 应用迁移到测试库（用环境变量覆盖 DATABASE_URL，确保不读到源项目的 .env）
run(`npx prisma migrate deploy`, {
	cwd: output,
	env: { ...process.env, DATABASE_PROVIDER: 'sqlite', DATABASE_URL: 'file:./_test.db' }
});

// 使用 .output 自身已安装的生产依赖启动服务。
const probe = execSync(
	`node -e "
		const { spawn } = require('child_process');
		const srv = spawn(process.execPath, ['-r', 'dotenv/config', 'dist/server/entry.mjs'], {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, PORT: '${testPort}', NODE_ENV: 'test' },
			cwd: process.cwd()
		});
		let buf = '';
		srv.stdout.on('data', (d) => {
			buf += d;
			if (buf.includes('listening')) check();
		});
		srv.stderr.on('data', (d) => {
			buf += d;
			if (buf.includes('listening')) check();
		});
		let checked = false;
		function check() {
			if (checked) return; checked = true;
			setTimeout(async () => {
				const routes = [
					'/',
					'/login',
					'/register',
					'/weibo',
					'/api/v1/posts?page=1&pageSize=1',
					'/robots.txt'
				];
				let allOk = true;
				for (const r of routes) {
					try {
						const res = await fetch('http://localhost:${testPort}' + r);
						if (!res.ok) {
							console.log('FAIL ' + res.status + ' ' + r);
							allOk = false;
						} else {
							console.log('OK   ' + res.status + ' ' + r);
							if (r === '/' && !(await res.text()).includes('运行期配置验证')) {
								console.log('FAIL 运行期 .env 配置未生效');
								allOk = false;
							}
						}
					} catch (e) {
						console.log('ERR  ' + r + ' ' + e.message);
						allOk = false;
					}
				}
				srv.kill('SIGTERM');
				process.exit(allOk ? 0 : 1);
			}, 1500);
		}
		setTimeout(() => { console.log('TIMEOUT'); srv.kill('SIGTERM'); process.exit(1); }, 15000);
	"`,
	{
		cwd: output,
		env: { ...process.env, PORT: String(testPort), NODE_ENV: 'test' },
		stdio: 'pipe',
		timeout: 20000
	}
).toString();

console.log(probe);
ok('服务验证通过');

// ── 6. 清理测试残留 ──────────────────────────────────
log('清理测试残留 ...');
if (existsSync(join(output, '.env'))) unlinkSync(join(output, '.env'));
if (existsSync(join(output, '_test.db'))) unlinkSync(join(output, '_test.db'));
if (existsSync(join(output, 'app.db'))) unlinkSync(join(output, 'app.db'));
if (existsSync(join(output, 'node_modules'))) forceRemove(join(output, 'node_modules'));
// uploads 和 logs 保留空目录
mkdirSync(join(output, 'uploads'), { recursive: true });
mkdirSync(join(output, 'logs'), { recursive: true });
ok('清理完成');
forceRemove(join(root, 'dist'));
ok('根目录 dist/ 已移除');

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
