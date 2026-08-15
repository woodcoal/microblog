/** Agent 通知删除 API。 */
import type { APIRoute } from 'astro';
import { handleAgentError, requireAgentAuth, textResponse } from '@/lib/agent';
import { deleteNotification } from '@/services/notification.service';

/** 删除当前用户收到的一条通知。 */
export const DELETE: APIRoute = async (context) => {
	try {
		const authResult = await requireAgentAuth(context);
		if (authResult instanceof Response) return authResult;

		await deleteNotification({
			userId: authResult.userId,
			notificationId: context.params.id ?? ''
		});
		return textResponse('ok');
	} catch (error) {
		return handleAgentError(error, '删除通知');
	}
};
