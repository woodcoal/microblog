import bcrypt from 'bcryptjs';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createDatabaseAdapter } from '../../src/lib/database-adapter.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('浏览器回归夹具需要 DATABASE_URL');

const prisma = new PrismaClient({ adapter: createDatabaseAdapter(databaseUrl) });

async function main() {
	const passwordHash = await bcrypt.hash('qa-browser-password', 10);
	const [author, viewer] = await Promise.all([
		prisma.user.create({
			data: {
				username: 'qa-author',
				displayName: 'QA 作者',
				email: 'qa-author@example.test',
				passwordHash,
				bio: '用于浏览器回归的作者资料。'
			}
		}),
		prisma.user.create({
			data: {
				username: 'qa-viewer',
				displayName: 'QA 阅读者',
				email: 'qa-viewer@example.test',
				passwordHash
			}
		})
	]);

	const forumCategory = await prisma.category.create({
		data: { name: 'QA 论坛', slug: 'qa-forum', mode: 'forum', description: '回归测试版块' }
	});
	const blogCategory = await prisma.category.create({
		data: { name: 'QA 博客', slug: 'qa-blog', mode: 'blog', description: '回归测试分类' }
	});

	await prisma.post.createMany({
		data: [
			{
				id: 'qaweibo1',
				userId: author.id,
				mode: 'weibo',
				title: 'QA 微博标题',
				content: 'QA_WEIBO_BODY'
			},
			{
				id: 'qaforum1',
				userId: author.id,
				mode: 'forum',
				title: 'QA 论坛标题',
				content: 'QA_FORUM_BODY',
				categoryId: forumCategory.id
			},
			{
				id: 'qablog001',
				userId: author.id,
				mode: 'blog',
				title: 'QA 博客标题',
				content: '## QA 博客正文\n\nQA_BLOG_BODY',
				categoryId: blogCategory.id
			},
			{
				id: 'qapasswd1',
				userId: author.id,
				mode: 'weibo',
				title: '密码保护内容',
				content: 'QA_PASSWORD_SECRET',
				visibility: 'password',
				passwordHash
			},
			{
				id: 'qaunknown',
				userId: author.id,
				mode: 'legacy-mode',
				title: '不支持的模式',
				content: '不能作为详情页降级展示。'
			}
		]
	});

	await Promise.all([
		prisma.comment.create({
			data: { postId: 'qaforum1', userId: viewer.id, content: 'QA_FORUM_COMMENT' }
		}),
		prisma.media.create({
			data: {
				post: { connect: { id: 'qaforum1' } },
				fileType: 'attachment',
				originalName: 'qa-evidence.txt',
				fileStorage: {
					create: {
						md5Hash: 'qa-browser-fixture-attachment',
						filePath: 'qa/qa-evidence.txt',
						fileSize: 2048,
						mimeType: 'text/plain',
						fileType: 'attachment'
					}
				}
			}
		}),
		prisma.media.create({
			data: {
				post: { connect: { id: 'qablog001' } },
				fileType: 'image',
				slot: 'thumbnail',
				originalName: 'qa-blog-thumbnail.png',
				fileStorage: {
					create: {
						md5Hash: 'qa-browser-fixture-blog-thumbnail',
						filePath: 'images/qa-blog-thumbnail.png',
						fileSize: 1024,
						mimeType: 'image/png',
						fileType: 'image'
					}
				}
			}
		}),
		prisma.media.create({
			data: {
				post: { connect: { id: 'qablog001' } },
				fileType: 'attachment',
				originalName: 'qa-blog-guide.pdf',
				fileStorage: {
					create: {
						md5Hash: 'qa-browser-fixture-blog-attachment',
						filePath: 'attachments/qa-blog-guide.pdf',
						fileSize: 4096,
						mimeType: 'application/pdf',
						fileType: 'attachment'
					}
				}
			}
		}),
		prisma.notification.create({
			data: {
				type: 'comment',
				actorId: author.id,
				recipientId: viewer.id,
				postId: 'qaforum1'
			}
		})
	]);
}

await main();
await prisma.$disconnect();
