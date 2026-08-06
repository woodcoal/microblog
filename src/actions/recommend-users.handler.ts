/** 推荐用户 Action 的可测试鉴权适配层。 */
import { getUserFromRequest } from '@/lib/auth';
import { getRecommendUsers } from '@/services/recommend.service';
import type { APIContext } from 'astro';

type RecommendUsersActionContext = Pick<APIContext, 'request' | 'cookies'>;

export interface RecommendUsersActionInput {
	n?: number;
}

/** 未登录时由 Astro Action 包装层转换为标准 ActionError。 */
export class RecommendUsersUnauthorizedError extends Error {
	readonly code = 'UNAUTHORIZED' as const;

	constructor() {
		super('请先登录');
	}
}

/**
 * 执行推荐用户 Action 的鉴权与 Service 调用。
 *
 * 单独导出使该 Action 的未登录行为无需启动 Astro HTTP 服务器也可回归测试。
 */
export async function getRecommendUsersActionHandler(
	input: RecommendUsersActionInput,
	context: RecommendUsersActionContext
) {
	const currentUser = await getUserFromRequest(context);
	if (!currentUser) throw new RecommendUsersUnauthorizedError();

	return getRecommendUsers({ userId: currentUser.userId, n: input.n });
}
