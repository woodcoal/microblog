import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { UPLOAD_DIR } from '@/lib/config';

/** 读取上传目录内的文件，并拒绝绝对路径、穿越及符号链接逃逸。 */
export async function readStoredFile(filePath: string): Promise<Uint8Array | null> {
	if (!filePath || isAbsolute(filePath)) return null;
	try {
		const root = await realpath(resolve(UPLOAD_DIR));
		const target = await realpath(resolve(root, filePath));
		const rel = relative(root, target);
		if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
		return await readFile(target);
	} catch {
		return null;
	}
}

/** 将 Node Buffer 拷贝成 Fetch Response 可接受的独占 ArrayBuffer。 */
export function toResponseBody(data: Uint8Array): ArrayBuffer {
	return new Uint8Array(data).buffer;
}

/** RFC 5987 文件名编码，避免响应头注入。 */
export function contentDisposition(originalName: string): string {
	const fallback =
		originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\\r\n]/g, '_') || 'download';
	const encoded = encodeURIComponent(originalName).replace(
		/['()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
