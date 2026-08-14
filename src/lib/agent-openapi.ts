/** OpenAPI 描述：面向自动化 Agent 的纯文本 API。 */
import { SITE_DESCRIPTION, SITE_TITLE } from '@/lib/config';

const plainText = (description: string, example = 'ok') => ({
	description,
	content: { 'text/plain': { schema: { type: 'string' }, example } }
});

const errors = {
	400: plainText('请求参数错误', 'error: 请求参数错误'),
	401: plainText('缺少、无效或过期的 Bearer API Token', 'error: 请先登录'),
	403: plainText('无权访问资源', 'error: 无权访问该帖子'),
	404: plainText('资源不存在', 'error: 帖子不存在'),
	500: plainText('服务器内部错误', 'error: 服务器错误')
};

const bearer = [{ BearerAPIToken: [] }];
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const username = { name: 'username', in: 'path', required: true, schema: { type: 'string' } };
const pagination = [
	{ name: 'page', in: 'query', schema: { type: 'integer', default: 1, minimum: 1 } },
	{
		name: 'limit',
		in: 'query',
		schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }
	}
];

/** 返回 /api/agent 的 OpenAPI 3.0 文档。所有成功和失败响应均为 text/plain。 */
export function createAgentOpenApiSpec() {
	return {
		openapi: '3.0.3',
		info: {
			title: `${SITE_TITLE} Agent API`,
			version: '1.0.0',
			description: `${SITE_DESCRIPTION} 的自动化 Agent 接口。所有响应均为 text/plain；成功以 ok 或 ok: 开头，失败以 error: 开头。`
		},
		servers: [{ url: '/api/agent', description: 'Agent 纯文本 API' }],
		security: [{ BearerAPIToken: [] }],
		tags: [
			{ name: '认证' },
			{ name: '帖子' },
			{ name: '用户' },
			{ name: '互动' },
			{ name: '个人账号' },
			{ name: '通知' }
		],
		components: {
			securitySchemes: {
				BearerAPIToken: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'mt_',
					description: '仅接受 Authorization: Bearer mt_...，不接受 Cookie 或 JWT。'
				}
			}
		},
		paths: {
			'/register': {
				post: {
					tags: ['认证'],
					summary: '注册待验证账号',
					security: [],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['email', 'password'],
									properties: {
										username: {
											type: 'string',
											pattern: '^[A-Za-z0-9_]{3,20}$'
										},
										displayName: { type: 'string' },
										email: { type: 'string', format: 'email' },
										password: { type: 'string', minLength: 8, writeOnly: true }
									}
								}
							}
						}
					},
					responses: {
						202: plainText(
							'注册请求已受理；不会披露邮箱是否已注册',
							'ok: 若邮箱可用，验证邮件已发送'
						),
						400: errors[400],
						403: plainText('注册已关闭', 'error: 注册已关闭'),
						500: errors[500]
					}
				}
			},
			'/verify-email': {
				post: {
					tags: ['认证'],
					summary: '消费一次性邮箱验证令牌',
					security: [],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { token: { type: 'string', writeOnly: true } },
									required: ['token']
								}
							}
						}
					},
					responses: {
						200: plainText('验证成功', 'ok: 邮箱验证成功'),
						400: errors[400],
						500: errors[500]
					}
				}
			},
			'/resend-verification': {
				post: {
					tags: ['认证'],
					summary: '请求重发验证邮件',
					security: [],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { email: { type: 'string', format: 'email' } },
									required: ['email']
								}
							}
						}
					},
					responses: {
						200: plainText('请求已接受', 'ok: 若邮箱可用，验证邮件已发送'),
						400: errors[400],
						500: errors[500]
					}
				}
			},
			'/forgot-password': {
				post: {
					tags: ['认证'],
					summary: '请求密码重置邮件（抗枚举）',
					security: [],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { email: { type: 'string', format: 'email' } },
									required: ['email']
								}
							}
						}
					},
					responses: {
						200: plainText('请求已接受', 'ok: 若邮箱可用，重置邮件已发送'),
						400: errors[400],
						500: errors[500]
					}
				}
			},
			'/reset-password': {
				post: {
					tags: ['认证'],
					summary: '消费一次性密码重置令牌并撤销旧凭据',
					security: [],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										token: { type: 'string', writeOnly: true },
										password: { type: 'string', minLength: 8, writeOnly: true }
									},
									required: ['token', 'password']
								}
							}
						}
					},
					responses: {
						200: plainText('重置成功', 'ok: 密码已重置，请使用新密码重新登录'),
						400: errors[400],
						500: errors[500]
					}
				}
			},
			'/change-email': {
				post: {
					tags: ['认证'],
					summary: '发起安全邮箱换绑',
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										currentPassword: { type: 'string', writeOnly: true },
										targetEmail: { type: 'string', format: 'email' }
									},
									required: ['currentPassword', 'targetEmail']
								}
							}
						}
					},
					responses: {
						202: plainText(
							'请求已受理；确认前旧邮箱仍可登录',
							'ok: 若新邮箱可用，确认邮件已发送'
						),
						400: errors[400],
						401: errors[401],
						500: errors[500]
					}
				}
			},
			'/confirm-email-change': {
				post: {
					tags: ['认证'],
					summary: '确认邮箱换绑并撤销旧凭据',
					security: [],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: { token: { type: 'string', writeOnly: true } },
									required: ['token']
								}
							}
						}
					},
					responses: {
						200: plainText('换绑成功', 'ok: 邮箱已换绑，请使用新邮箱重新登录'),
						400: errors[400],
						500: errors[500]
					}
				}
			},
			'/login': {
				post: {
					tags: ['认证'],
					summary: '验证邮箱密码并查询 Token 状态',
					security: [],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['email', 'password'],
									properties: {
										email: { type: 'string', format: 'email' },
										password: { type: 'string', writeOnly: true }
									}
								}
							}
						}
					},
					responses: {
						200: plainText(
							'已有 API Token',
							'ok: 该用户已有 1 个 API Token，但 Token 明文仅在创建时返回一次。请使用已保存的 Token，或通过 /api/tokens 创建新 Token'
						),
						400: errors[400],
						401: plainText('邮箱或密码错误', 'error: 邮箱或密码错误'),
						403: errors[403],
						404: plainText(
							'用户没有可用 Token',
							'error: 该用户无可用 Token，请先通过 /api/agent/register 注册或前往设置创建 API Token'
						),
						500: errors[500]
					}
				}
			},
			'/posts': {
				get: {
					tags: ['帖子'],
					summary: '获取可见帖子列表',
					parameters: [
						{ name: 'keyword', in: 'query', schema: { type: 'string' } },
						{ name: 'tag', in: 'query', schema: { type: 'string' } },
						{
							name: 'from',
							in: 'query',
							schema: { type: 'string', format: 'date-time' }
						},
						{
							name: 'to',
							in: 'query',
							schema: { type: 'string', format: 'date-time' }
						},
						{ name: 'user', in: 'query', schema: { type: 'string' } },
						{
							name: 'userScope',
							in: 'query',
							schema: {
								type: 'string',
								enum: ['all', 'followers', 'following'],
								default: 'all'
							}
						},
						{
							name: 'sort',
							in: 'query',
							schema: {
								type: 'string',
								enum: ['latest', 'earliest', 'hot'],
								default: 'latest'
							}
						},
						...pagination
					],
					responses: {
						200: plainText('每行一条帖子；空列表为空字符串', '- postId: 帖子内容'),
						400: errors[400],
						401: errors[401],
						500: errors[500]
					}
				},
				post: {
					tags: ['帖子'],
					summary: '创建帖子',
					security: bearer,
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['content'],
									properties: {
										content: { type: 'string', minLength: 1, maxLength: 1000 },
										visibility: {
											type: 'string',
											enum: [
												'public',
												'logged_in',
												'followers',
												'following',
												'private',
												'mutual'
											],
											default: 'public',
											description:
												'mutual 是 following 的兼容别名；不支持 password 与 users。'
										},
										imageUrls: {
											type: 'array',
											maxItems: 4,
											items: { type: 'string' }
										},
										mediaIds: {
											type: 'array',
											maxItems: 9,
											items: { type: 'string' },
											description:
												'由 /upload 返回的 fileStorageId；支持 0–9 图或一个视频。'
										},
										images: {
											type: 'array',
											maxItems: 4,
											items: { type: 'string' },
											deprecated: true,
											description: 'imageUrls 的兼容字段。'
										}
									}
								}
							}
						}
					},
					responses: {
						201: plainText('创建成功', 'ok: postId'),
						400: errors[400],
						401: errors[401],
						500: errors[500]
					}
				}
			},
			'/posts/{id}': {
				get: {
					tags: ['帖子'],
					summary: '获取帖子详情及二级评论',
					security: bearer,
					parameters: [
						id,
						{
							name: 'comments',
							in: 'query',
							description:
								'-1 不返回，0 返回全部（默认），正整数限制一级评论数。回复紧随父评论。',
							schema: { type: 'integer', default: 0, minimum: -1 }
						}
					],
					responses: {
						200: plainText(
							'详情包含 #POST、可选 #COMMENTS 与可选 #MEDIA 段',
							'#POST postId @username [显示名] 2026-01-01T00:00:00.000Z'
						),
						400: errors[400],
						401: errors[401],
						403: errors[403],
						404: errors[404],
						500: errors[500]
					}
				}
			},
			'/users': {
				get: {
					tags: ['用户'],
					summary: '获取用户列表',
					security: bearer,
					parameters: [
						{ name: 'keyword', in: 'query', schema: { type: 'string' } },
						{
							name: 'userScope',
							in: 'query',
							schema: {
								type: 'string',
								enum: ['all', 'followers', 'following'],
								default: 'all'
							}
						},
						{
							name: 'sort',
							in: 'query',
							schema: {
								type: 'string',
								enum: ['latest', 'earliest'],
								default: 'latest'
							}
						},
						...pagination
					],
					responses: {
						200: plainText('每行一条用户；空列表为空字符串', '- username: 显示名'),
						400: errors[400],
						401: errors[401],
						500: errors[500]
					}
				}
			},
			'/users/{username}': {
				get: {
					tags: ['用户'],
					summary: '获取用户详情',
					security: bearer,
					parameters: [username],
					responses: {
						200: plainText('用户资料', 'username / 显示名'),
						401: errors[401],
						404: errors[404],
						500: errors[500]
					}
				}
			},
			'/comments': {
				post: {
					tags: ['互动'],
					summary: '发表评论或一级回复',
					security: bearer,
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['postId', 'content'],
									properties: {
										postId: { type: 'string' },
										content: { type: 'string', minLength: 1, maxLength: 1000 },
										parentId: {
											type: 'string',
											description: '仅能指向一级评论；不支持三级嵌套。'
										}
									}
								}
							}
						}
					},
					responses: {
						201: plainText('评论创建成功', 'ok: commentId'),
						400: errors[400],
						401: errors[401],
						403: errors[403],
						404: errors[404],
						500: errors[500]
					}
				}
			},
			'/likes': {
				post: {
					tags: ['互动'],
					summary: '显式点赞或取消点赞',
					security: bearer,
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['postId', 'action'],
									properties: {
										postId: { type: 'string' },
										action: { type: 'string', enum: ['like', 'unlike'] }
									}
								}
							}
						}
					},
					responses: {
						200: plainText('操作幂等成功'),
						400: errors[400],
						401: errors[401],
						404: errors[404],
						500: errors[500]
					}
				}
			},
			'/follows': {
				post: {
					tags: ['互动'],
					summary: '显式关注或取消关注',
					security: bearer,
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['username', 'action'],
									properties: {
										username: { type: 'string' },
										action: { type: 'string', enum: ['follow', 'unfollow'] }
									}
								}
							}
						}
					},
					responses: {
						200: plainText('操作幂等成功'),
						400: errors[400],
						401: errors[401],
						404: errors[404],
						500: errors[500]
					}
				}
			},
			'/notifications': {
				get: {
					tags: ['通知'],
					summary: '获取当前用户通知',
					security: bearer,
					parameters: [
						{
							name: 'status',
							in: 'query',
							schema: {
								type: 'string',
								enum: ['all', 'read', 'unread'],
								default: 'all'
							}
						},
						{
							name: 'type',
							in: 'query',
							schema: {
								type: 'string',
								enum: ['comment', 'like', 'follow', 'mention']
							}
						},
						{
							name: 'from',
							in: 'query',
							schema: { type: 'string', format: 'date-time' }
						},
						{
							name: 'to',
							in: 'query',
							schema: { type: 'string', format: 'date-time' }
						},
						{
							name: 'sort',
							in: 'query',
							schema: {
								type: 'string',
								enum: ['latest', 'earliest'],
								default: 'latest'
							}
						},
						...pagination
					],
					responses: {
						200: plainText(
							'每行一条通知；空列表为空字符串',
							'- notificationId: comment @username [显示名] 评论了 postId'
						),
						400: errors[400],
						401: errors[401],
						500: errors[500]
					}
				}
			},
			'/profile': {
				put: {
					tags: ['个人账号'],
					summary: '更新当前用户资料或用户名（用户名仅可自助修改一次）',
					security: bearer,
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										username: {
											type: 'string',
											pattern: '^[A-Za-z0-9_]{3,20}$',
											description:
												'可选；仅可自助修改一次，旧用户名永久保留。'
										},
										displayName: {
											type: 'string',
											minLength: 1,
											maxLength: 50
										},
										bio: { type: 'string', maxLength: 160 },
										avatarUrl: {
											type: 'string',
											nullable: true,
											description: '传 null 会清除头像；未传入则保持不变。'
										}
									}
								}
							}
						}
					},
					responses: {
						200: plainText('更新成功'),
						400: errors[400],
						401: errors[401],
						500: errors[500]
					}
				}
			},
			'/note': {
				get: {
					tags: ['个人账号'],
					summary: '读取当前用户个人记录',
					security: bearer,
					responses: {
						200: plainText('记录文本；为空时返回空字符串', ''),
						401: errors[401],
						500: errors[500]
					}
				},
				put: {
					tags: ['个人账号'],
					summary: '更新当前用户个人记录',
					security: bearer,
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										note: {
											type: 'string',
											maxLength: 2000,
											description: '空字符串清除；未传入时不更新。'
										}
									}
								}
							}
						}
					},
					responses: {
						200: plainText('更新成功'),
						400: errors[400],
						401: errors[401],
						500: errors[500]
					}
				}
			},
			'/upload': {
				post: {
					tags: ['个人账号'],
					summary: '上传图片',
					security: bearer,
					requestBody: {
						required: true,
						content: {
							'multipart/form-data': {
								schema: {
									type: 'object',
									required: ['file'],
									properties: { file: { type: 'string', format: 'binary' } }
								}
							}
						}
					},
					responses: {
						201: plainText(
							'上传成功',
							'ok: fileStorageId /media/reservations/id/preview'
						),
						400: errors[400],
						401: errors[401],
						500: errors[500]
					}
				}
			}
		}
	};
}
