/** 发帖图片水印的纯校验、SVG 合成及受控派生文件写入。 */
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { prisma } from '@/lib/db';
import { ServiceError } from '@/lib/errors';
import { UPLOAD_DIR } from '@/lib/config';
import { readStoredFile } from '@/lib/media-file';
const POSITION_ANCHORS: Record<string, { x: string; y: string; anchor: string }> = {
	'top-left': { x: '0', y: '0', anchor: 'start' },
	'top-center': { x: '50%', y: '0', anchor: 'middle' },
	'top-right': { x: '100%', y: '0', anchor: 'end' },
	'middle-left': { x: '0', y: '50%', anchor: 'start' },
	'middle-center': { x: '50%', y: '50%', anchor: 'middle' },
	'middle-right': { x: '100%', y: '50%', anchor: 'end' },
	'bottom-left': { x: '0', y: '100%', anchor: 'start' },
	'bottom-center': { x: '50%', y: '100%', anchor: 'middle' },
	'bottom-right': { x: '100%', y: '100%', anchor: 'end' }
};
const POSITIONS: Record<string, true> = Object.fromEntries(
	Object.keys(POSITION_ANCHORS).map((position) => [position, true])
);
const DEFAULT_TEMPLATE = '{{username}} · {{nickname}} · {{publishedAt}}';

/** 水印配置的稳定传输形态。 */
export type WatermarkConfiguration = {
	enabled: boolean;
	template: string;
	position: string;
	offsetX: number;
	offsetY: number;
	fontSize: number;
	color: string;
	opacity: number;
	rotation: number;
	tiled: boolean;
};

/** 未落库配置的默认值。 */
export const DEFAULT_WATERMARK_CONFIGURATION: WatermarkConfiguration = {
	enabled: false,
	template: DEFAULT_TEMPLATE,
	position: 'bottom-right',
	offsetX: -24,
	offsetY: -24,
	fontSize: 24,
	color: '#FFFFFF',
	opacity: 0.65,
	rotation: 0,
	tiled: false
};

/** 将数据库字段映射为对外水印配置。 */
export function toWatermarkConfiguration(
	config: Partial<{
		watermarkEnabled: boolean;
		watermarkTemplate: string;
		watermarkPosition: string;
		watermarkOffsetX: number;
		watermarkOffsetY: number;
		watermarkFontSize: number;
		watermarkColor: string;
		watermarkOpacity: number;
		watermarkRotation: number;
		watermarkTiled: boolean;
	}> | null
): WatermarkConfiguration {
	return {
		enabled: config?.watermarkEnabled ?? DEFAULT_WATERMARK_CONFIGURATION.enabled,
		template: config?.watermarkTemplate ?? DEFAULT_WATERMARK_CONFIGURATION.template,
		position: config?.watermarkPosition ?? DEFAULT_WATERMARK_CONFIGURATION.position,
		offsetX: config?.watermarkOffsetX ?? DEFAULT_WATERMARK_CONFIGURATION.offsetX,
		offsetY: config?.watermarkOffsetY ?? DEFAULT_WATERMARK_CONFIGURATION.offsetY,
		fontSize: config?.watermarkFontSize ?? DEFAULT_WATERMARK_CONFIGURATION.fontSize,
		color: config?.watermarkColor ?? DEFAULT_WATERMARK_CONFIGURATION.color,
		opacity: config?.watermarkOpacity ?? DEFAULT_WATERMARK_CONFIGURATION.opacity,
		rotation: config?.watermarkRotation ?? DEFAULT_WATERMARK_CONFIGURATION.rotation,
		tiled: config?.watermarkTiled ?? DEFAULT_WATERMARK_CONFIGURATION.tiled
	};
}

/** 校验完整水印配置，禁止未知和残缺模板占位符。 */
export function validateWatermarkConfiguration(value: unknown): WatermarkConfiguration {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new ServiceError('BAD_REQUEST', '水印配置必须是对象');
	const input = value as Record<string, unknown>;
	const expected: Record<string, true> = Object.fromEntries(
		Object.keys(DEFAULT_WATERMARK_CONFIGURATION).map((key) => [key, true])
	);
	if (Object.keys(input).some((key) => !expected[key]))
		throw new ServiceError('BAD_REQUEST', '水印配置包含未知字段');
	if (Object.keys(DEFAULT_WATERMARK_CONFIGURATION).some((key) => input[key] === undefined))
		throw new ServiceError('BAD_REQUEST', '水印配置必须完整提交');
	const template = typeof input.template === 'string' ? input.template.trim() : '';
	if (template.length < 1 || template.length > 256 || /[\r\n]/.test(template))
		throw new ServiceError('BAD_REQUEST', '水印模板必须为 1–256 个单行字符');
	for (const token of template.match(/{{[^}]*}}|{{|}}/g) ?? []) {
		if (!({ '{{username}}': true, '{{nickname}}': true, '{{publishedAt}}': true } as Record<string, true>)[token])
			throw new ServiceError('BAD_REQUEST', '水印模板包含未知或残缺占位符');
	}
	const integer = (key: 'offsetX' | 'offsetY' | 'fontSize', min: number, max: number) => {
		const number = input[key];
		if (typeof number !== 'number' || !Number.isInteger(number) || number < min || number > max)
			throw new ServiceError('BAD_REQUEST', `${key} 无效`);
		return number;
	};
	const decimal = (key: 'opacity' | 'rotation', min: number, max: number) => {
		const number = input[key];
		if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max)
			throw new ServiceError('BAD_REQUEST', `${key} 无效`);
		return number;
	};
	if (typeof input.enabled !== 'boolean' || typeof input.tiled !== 'boolean')
		throw new ServiceError('BAD_REQUEST', '水印开关无效');
	if (typeof input.position !== 'string' || !POSITIONS[input.position])
		throw new ServiceError('BAD_REQUEST', '水印位置无效');
	if (typeof input.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(input.color))
		throw new ServiceError('BAD_REQUEST', '水印颜色必须为 #RRGGBB');
	return {
		enabled: input.enabled,
		template,
		position: input.position,
		offsetX: integer('offsetX', -512, 512),
		offsetY: integer('offsetY', -512, 512),
		fontSize: integer('fontSize', 10, 128),
		color: input.color.toUpperCase(),
		opacity: decimal('opacity', 0.05, 1),
		rotation: decimal('rotation', -180, 180),
		tiled: input.tiled
	};
}

/** XML 转义外部文本，防止模板变量突破 SVG 文本节点。 */
export function escapeXml(value: string): string {
	const entities: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&apos;'
	};
	return value.replace(/[&<>"']/g, (character) => entities[character]!);
}

/** 用创建时快照替换合法模板变量。 */
export function interpolateWatermarkTemplate(
	template: string,
	values: { username: string; nickname: string; publishedAt: string }
): string {
	return template.replace(/{{(username|nickname|publishedAt)}}/g, (_, key: keyof typeof values) => values[key]);
}

function anchorFor(position: string): { x: string; y: string; anchor: string } {
	return POSITION_ANCHORS[position]!;
}

/** 创建可交由 sharp 叠加的安全 SVG。 */
export function createWatermarkSvg(
	configuration: WatermarkConfiguration,
	text: string,
	width: number,
	height: number
): Buffer {
	const anchor = anchorFor(configuration.position);
	const escapedText = escapeXml(text);
	const transform = `translate(${configuration.offsetX} ${configuration.offsetY}) rotate(${configuration.rotation} ${width / 2} ${height / 2})`;
	const label = `<text x="${anchor.x}" y="${anchor.y}" text-anchor="${anchor.anchor}" dominant-baseline="middle" font-family="sans-serif" font-size="${configuration.fontSize}" fill="${configuration.color}" fill-opacity="${configuration.opacity}" transform="${transform}">${escapedText}</text>`;
	const content = configuration.tiled
		? `<defs><pattern id="watermark" width="${Math.max(configuration.fontSize * 12, 180)}" height="${Math.max(configuration.fontSize * 5, 96)}" patternUnits="userSpaceOnUse">${label}</pattern></defs><rect width="100%" height="100%" fill="url(#watermark)"/>`
		: label;
	return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`);
}

/** 渲染固定预览，不写文件、不访问数据库。 */
export async function previewWatermark(configuration: WatermarkConfiguration) {
	const text = interpolateWatermarkTemplate(configuration.template, {
		username: 'example_user',
		nickname: '示例用户',
		publishedAt: '2026-01-02T03:04:05.000Z'
	});
	const width = 960;
	const height = 540;
	const image = await sharp({ create: { width, height, channels: 3, background: '#334155' } })
		.composite([{ input: createWatermarkSvg(configuration, text, width, height) }])
		.webp()
		.toBuffer();
	return { dataUrl: `data:image/webp;base64,${image.toString('base64')}`, width, height, text };
}

async function removeWatermark(path: string | null | undefined): Promise<void> {
	if (path && existsSync(join(UPLOAD_DIR, path))) await unlink(join(UPLOAD_DIR, path));
}

/** 为一个已确认归属的图片 Media 创建独立水印副本；失败由调用方逐图降级。 */
export async function renderMediaWatermark(input: {
	mediaId: string;
	filePath: string;
	configuration: WatermarkConfiguration;
	username: string;
	nickname: string;
	publishedAt: Date;
}): Promise<void> {
	const source = await readStoredFile(input.filePath);
	if (!source) throw new Error('source_missing');
	const sourceImage = sharp(source, { failOn: 'error' }).rotate();
	const metadata = await sourceImage.metadata();
	if (!metadata.width || !metadata.height) throw new Error('image_metadata_invalid');
	const text = interpolateWatermarkTemplate(input.configuration.template, {
		username: input.username,
		nickname: input.nickname,
		publishedAt: input.publishedAt.toISOString()
	});
	const rendered = await sourceImage
		.composite([{ input: createWatermarkSvg(input.configuration, text, metadata.width, metadata.height) }])
		.webp({ quality: 82 })
		.toBuffer({ resolveWithObject: true });
	const relativePath = `protected/images/watermark-v1/${input.mediaId}.webp`;
	const fullPath = join(UPLOAD_DIR, relativePath);
	await mkdir(join(UPLOAD_DIR, 'protected/images/watermark-v1'), { recursive: true });
	await writeFile(fullPath, rendered.data);
	try {
		await prisma.media.update({
			where: { id: input.mediaId },
			data: {
				watermarkFilePath: relativePath,
				watermarkFileSize: rendered.data.byteLength,
				watermarkMimeType: 'image/webp',
				watermarkWidth: rendered.info.width,
				watermarkHeight: rendered.info.height
			}
		});
	} catch (error) {
		await removeWatermark(relativePath);
		throw error;
	}
}

/** 按 Media 记录删除水印派生文件；原始存储及引用计数保持不变。 */
export async function cleanupWatermarkFiles(paths: Array<string | null | undefined>): Promise<void> {
	await Promise.allSettled(paths.map((path) => removeWatermark(path)));
}
