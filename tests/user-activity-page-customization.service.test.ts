import 'dotenv/config';

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';
import { loginUser } from '../src/services/auth.service';
import { createComment, createPost } from '../src/services/content.service';
import {
	readPageCustomization,
	updatePageCustomization
} from '../src/services/page-customization.service';
import { toggleLike } from '../src/services/social.service';

const suffix = crypto.randomUUID().replaceAll('-', '');
const name = (prefix: string) => `${prefix}${suffix}`.slice(0, 20);

after(async () => prisma.$disconnect());

test('成功登录原子更新三项活动数据，失败登录不写入', async () => {
	const password = 'activity-password';
	const user = await prisma.user.create({
		data: {
			username: name('active'),
			displayName: '活跃用户',
			email: `${suffix}@example.test`,
			passwordHash: await hashPassword(password),
			emailVerificationRequired: false
		}
	});
	await assert.rejects(loginUser({ email: user.email, password: 'wrong-password' }));
	assert.deepEqual(
		await prisma.user.findUniqueOrThrow({
			where: { id: user.id },
			select: { lastLoginAt: true, lastActiveAt: true, loginCount: true }
		}),
		{ lastLoginAt: null, lastActiveAt: null, loginCount: 0 }
	);
	await loginUser({ email: user.email, password });
	const persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
	assert.ok(persisted.lastLoginAt);
	assert.ok(persisted.lastActiveAt);
	assert.equal(persisted.loginCount, 1);
});

test('页面定制仅管理员可读写，并同步保存页脚版本、脚本和审计', async () => {
	const [admin, user] = await Promise.all([
		prisma.user.create({
			data: {
				username: name('pageadmin'),
				displayName: '页面管理员',
				email: `${suffix}.admin@example.test`,
				passwordHash: 'not-used',
				role: 'admin',
				emailVerificationRequired: false
			}
		}),
		prisma.user.create({
			data: {
				username: name('pageuser'),
				displayName: '页面用户',
				email: `${suffix}.user@example.test`,
				passwordHash: 'not-used',
				emailVerificationRequired: false
			}
		})
	]);
	await assert.rejects(readPageCustomization(user.id), /仅管理员可操作/);
	const result = await updatePageCustomization({
		userId: admin.id,
		footerMarkdown: '页脚 [链接](https://example.test)',
		publicAnalyticsScript: '<script>window.analyticsReady=true</script>'
	});
	assert.match(result.footer.html, /https:\/\/example\.test/);
	assert.equal(result.publicAnalyticsScript, '<script>window.analyticsReady=true</script>');
	assert.equal(await prisma.siteCopyVersion.count({ where: { key: 'global.footer' } }), 1);
	assert.equal(
		await prisma.activityLog.count({
			where: { actorId: admin.id, action: 'admin.page_customization_updated' }
		}),
		1
	);
	await assert.rejects(
		updatePageCustomization({
			userId: admin.id,
			publicAnalyticsScript: 'x'.repeat(64 * 1024 + 1)
		}),
		/64 KiB/
	);
});

test('发帖、评论和点赞切换成功后更新服务端活跃时间', async () => {
	const [author, actor] = await Promise.all(
		['author', 'actor'].map((prefix) =>
			prisma.user.create({
				data: {
					username: name(prefix),
					displayName: prefix,
					email: `${prefix}.${suffix}@example.test`,
					passwordHash: 'not-used',
					emailVerificationRequired: false
				}
			})
		)
	);
	const post = await createPost({ userId: author.id, content: '活动时间事务测试' });
	assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).lastActiveAt);
	await prisma.user.update({ where: { id: actor.id }, data: { lastActiveAt: null } });
	await createComment({ userId: actor.id, postId: post.id, content: '评论' });
	assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).lastActiveAt);
	await prisma.user.update({ where: { id: actor.id }, data: { lastActiveAt: null } });
	await toggleLike({ userId: actor.id, targetId: post.id, type: 'post' });
	assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).lastActiveAt);
	await prisma.user.update({ where: { id: actor.id }, data: { lastActiveAt: null } });
	await toggleLike({ userId: actor.id, targetId: post.id, type: 'post' });
	assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).lastActiveAt);
});
