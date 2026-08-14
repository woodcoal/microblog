import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';
import { loginUser } from '../src/services/auth.service';
import { createPostTransaction } from '../src/lib/post';
import { createCommentWithActivity } from '../src/lib/comment';
import { toggleLike } from '../src/services/social.service';
import {
	readPageCustomization,
	updatePageCustomization
} from '../src/services/page-customization.service';

const suffix = crypto.randomUUID().replaceAll('-', '');
const name = (prefix: string) => `${prefix}${suffix}`.slice(0, 20);
const email = `${suffix}@example.test`;
const password = 'activity-test-password';

after(async () => prisma.$disconnect());

test('成功登录、发帖、评论与点赞都由服务端更新活动时间，失败登录不更新', async () => {
	const user = await prisma.user.create({
		data: {
			username: name('activity'),
			displayName: '活动测试用户',
			email,
			passwordHash: await hashPassword(password),
			emailVerificationRequired: false
		}
	});

	await loginUser({ email, password });
	let persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.ok(persisted.lastLoginAt);
	assert.ok(persisted.lastActiveAt);
	assert.equal(persisted.loginCount, 1);
	const loginAt = persisted.lastLoginAt.getTime();
	await assert.rejects(loginUser({ email, password: 'wrong-password' }), /邮箱或密码错误/);
	persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.equal(persisted.lastLoginAt?.getTime(), loginAt);
	assert.equal(persisted.loginCount, 1);

	await prisma.user.update({
		where: { id: user.id },
		data: { lastActiveAt: new Date(1) }
	});
	const post = await createPostTransaction({
		postData: {
			id: crypto.randomUUID(),
			userId: user.id,
			content: '活动时间测试帖子',
			visibility: 'public',
			mode: 'weibo'
		},
		mediaItems: [],
		mentionUsernames: [],
		tagNames: [],
		currentUserId: user.id
	});
	persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.ok((persisted.lastActiveAt?.getTime() ?? 0) > 1);

	await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date(1) } });
	const comment = await createCommentWithActivity(
		{ postId: post.id, userId: user.id, content: '活动时间测试评论' },
		{ user: { select: { id: true } } }
	);
	persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.ok((persisted.lastActiveAt?.getTime() ?? 0) > 1);

	await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date(1) } });
	assert.equal(
		(await toggleLike({ userId: user.id, targetId: comment.id, type: 'comment' })).liked,
		true
	);
	persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.ok((persisted.lastActiveAt?.getTime() ?? 0) > 1);
	assert.equal(
		(await toggleLike({ userId: user.id, targetId: comment.id, type: 'comment' })).liked,
		false
	);
});

test('页面自定义仅管理员可读写，页脚审计与脚本配置一起保存', async () => {
	const admin = await prisma.user.create({
		data: {
			username: name('admin'),
			displayName: '配置管理员',
			email: `${suffix}.admin@example.test`,
			passwordHash: 'not-used',
			role: 'admin',
			emailVerificationRequired: false
		}
	});
	const member = await prisma.user.create({
		data: {
			username: name('member'),
			displayName: '普通用户',
			email: `${suffix}.member@example.test`,
			passwordHash: 'not-used',
			emailVerificationRequired: false
		}
	});
	await assert.rejects(readPageCustomization(member.id), /仅管理员可操作/);
	const result = await updatePageCustomization({
		userId: admin.id,
		footerMarkdown: '页脚 [链接](https://example.test) <script>alert(1)</script>',
		publicAnalyticsScript: '<script src="https://analytics.example.test/a.js"></script>'
	});
	assert.match(result.footer.html, /https:\/\/example\.test/);
	assert.doesNotMatch(result.footer.html, /<script/i);
	assert.equal(
		result.publicAnalyticsScript,
		'<script src="https://analytics.example.test/a.js"></script>'
	);
	assert.equal(
		await prisma.siteCopyVersion.count({
			where: { key: 'global.footer', updatedById: admin.id }
		}),
		1
	);
	assert.equal(
		await prisma.activityLog.count({
			where: { actorId: admin.id, action: 'admin.page_customization_updated' }
		}),
		1
	);
});
