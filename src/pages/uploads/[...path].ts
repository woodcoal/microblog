/**
 * 上传文件静态服务路由
 *
 * GET /uploads/[...path] — 提供上传目录中的文件访问
 * 支持本地文件系统，自动设置 Content-Type 和 CORS 头。
 */
import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { UPLOAD_DIR } from '@/lib/config';

const MIME_TYPES: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.pdf': 'application/pdf',
	'.zip': 'application/zip',
	'.rar': 'application/x-rar-compressed',
	'.7z': 'application/x-7z-compressed',
	'.doc': 'application/msword',
	'.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'.xls': 'application/vnd.ms-excel',
	'.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'.ppt': 'application/vnd.ms-powerpoint',
	'.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'.txt': 'text/plain',
	'.csv': 'text/csv'
};

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
	'Access-Control-Max-Age': '86400'
};

function getMimeType(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	return MIME_TYPES[ext] || 'application/octet-stream';
}

export const GET: APIRoute = async (context) => {
	try {
		const filePath = context.params.path as string;
		if (!filePath || filePath.includes('..') || filePath.includes('~')) {
			return new Response('Forbidden', {
				status: 403,
				headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' }
			});
		}
		const fullPath = join(UPLOAD_DIR, filePath);
		if (!existsSync(fullPath)) {
			return new Response('Not Found', {
				status: 404,
				headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' }
			});
		}
		const buffer = await readFile(fullPath);
		const mimeType = getMimeType(filePath);
		return new Response(buffer, {
			status: 200,
			headers: {
				...CORS_HEADERS,
				'Content-Type': mimeType,
				'Cache-Control': 'public, max-age=31536000, immutable',
				'Content-Length': buffer.length.toString()
			}
		});
	} catch (error) {
		console.error('文件服务失败:', error);
		return new Response('Internal Server Error', {
			status: 500,
			headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' }
		});
	}
};

export const OPTIONS: APIRoute = async () => {
	return new Response(null, {
		status: 204,
		headers: { ...CORS_HEADERS, 'Access-Control-Allow-Headers': '*' }
	});
};
