/** API 文档页面的 Scalar 客户端初始化。 */
import { createApiReference } from '@scalar/api-reference';
import '@scalar/api-reference/style.css';

const selectedApi = new URLSearchParams(window.location.search).get('api');
const specUrl = selectedApi === 'agent' ? '/api/docs.json?api=agent' : '/api/docs.json';

createApiReference('#api-reference', {
	url: specUrl,
	theme: 'default'
});
