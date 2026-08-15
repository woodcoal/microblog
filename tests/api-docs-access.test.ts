import assert from 'node:assert/strict';
import test from 'node:test';
import { isInternalIpAddress, mayAccessApiDocs } from '../src/lib/network';
import { createAgentOpenApiSpec } from '../src/lib/agent-openapi';

test('内网地址判定仅允许回环、私有和链路本地地址', () => {
	for (const address of [
		'127.0.0.1',
		'127.255.255.255',
		'10.0.0.1',
		'10.255.255.255',
		'172.16.0.1',
		'172.31.255.255',
		'192.168.0.1',
		'192.168.255.255',
		'169.254.1.1',
		'::1',
		'fc00::1',
		'fdff::1',
		'fe80::1',
		'::ffff:192.168.1.1'
	]) {
		assert.equal(isInternalIpAddress(address), true, address);
	}

	for (const address of [
		'',
		'unknown',
		'8.8.8.8',
		'172.15.255.255',
		'172.32.0.0',
		'192.167.255.255',
		'::ffff:8.8.8.8',
		'2001:4860:4860::8888',
		'not-an-ip'
	]) {
		assert.equal(isInternalIpAddress(address), false, address || '空地址');
	}
});

test('文档非公开时仅内网客户端可访问', () => {
	for (const address of ['127.0.0.1', '192.168.1.1', '::1', 'fc00::1']) {
		assert.equal(mayAccessApiDocs(address, false), true, address);
	}
	for (const address of ['8.8.8.8', '2001:4860:4860::8888', 'unknown']) {
		assert.equal(mayAccessApiDocs(address, false), false, address);
	}
});

test('文档公开时任何客户端均可访问', () => {
	assert.equal(mayAccessApiDocs('8.8.8.8', true), true);
	assert.equal(mayAccessApiDocs('2001:4860:4860::8888', true), true);
});

test('Agent OpenAPI 表达全局入口密钥与用户 Token 的 AND 关系', () => {
	const spec = createAgentOpenApiSpec();
	assert.deepEqual(spec.components.securitySchemes.AgentGlobalKey, {
		type: 'api',
		in: 'header',
		name: 'x-agent-key',
		description: 'Agent 服务端入口密钥。所有 Agent 接口均要求。'
	});
	assert.deepEqual(spec.paths['/posts'].get.security, [
		{ AgentGlobalKey: [], BearerAPIToken: [] }
	]);
	for (const path of [
		'/register',
		'/login',
		'/verify-email',
		'/resend-verification',
		'/forgot-password',
		'/reset-password',
		'/confirm-email-change'
	] as const) {
		assert.deepEqual(spec.paths[path].post.security, [{ AgentGlobalKey: [] }], path);
	}
	assert.match(
		spec.paths['/login'].post.responses[200].content['text/plain'].example,
		/apiKey: mt_example/
	);
	for (const path of ['/posts/{id}', '/comments/{id}', '/notifications/{id}'] as const) {
		assert.deepEqual(
			spec.paths[path].delete.security,
			[{ AgentGlobalKey: [], BearerAPIToken: [] }],
			path
		);
	}
	assert.deepEqual(spec.paths['/notifications/read'].post.security, [
		{ AgentGlobalKey: [], BearerAPIToken: [] }
	]);
});
