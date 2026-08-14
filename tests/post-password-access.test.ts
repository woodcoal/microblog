import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';
import { POST_PASSWORD_ACCESS_COOKIE, setPostPasswordAccess } from '../src/lib/post-password-access';
import { UPLOAD_DIR } from '../src/lib/config';
import { GET as display, HEAD as displayHead } from '../src/pages/media/[mediaId]/display';
import { GET as original, HEAD as originalHead } from '../src/pages/media/[mediaId]/original';
import { GET as stream, HEAD as streamHead } from '../src/pages/media/[mediaId]/stream';

after(async () => prisma.$disconnect());

async function setupMedia(type: 'image' | 'video') {
	const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
	const user = await prisma.user.create({ data: { username: `viewer_${suffix}`, displayName: 'viewer', email: `${suffix}@example.test`, passwordHash: 'hash' } });
	const post = await prisma.post.create({ data: { id: `post_${suffix}`, userId: user.id, content: 'secret', visibility: 'password', passwordHash: await hashPassword('open-sesame'), mode: 'weibo' } });
	const filePath = `protected/${type}s/${suffix}.${type === 'image' ? 'png' : 'mp4'}`;
	const displayPath = type === 'image' ? `protected/images/display-v1/${suffix}.webp` : null;
	await mkdir(join(UPLOAD_DIR, 'protected', `${type}s`), { recursive: true });
	await writeFile(join(UPLOAD_DIR, filePath), type === 'image' ? Buffer.from('original') : Buffer.from('0123456789'));
	if (displayPath) { await mkdir(join(UPLOAD_DIR, 'protected/images/display-v1'), { recursive: true }); await writeFile(join(UPLOAD_DIR, displayPath), Buffer.from('display')); }
	const file = await prisma.fileStorage.create({ data: { md5Hash: `media-${suffix}`, filePath, fileSize: 10, mimeType: type === 'image' ? 'image/png' : 'video/mp4', fileType: type, refCount: 1, ...(displayPath ? { displayFilePath: displayPath, displayFileSize: 7, displayMimeType: 'image/webp', displayWidth: 1, displayHeight: 1 } : {}) } });
	const media = await prisma.media.create({ data: { postId: post.id, fileStorageId: file.id, fileType: type, sortOrder: 0 } });
	let cookie = '';
	await setPostPasswordAccess({ request: new Request('http://localhost/'), cookies: { set: (_name: string, value: string) => { cookie = `${POST_PASSWORD_ACCESS_COOKIE}=${value}`; } } } as never, post.id);
	const context = (request: Request) => ({ params: { mediaId: media.id }, request, cookies: { get: () => undefined } }) as never;
	return { cookie, context };
}

test('密码帖图片仅在服务端签发访问 cookie 后可读取 display、original 和 HEAD', async () => {
	const { cookie, context } = await setupMedia('image');
	assert.equal((await display(context(new Request('http://localhost/media/x/display')))).status, 404);
	const request = new Request('http://localhost/media/x/display', { headers: { cookie } });
	assert.equal((await display(context(request))).status, 200);
	assert.equal((await original(context(new Request('http://localhost/media/x/original')))).status, 404);
	assert.equal((await original(context(request))).status, 200);
	const head = await displayHead(context(new Request('http://localhost/media/x/display', { headers: { cookie } })));
	assert.equal(head.status, 200);
	assert.equal(await head.text(), '');
	assert.equal((await originalHead(context(new Request('http://localhost/media/x/original', { headers: { cookie } })))).status, 200);
});

test('密码帖视频受 cookie 保护，并支持 Range、416 与 HEAD', async () => {
	const { cookie, context } = await setupMedia('video');
	assert.equal((await stream(context(new Request('http://localhost/media/x/stream')))).status, 404);
	const partial = await stream(context(new Request('http://localhost/media/x/stream', { headers: { cookie, range: 'bytes=2-5' } })));
	assert.equal(partial.status, 206);
	assert.equal(await partial.text(), '2345');
	const invalidRange = await stream(
		context(new Request('http://localhost/media/x/stream', { headers: { cookie, range: 'bytes=99-100' } }))
	);
	assert.equal(invalidRange.status, 416);
	const head = await streamHead(
		context(new Request('http://localhost/media/x/stream', { headers: { cookie, range: 'bytes=0-2' } }))
	);
	assert.equal(head.status, 206);
});
