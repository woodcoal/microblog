import type { APIRoute } from 'astro';

/** 原图端点已停止服务，所有图片仅暴露受控展示副本。 */
const notFound = () => new Response('Not Found', { status: 404 });

export const GET: APIRoute = () => notFound();
export const HEAD: APIRoute = () => notFound();
