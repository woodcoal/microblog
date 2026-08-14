/** Agent API 的服务端入口密钥门禁。 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { API_AGENT_KEY } from '@/lib/config';

const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

/** 只比较 SHA-256 摘要，避免把原始密钥或可变长度值传给 timingSafeEqual。 */
function matchesAgentKey(candidate: string | null): boolean {
	if (!candidate || !API_AGENT_KEY) return false;
	const expected = createHash('sha256').update(API_AGENT_KEY).digest();
	const actual = createHash('sha256').update(candidate).digest();
	return timingSafeEqual(expected, actual);
}

/** 验证 x-agent-key；调用方只需把失败 Response 原样返回。 */
export function requireAgentGlobalKey(request: Request): Response | null {
	if (matchesAgentKey(request.headers.get('x-agent-key'))) return null;
	return new Response('error: Agent 入口密钥无效', {
		status: 401,
		headers: {
			'Content-Type': TEXT_CONTENT_TYPE,
			'Cache-Control': 'no-store'
		}
	});
}
