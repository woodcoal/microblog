/**
 * OpenAPI 3.0 规范 JSON 端点。
 *
 * 文档自身仍由 GET /api/docs.json 提供；本文档描述的外部 JSON API
 * 统一位于 /api/v1。站内 SSR/Astro Actions 不属于该外部契约。
 */
import type { APIRoute } from 'astro';
import { API_DOCS_PUBLIC, SITE_DESCRIPTION, SITE_TITLE } from '@/lib/config';
import { mayAccessApiDocs } from '@/lib/network';
import { createAgentOpenApiSpec } from '@/lib/agent-openapi';

const bearerSecurity = [{ BearerJWT: [] }, { BearerAPIToken: [] }];

function errorResponse(description: string) {
	return {
		description,
		content: {
			'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } }
		}
	};
}

function successResponse(description: string, schemaRef?: string) {
	return {
		description,
		...(schemaRef ? { content: { 'application/json': { schema: { $ref: schemaRef } } } } : {})
	};
}

function paginatedResponse(itemSchemaRef: string) {
	return {
		description: '分页列表',
		content: {
			'application/json': {
				schema: {
					type: 'object',
					properties: {
						items: { type: 'array', items: { $ref: itemSchemaRef } },
						total: { type: 'integer', minimum: 0 },
						page: { type: 'integer', minimum: 1 },
						pageSize: { type: 'integer', minimum: 1 }
					},
					required: ['items', 'total', 'page', 'pageSize']
				}
			}
		}
	};
}

const commonResponses = {
	400: errorResponse('请求参数错误'),
	401: errorResponse('Bearer 凭证缺失、无效或已过期'),
	403: errorResponse('已认证但无权执行此操作'),
	404: errorResponse('资源不存在'),
	409: errorResponse('资源状态冲突'),
	500: errorResponse('服务器内部错误')
};

const paginationParams = [
	{
		name: 'page',
		in: 'query',
		description: '页码，从 1 开始',
		required: false,
		schema: { type: 'integer', default: 1, minimum: 1 }
	},
	{
		name: 'pageSize',
		in: 'query',
		description: '每页数量',
		required: false,
		schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }
	}
];

const idParam = {
	name: 'id',
	in: 'path',
	description: '资源 ID',
	required: true,
	schema: { type: 'string' }
};

const passwordParam = {
	name: 'password',
	in: 'query',
	description: 'password 可见性帖子详情的访问密码；仅用于本次请求，不得记录或缓存',
	required: false,
	schema: { type: 'string' }
};

const usernameParam = {
	name: 'username',
	in: 'path',
	description: '用户名',
	required: true,
	schema: { type: 'string' }
};

const tagNameParam = {
	name: 'name',
	in: 'path',
	description: '标签名',
	required: true,
	schema: { type: 'string' }
};

const toggleDescription =
	'状态切换：当前为关闭时切为开启，当前为开启时切为关闭；再次发送相同 PUT 会回到原状态。' +
	'该行为按 HTTP 严格定义不是幂等，客户端不得自动重试；后续应演进为显式 desiredState 赋值以获得重试幂等性。';

const spec = {
	openapi: '3.0.3',
	info: {
		title: `${SITE_TITLE} API`,
		description:
			`${SITE_DESCRIPTION} 的版本化 JSON API。` +
			'首批开放公开读取、内容写入、评论、点赞、关注、通知已读及登录注册。' +
			'管理后台继续使用 Astro Actions，不开放外部 API。',
		version: '1.0.0',
		'x-mvp-scope': {
			included: [
				'公开帖子、用户帖子、时间线、搜索与标签读取',
				'帖子与评论写操作',
				'点赞与关注切换',
				'将当前用户通知标记为已读',
				'登录与注册'
			],
			later: ['通知查询与删除', '上传', '设置', 'API Token 管理', 'Webhook', '帖子置顶'],
			excluded: ['管理后台：仅 Astro Actions']
		}
	},
	servers: [{ url: '/api/v1', description: 'v1 外部 JSON API' }],
	security: [],
	tags: [
		{ name: '认证' },
		{ name: '帖子' },
		{ name: '评论' },
		{ name: '用户' },
		{ name: '时间线' },
		{ name: '搜索' },
		{ name: '标签' },
		{ name: '通知' },
		{ name: '后续迭代' }
	],
	components: {
		securitySchemes: {
			BearerJWT: {
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'JWT',
				description:
					'短期 JWT。/api/v1 仅从 Authorization: Bearer 读取凭证，不支持 Cookie 鉴权。'
			},
			BearerAPIToken: {
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'mt_',
				description:
					'mt_ 前缀长期 API Token。/api/v1 仅从 Authorization: Bearer 读取凭证；不得存入浏览器。'
			}
		},
		schemas: {
			ErrorResponse: {
				type: 'object',
				properties: {
					error: {
						type: 'object',
						properties: {
							code: {
								type: 'string',
								enum: [
									'BAD_REQUEST',
									'UNAUTHORIZED',
									'FORBIDDEN',
									'NOT_FOUND',
									'CONFLICT',
									'INTERNAL_ERROR'
								]
							},
							message: { type: 'string' },
							details: { type: 'object', additionalProperties: true, nullable: true },
							requestId: { type: 'string', nullable: true }
						},
						required: ['code', 'message']
					}
				},
				required: ['error']
			},
			User: {
				type: 'object',
				description:
					'API DTO。Service/Prisma 使用 avatarUrl 与 _count；适配层必须展开计数，不得直接透传 email、passwordHash、role、isDisabled。',
				properties: {
					id: { type: 'string' },
					username: { type: 'string' },
					displayName: { type: 'string' },
					avatarUrl: { type: 'string', nullable: true },
					bio: { type: 'string', nullable: true },
					postCount: { type: 'integer', minimum: 0 },
					followerCount: { type: 'integer', minimum: 0 },
					followingCount: { type: 'integer', minimum: 0 },
					following: { type: 'boolean', description: '当前访问者是否关注该用户' },
					createdAt: { type: 'string', format: 'date-time' }
				},
				required: ['id', 'username', 'displayName', 'avatarUrl']
			},
			AuthUser: {
				allOf: [
					{ $ref: '#/components/schemas/User' },
					{
						type: 'object',
						properties: {
							email: { type: 'string', format: 'email' },
							role: { type: 'string', enum: ['user', 'admin'] }
						},
						required: ['email', 'role']
					}
				]
			},
			Post: {
				type: 'object',
				description:
					'API DTO。Service CRUD 当前返回 Prisma 关联对象；适配层应映射 user→author、media.fileStorage→media、tags[].tag→tags，并计算 counts/viewer flags。',
				properties: {
					id: { type: 'string' },
					title: { type: 'string', nullable: true },
					customCategory: { type: 'string', nullable: true },
					content: { type: 'string' },
					contentHtml: { type: 'string', description: 'API 适配层安全渲染的 HTML' },
					mode: { type: 'string', enum: ['weibo', 'forum', 'blog'] },
					visibility: {
						type: 'string',
						enum: [
							'public',
							'logged_in',
							'followers',
							'following',
							'private',
							'password',
							'users'
						]
					},
					author: { $ref: '#/components/schemas/User' },
					likeCount: { type: 'integer', minimum: 0 },
					commentCount: { type: 'integer', minimum: 0 },
					liked: { type: 'boolean' },
					isPinned: { type: 'boolean' },
					isLocked: { type: 'boolean' },
					isEdited: { type: 'boolean' },
					isPasswordProtected: { type: 'boolean' },
					media: { type: 'array', items: { $ref: '#/components/schemas/Media' } },
					thumbnail: { $ref: '#/components/schemas/Media', nullable: true },
					bodyMedia: { type: 'array', items: { $ref: '#/components/schemas/Media' } },
					attachments: {
						type: 'array',
						items: { $ref: '#/components/schemas/Attachment' }
					},
					tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
					createdAt: { type: 'string', format: 'date-time' },
					updatedAt: { type: 'string', format: 'date-time' }
				},
				required: [
					'id',
					'content',
					'mode',
					'visibility',
					'author',
					'likeCount',
					'commentCount',
					'liked',
					'media',
					'thumbnail',
					'bodyMedia',
					'attachments',
					'tags',
					'createdAt',
					'updatedAt'
				]
			},
			Media: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					url: { type: 'string' },
					mimeType: { type: 'string' },
					size: { type: 'integer', minimum: 0 },
					type: { type: 'string', enum: ['image', 'video', 'attachment'] },
					displayUrl: { type: 'string', description: '图片展示副本的受控地址' },
					originalUrl: { type: 'string', description: '图片原图的受控地址' },
					streamUrl: { type: 'string', description: '视频 Range 流地址' },
					slot: { type: 'string', enum: ['thumbnail'], nullable: true }
				},
				required: ['id', 'url', 'mimeType', 'size', 'type', 'slot']
			},
			Attachment: {
				allOf: [
					{ $ref: '#/components/schemas/Media' },
					{
						type: 'object',
						properties: {
							originalName: { type: 'string' },
							downloadUrl: { type: 'string' }
						},
						required: ['originalName', 'downloadUrl']
					}
				]
			},
			Tag: {
				type: 'object',
				properties: { id: { type: 'string' }, name: { type: 'string' } },
				required: ['id', 'name']
			},
			Comment: {
				type: 'object',
				description:
					'API DTO。createComment 当前返回 user、userId、liked；适配层统一映射为 author、liked，并保留 parentId/updatedAt。',
				properties: {
					id: { type: 'string' },
					postId: { type: 'string' },
					parentId: { type: 'string', nullable: true },
					content: { type: 'string' },
					author: { $ref: '#/components/schemas/User' },
					likeCount: { type: 'integer', minimum: 0 },
					liked: { type: 'boolean' },
					createdAt: { type: 'string', format: 'date-time' },
					updatedAt: { type: 'string', format: 'date-time' }
				},
				required: [
					'id',
					'postId',
					'parentId',
					'content',
					'author',
					'likeCount',
					'liked',
					'createdAt',
					'updatedAt'
				]
			},
			Notification: {
				type: 'object',
				description:
					'后续迭代 DTO。Service 还返回 actorId、recipientId、postAuthorUsername；外部 DTO 不暴露 recipientId，actorId 由 actor.id 表达。',
				'x-mvp-stage': 'later',
				properties: {
					id: { type: 'string' },
					type: { type: 'string', enum: ['like', 'comment', 'follow', 'mention'] },
					actor: { $ref: '#/components/schemas/User' },
					postId: { type: 'string', nullable: true },
					commentId: { type: 'string', nullable: true },
					postAuthorUsername: { type: 'string', nullable: true },
					isRead: { type: 'boolean' },
					createdAt: { type: 'string', format: 'date-time' }
				},
				required: ['id', 'type', 'actor', 'isRead', 'createdAt']
			},
			PostWrite: {
				type: 'object',
				properties: {
					content: { type: 'string', minLength: 1 },
					title: { type: 'string', nullable: true },
					mode: { type: 'string', enum: ['weibo', 'forum', 'blog'], default: 'weibo' },
					visibility: {
						type: 'string',
						enum: [
							'public',
							'logged_in',
							'followers',
							'following',
							'private',
							'password',
							'users'
						],
						default: 'public'
					},
					mediaIds: { type: 'array', items: { type: 'string' }, uniqueItems: true },
					thumbnailFileStorageId: { type: 'string', nullable: true },
					attachmentFileStorageIds: {
						type: 'array',
						items: { type: 'string' },
						maxItems: 10,
						uniqueItems: true
					},
					password: { type: 'string', writeOnly: true },
					allowedUserIds: { type: 'array', items: { type: 'string' }, uniqueItems: true },
					categoryId: { type: 'string', nullable: true },
					customCategory: { type: 'string', nullable: true, maxLength: 50 }
				},
				required: ['content']
			},
			AvatarUploadResult: {
				type: 'object',
				properties: { avatarUrl: { type: 'string', description: '新头像的受控公开 URL' } },
				required: ['avatarUrl']
			},
			ToggleResult: {
				type: 'object',
				properties: {
					active: { type: 'boolean', description: '切换后的状态' },
					count: { type: 'integer', minimum: 0 }
				},
				required: ['active']
			},
			MarkNotificationsReadResult: {
				type: 'object',
				properties: {
					updatedCount: { type: 'integer', minimum: 0 }
				},
				required: ['updatedCount']
			}
		}
	},
	paths: {
		'/upload': {
			post: {
				tags: ['帖子'],
				summary: '上传媒体',
				security: bearerSecurity,
				requestBody: {
					required: true,
					content: {
						'multipart/form-data': {
							schema: {
								type: 'object',
								required: ['file'],
								properties: {
									file: { type: 'string', format: 'binary' },
									fileType: {
										type: 'string',
										enum: ['image', 'video', 'attachment'],
										default: 'image'
									}
								}
							}
						}
					}
				},
				responses: {
					201: successResponse('上传预约', '#/components/schemas/Media'),
					...commonResponses
				}
			}
		},
		'/upload/avatar': {
			post: {
				tags: ['用户'],
				summary: '上传并设置头像',
				description: '仅接受图片；上传成功后立即替换当前用户头像，并释放旧的站内头像引用。',
				security: bearerSecurity,
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
					201: successResponse('头像已更新', '#/components/schemas/AvatarUploadResult'),
					...commonResponses
				}
			}
		},
		'/auth/register': {
			post: {
				tags: ['认证'],
				summary: '注册',
				security: [],
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
										description: '可选；缺省时服务端分配唯一 u_xxxx 用户名。'
									},
									displayName: { type: 'string' },
									email: { type: 'string', format: 'email' },
									password: { type: 'string', minLength: 8, writeOnly: true }
								},
								required: ['email', 'password']
							}
						}
					}
				},
				responses: {
					202: {
						description: '注册请求已受理；不会披露邮箱是否已注册或首位管理员身份',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										accepted: { type: 'boolean' },
										nextAction: {
											type: 'string',
											enum: ['verify_email', 'login']
										},
										message: { type: 'string' }
									},
									required: ['accepted', 'nextAction', 'message']
								}
							}
						}
					},
					400: commonResponses[400],
					403: commonResponses[403],
					500: commonResponses[500]
				}
			}
		},
		'/auth/login': {
			post: {
				tags: ['认证'],
				summary: '登录并获取短期 JWT',
				security: [],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									email: { type: 'string', format: 'email' },
									password: { type: 'string', writeOnly: true }
								},
								required: ['email', 'password']
							}
						}
					}
				},
				responses: {
					200: {
						description: '登录成功',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										token: { type: 'string' },
										expiresIn: { type: 'integer', description: '有效秒数' },
										user: { $ref: '#/components/schemas/AuthUser' }
									},
									required: ['token', 'expiresIn', 'user']
								}
							}
						}
					},
					401: commonResponses[401],
					403: commonResponses[403],
					500: commonResponses[500]
				}
			}
		},
		'/auth/verify-email': {
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
					200: successResponse('验证成功'),
					400: commonResponses[400],
					500: commonResponses[500]
				}
			}
		},
		'/auth/resend-verification': {
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
					200: successResponse('请求已接受'),
					400: commonResponses[400],
					500: commonResponses[500]
				}
			}
		},
		'/auth/forgot-password': {
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
					200: successResponse('请求已接受'),
					400: commonResponses[400],
					500: commonResponses[500]
				}
			}
		},
		'/auth/reset-password': {
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
					200: successResponse('重置成功'),
					400: commonResponses[400],
					500: commonResponses[500]
				}
			}
		},
		'/auth/change-email': {
			post: {
				tags: ['认证'],
				summary: '发起安全邮箱换绑',
				security: bearerSecurity,
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
					202: successResponse('请求已受理；确认前旧邮箱仍为登录身份'),
					400: commonResponses[400],
					401: commonResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/auth/confirm-email-change': {
			post: {
				tags: ['认证'],
				summary: '消费一次性换绑确认令牌并撤销旧凭据',
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
					200: successResponse('换绑成功；客户端须使用新邮箱重新登录'),
					400: commonResponses[400],
					500: commonResponses[500]
				}
			}
		},
		'/auth/delete-account': {
			post: {
				tags: ['认证'],
				summary: '永久注销当前账号',
				description:
					'原子撤销凭据、永久保留用户名与邮箱，并下线该账号的公开帖子；此操作不可恢复。',
				security: bearerSecurity,
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									currentPassword: { type: 'string', writeOnly: true }
								},
								required: ['currentPassword']
							}
						}
					}
				},
				responses: {
					200: successResponse('账号已永久注销'),
					401: commonResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/notifications/read': {
			post: {
				tags: ['通知'],
				summary: '标记当前用户的通知为已读',
				description: '省略 ids 或传空数组时，标记当前用户全部未读通知。',
				security: bearerSecurity,
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									ids: {
										type: 'array',
										maxItems: 100,
										items: { type: 'string', minLength: 1 },
										description: '要标记的通知 ID。'
									}
								}
							}
						}
					}
				},
				responses: {
					200: successResponse(
						'标记成功',
						'#/components/schemas/MarkNotificationsReadResult'
					),
					400: commonResponses[400],
					401: commonResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/posts': {
			get: {
				tags: ['帖子'],
				summary: '公开帖子列表',
				security: [],
				parameters: [
					...paginationParams,
					{
						name: 'sort',
						in: 'query',
						schema: { type: 'string', enum: ['latest', 'hot'], default: 'latest' }
					}
				],
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					500: commonResponses[500]
				}
			},
			post: {
				tags: ['帖子'],
				summary: '发帖',
				security: bearerSecurity,
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/PostWrite' } }
					}
				},
				responses: {
					201: successResponse('创建成功', '#/components/schemas/Post'),
					400: commonResponses[400],
					401: commonResponses[401],
					403: commonResponses[403],
					500: commonResponses[500]
				}
			}
		},
		'/posts/{id}': {
			get: {
				tags: ['帖子'],
				summary: '帖子详情（可选 Bearer 用于可见性判定）',
				security: [],
				parameters: [idParam, passwordParam],
				responses: {
					200: successResponse('帖子详情', '#/components/schemas/Post'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			},
			put: {
				tags: ['帖子'],
				summary: '编辑帖子',
				security: bearerSecurity,
				parameters: [idParam],
				requestBody: {
					required: true,
					content: {
						'application/json': { schema: { $ref: '#/components/schemas/PostWrite' } }
					}
				},
				responses: {
					200: successResponse('编辑成功', '#/components/schemas/Post'),
					400: commonResponses[400],
					401: commonResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					409: commonResponses[409],
					500: commonResponses[500]
				}
			},
			delete: {
				tags: ['帖子'],
				summary: '删除帖子（软删除）',
				security: bearerSecurity,
				parameters: [idParam],
				responses: {
					204: successResponse('删除成功'),
					401: commonResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					409: commonResponses[409],
					500: commonResponses[500]
				}
			}
		},
		'/posts/{id}/comments': {
			get: {
				tags: ['评论'],
				summary: '评论列表',
				security: [],
				parameters: [idParam, ...paginationParams],
				responses: {
					200: paginatedResponse('#/components/schemas/Comment'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			},
			post: {
				tags: ['评论'],
				summary: '发表评论或回复',
				security: bearerSecurity,
				parameters: [idParam],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									content: { type: 'string', minLength: 1, maxLength: 1000 },
									parentId: { type: 'string', nullable: true }
								},
								required: ['content']
							}
						}
					}
				},
				responses: {
					201: successResponse('评论成功', '#/components/schemas/Comment'),
					400: commonResponses[400],
					401: commonResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/comments/{id}': {
			delete: {
				tags: ['评论'],
				summary: '删除评论（软删除）',
				security: bearerSecurity,
				parameters: [idParam],
				responses: {
					204: successResponse('删除成功'),
					401: commonResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					409: commonResponses[409],
					500: commonResponses[500]
				}
			}
		},
		'/posts/{id}/like': {
			put: {
				tags: ['帖子'],
				summary: '切换帖子点赞',
				description: toggleDescription,
				'x-operation-semantics': 'toggle-not-retry-safe',
				security: bearerSecurity,
				parameters: [idParam],
				responses: {
					200: successResponse(
						'切换成功；active 对应 Service 的 liked',
						'#/components/schemas/ToggleResult'
					),
					401: commonResponses[401],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/comments/{id}/like': {
			put: {
				tags: ['评论'],
				summary: '切换评论点赞',
				description: toggleDescription,
				'x-operation-semantics': 'toggle-not-retry-safe',
				security: bearerSecurity,
				parameters: [idParam],
				responses: {
					200: successResponse(
						'切换成功；active 对应 Service 的 liked',
						'#/components/schemas/ToggleResult'
					),
					401: commonResponses[401],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/users/{username}': {
			get: {
				tags: ['用户'],
				summary: '用户主页资料',
				security: [],
				parameters: [usernameParam],
				responses: {
					200: successResponse('用户资料', '#/components/schemas/User'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/users/{username}/posts': {
			get: {
				tags: ['用户'],
				summary: '用户公开帖子',
				security: [],
				parameters: [usernameParam, ...paginationParams],
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/users/{username}/follow': {
			put: {
				tags: ['用户'],
				summary: '切换关注',
				description: toggleDescription,
				'x-operation-semantics': 'toggle-not-retry-safe',
				security: bearerSecurity,
				parameters: [usernameParam],
				responses: {
					200: successResponse(
						'切换成功；active 对应 Service 的 following',
						'#/components/schemas/ToggleResult'
					),
					400: commonResponses[400],
					401: commonResponses[401],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/timeline/latest': {
			get: {
				tags: ['时间线'],
				summary: '最新公开时间线',
				security: [],
				parameters: paginationParams,
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					500: commonResponses[500]
				}
			}
		},
		'/timeline/following': {
			get: {
				tags: ['时间线'],
				summary: '关注时间线',
				security: bearerSecurity,
				parameters: paginationParams,
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					401: commonResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/search/posts': {
			get: {
				tags: ['搜索'],
				summary: '搜索公开帖子',
				security: [],
				parameters: [
					{
						name: 'q',
						in: 'query',
						required: true,
						schema: { type: 'string', minLength: 1 }
					},
					...paginationParams
				],
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					400: commonResponses[400],
					500: commonResponses[500]
				}
			}
		},
		'/search/users': {
			get: {
				tags: ['搜索'],
				summary: '搜索用户',
				security: [],
				parameters: [
					{
						name: 'q',
						in: 'query',
						required: true,
						schema: { type: 'string', minLength: 1 }
					},
					...paginationParams
				],
				responses: {
					200: paginatedResponse('#/components/schemas/User'),
					400: commonResponses[400],
					500: commonResponses[500]
				}
			}
		},
		'/tags/{name}/posts': {
			get: {
				tags: ['标签'],
				summary: '标签下公开帖子',
				security: [],
				parameters: [tagNameParam, ...paginationParams],
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/posts/{id}/pin': {
			put: {
				tags: ['后续迭代'],
				summary: '切换帖子置顶（非 MVP）',
				description: toggleDescription,
				'x-mvp-stage': 'later',
				'x-operation-semantics': 'toggle-not-retry-safe',
				security: bearerSecurity,
				parameters: [idParam],
				responses: {
					200: successResponse(
						'切换成功；active 对应 Service 的 pinned',
						'#/components/schemas/ToggleResult'
					),
					401: commonResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		}
	},
	'x-browser-authentication': {
		mechanism: 'HttpOnly Cookie JWT',
		scope: '浏览器 SSR 与 Astro Actions；不属于 /api/v1 外部 Bearer 契约',
		warning: '长期 mt_ API Token 禁止写入浏览器存储或前端代码'
	}
};

export const GET: APIRoute = ({ request, clientAddress }) => {
	if (!mayAccessApiDocs(clientAddress, API_DOCS_PUBLIC)) {
		return new Response(JSON.stringify({ error: 'API 文档未对公网开放' }), {
			status: 403,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		});
	}

	const api = new URL(request.url).searchParams.get('api');
	const document = api === 'agent' ? createAgentOpenApiSpec() : spec;

	return new Response(JSON.stringify(document, null, 2), {
		status: 200,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
