/** 所有外部上传协议共用的应用层入口。 */
import { ServiceError } from '@/lib/errors';
import { deleteFileRef, findFileStorageByFilePath } from '@/lib/upload';
import { findUserById, updateUser } from '@/lib/user';
import {
	consumeStandaloneUpload,
	uploadFile,
	type UploadFileResult
} from '@/services/media.service';
import type { UploadFileType } from '@/lib/upload';

export type UploadChannel = 'web-action' | 'legacy-api' | 'v1' | 'agent';
export type UploadCommand = {
	userId: string;
	channel: UploadChannel;
	purpose: 'media' | 'avatar';
	file: unknown;
	requestedType?: unknown;
};
export type UploadResult =
	| { purpose: 'media'; data: UploadFileResult }
	| { purpose: 'avatar'; data: { avatarUrl: string } };

function fileType(value: unknown, channel: UploadChannel): UploadFileType {
	if (value !== 'image' && value !== 'video' && value !== 'attachment') {
		throw new ServiceError('BAD_REQUEST', '文件类型参数无效');
	}
	if (channel === 'agent' && value === 'attachment') {
		throw new ServiceError('BAD_REQUEST', 'fileType 仅支持 image 或 video');
	}
	return value;
}

export function executeUpload(
	command: UploadCommand & { purpose: 'media' }
): Promise<{ purpose: 'media'; data: UploadFileResult }>;
export function executeUpload(
	command: UploadCommand & { purpose: 'avatar' }
): Promise<{ purpose: 'avatar'; data: { avatarUrl: string } }>;
export async function executeUpload(command: UploadCommand): Promise<UploadResult> {
	if (!(command.file instanceof File))
		throw new ServiceError('BAD_REQUEST', '请选择要上传的文件');
	if (command.purpose === 'media') {
		return {
			purpose: 'media',
			data: await uploadFile({
				userId: command.userId,
				file: command.file,
				fileType: fileType(command.requestedType ?? 'image', command.channel)
			})
		};
	}
	if (command.channel !== 'web-action') throw new ServiceError('BAD_REQUEST', '头像上传通道无效');
	const stored = await uploadFile({
		userId: command.userId,
		file: command.file,
		fileType: 'image'
	});
	await consumeStandaloneUpload(command.userId, stored.reservationId);
	const user = await findUserById(command.userId, { avatarUrl: true });
	await updateUser(command.userId, { avatarUrl: stored.url });
	if (user?.avatarUrl?.startsWith('/uploads/')) {
		const old = await findFileStorageByFilePath(user.avatarUrl.slice('/uploads/'.length));
		if (old) await deleteFileRef(old.id);
	}
	return { purpose: 'avatar', data: { avatarUrl: stored.url } };
}
