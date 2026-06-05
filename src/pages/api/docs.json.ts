/**
 * OpenAPI 3.0 规范 JSON 端点
 *
 * 动态生成并返回完整的 OpenAPI 3.0 规范文档，
 * 供 Scalar API Reference 渲染交互式 API 文档页面。
 *
 * 路由：GET /api/docs.json
 * 返回：application/json 格式的 OpenAPI 规范对象
 */

import type { APIRoute } from 'astro';
import { SITE_TITLE, SITE_DESCRIPTION } from '@/lib/config';

/**
 * 构建通用的错误响应定义
 *
 * @param description - 响应描述文本
 * @returns OpenAPI 响应对象
 */
function errorResponse(description: string) {
	return {
		description,
		content: {
			'application/json': {
				schema: {
					type: 'object',
					properties: {
						error: { type: 'string', description: '错误信息' }
					},
					required: ['error']
				}
			}
		}
	};
}

/**
 * 通用错误响应集合
 *
 * 400 - 请求参数错误
 * 401 - 未认证
 * 403 - 无权限
 * 404 - 资源不存在
 * 500 - 服务器内部错误
 */
const commonResponses = {
	400: errorResponse('请求参数错误'),
	401: errorResponse('未认证，需要登录'),
	403: errorResponse('无权限执行此操作'),
	404: errorResponse('资源不存在'),
	500: errorResponse('服务器内部错误')
};

/**
 * 构建需要认证的接口响应集合
 *
 * 在通用错误响应基础上，401 描述更明确
 */
const authResponses = {
	...commonResponses,
	401: errorResponse('未认证或 Token 已过期')
};

/**
 * 构建成功响应
 *
 * @param description - 响应描述
 * @param schemaRef - 响应数据的 JSON Schema 引用（如 '#/components/schemas/Post'）
 * @returns OpenAPI 响应对象
 */
function successResponse(description: string, schemaRef?: string) {
	const response: Record<string, unknown> = { description };
	if (schemaRef) {
		response.content = {
			'application/json': {
				schema: { $ref: schemaRef }
			}
		};
	}
	return response;
}

/**
 * 构建分页列表响应
 *
 * @param itemSchemaRef - 列表项的 JSON Schema 引用
 * @returns OpenAPI 响应对象
 */
function paginatedResponse(itemSchemaRef: string) {
	return {
		description: '成功返回列表（带分页）',
		content: {
			'application/json': {
				schema: {
					type: 'object',
					properties: {
						items: {
							type: 'array',
							items: { $ref: itemSchemaRef }
						},
						total: { type: 'integer', description: '总数' },
						page: { type: 'integer', description: '当前页码' },
						pageSize: { type: 'integer', description: '每页数量' }
					},
					required: ['items', 'total', 'page', 'pageSize']
				}
			}
		}
	};
}

/**
 * 分页查询参数
 */
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

/**
 * 路径参数：资源 ID
 */
const idParam = {
	name: 'id',
	in: 'path',
	description: '资源唯一标识',
	required: true,
	schema: { type: 'string' }
};

/**
 * 路径参数：用户名
 */
const usernameParam = {
	name: 'username',
	in: 'path',
	description: '用户名',
	required: true,
	schema: { type: 'string' }
};

/**
 * 路径参数：标签名
 */
const tagNameParam = {
	name: 'name',
	in: 'path',
	description: '标签名称',
	required: true,
	schema: { type: 'string' }
};

/**
 * OpenAPI 规范对象
 *
 * 定义所有 API 接口、数据模型、安全方案等
 */
const spec = {
	openapi: '3.0.3',
	info: {
		title: SITE_TITLE + ' API',
		description: SITE_DESCRIPTION + ' 的 RESTful API 接口文档',
		version: '0.1.0'
	},
	servers: [
		{
			url: '/api',
			description: '当前站点'
		}
	],
	/**
	 * 安全方案定义
	 *
	 * 支持两种 Bearer Token 认证方式：
	 * 1. JWT Token — 用户登录后获取的令牌
	 * 2. API Token — 以 mt_ 前缀标识的长期访问令牌
	 */
	security: [{ BearerJWT: [] }, { BearerAPIToken: [] }],
	components: {
		securitySchemes: {
			BearerJWT: {
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'JWT',
				description: '用户登录后获取的 JWT Token'
			},
			BearerAPIToken: {
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'mt_',
				description: '以 mt_ 前缀标识的 API Token'
			}
		},
		schemas: {
			/** 用户信息 */
			User: {
				type: 'object',
				properties: {
					id: { type: 'string', description: '用户 ID' },
					username: { type: 'string', description: '用户名' },
					displayName: { type: 'string', description: '显示名称' },
					avatar: { type: 'string', description: '头像 URL', nullable: true },
					bio: { type: 'string', description: '个人简介', nullable: true },
					postCount: { type: 'integer', description: '帖子数量' },
					followerCount: { type: 'integer', description: '粉丝数量' },
					followingCount: { type: 'integer', description: '关注数量' },
					isFollowing: { type: 'boolean', description: '当前用户是否已关注' },
					createdAt: { type: 'string', format: 'date-time', description: '注册时间' }
				}
			},
			/** 帖子信息 */
			Post: {
				type: 'object',
				properties: {
					id: { type: 'string', description: '帖子 ID' },
					content: { type: 'string', description: '帖子内容（Markdown）' },
					contentHtml: { type: 'string', description: '渲染后的 HTML 内容' },
					author: { $ref: '#/components/schemas/User' },
					likeCount: { type: 'integer', description: '点赞数' },
					commentCount: { type: 'integer', description: '评论数' },
					isLiked: { type: 'boolean', description: '当前用户是否已点赞' },
					isPinned: { type: 'boolean', description: '是否置顶' },
					isLocked: { type: 'boolean', description: '是否锁定' },
					isPasswordProtected: { type: 'boolean', description: '是否密码保护' },
					media: {
						type: 'array',
						items: { type: 'string', description: '附件 URL' },
						description: '附件列表'
					},
					tags: {
						type: 'array',
						items: { type: 'string' },
						description: '标签列表'
					},
					createdAt: { type: 'string', format: 'date-time', description: '发布时间' },
					updatedAt: {
						type: 'string',
						format: 'date-time',
						description: '更新时间',
						nullable: true
					}
				}
			},
			/** 评论信息 */
			Comment: {
				type: 'object',
				properties: {
					id: { type: 'string', description: '评论 ID' },
					content: { type: 'string', description: '评论内容' },
					author: { $ref: '#/components/schemas/User' },
					postId: { type: 'string', description: '所属帖子 ID' },
					likeCount: { type: 'integer', description: '点赞数' },
					isLiked: { type: 'boolean', description: '当前用户是否已点赞' },
					createdAt: { type: 'string', format: 'date-time', description: '评论时间' }
				}
			},
			/** 通知信息 */
			Notification: {
				type: 'object',
				properties: {
					id: { type: 'string', description: '通知 ID' },
					type: {
						type: 'string',
						description: '通知类型',
						enum: ['like', 'comment', 'follow', 'mention']
					},
					actor: { $ref: '#/components/schemas/User' },
					postId: { type: 'string', description: '关联帖子 ID', nullable: true },
					commentId: { type: 'string', description: '关联评论 ID', nullable: true },
					isRead: { type: 'boolean', description: '是否已读' },
					createdAt: { type: 'string', format: 'date-time', description: '通知时间' }
				}
			},
			/** API Token 信息 */
			Token: {
				type: 'object',
				properties: {
					id: { type: 'string', description: 'Token ID' },
					name: { type: 'string', description: 'Token 名称' },
					prefix: { type: 'string', description: 'Token 前缀（用于识别）' },
					createdAt: { type: 'string', format: 'date-time', description: '创建时间' },
					lastUsedAt: {
						type: 'string',
						format: 'date-time',
						description: '最后使用时间',
						nullable: true
					}
				}
			},
			/** Webhook 信息 */
			Webhook: {
				type: 'object',
				properties: {
					id: { type: 'string', description: 'Webhook ID' },
					url: { type: 'string', description: '回调 URL' },
					events: {
						type: 'array',
						items: { type: 'string' },
						description: '订阅的事件类型'
					},
					secret: { type: 'string', description: '签名密钥' },
					isActive: { type: 'boolean', description: '是否启用' },
					createdAt: { type: 'string', format: 'date-time', description: '创建时间' }
				}
			},
			/** 站点设置 */
			Settings: {
				type: 'object',
				properties: {
					siteTitle: { type: 'string', description: '站点标题' },
					siteDescription: { type: 'string', description: '站点描述' },
					allowRegistration: { type: 'boolean', description: '是否允许注册' },
					maxGlobalPinnedPosts: { type: 'integer', description: '全局置顶帖上限' },
					maxUserPinnedPosts: { type: 'integer', description: '用户置顶帖上限' }
				}
			},
			/** 操作记录 */
			ActivityLog: {
				type: 'object',
				properties: {
					id: { type: 'string', description: '记录 ID' },
					action: { type: 'string', description: '操作类型' },
					actor: { $ref: '#/components/schemas/User' },
					targetType: { type: 'string', description: '目标类型' },
					targetId: { type: 'string', description: '目标 ID' },
					detail: { type: 'string', description: '操作详情', nullable: true },
					createdAt: { type: 'string', format: 'date-time', description: '操作时间' }
				}
			}
		}
	},
	paths: {
		// ==================== 认证 ====================
		'/auth/register': {
			post: {
				tags: ['认证'],
				summary: '注册新用户',
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
										description: '用户名（3-20 字母数字下划线）'
									},
									password: {
										type: 'string',
										description: '密码（最少 8 字符）'
									},
									displayName: { type: 'string', description: '显示名称' }
								},
								required: ['username', 'password']
							}
						}
					}
				},
				responses: {
					200: successResponse('注册成功', '#/components/schemas/User'),
					400: errorResponse('请求参数错误或用户名已存在'),
					403: errorResponse('注册功能已关闭'),
					500: commonResponses[500]
				}
			}
		},
		'/auth/login': {
			post: {
				tags: ['认证'],
				summary: '用户登录',
				security: [],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									username: { type: 'string', description: '用户名' },
									password: { type: 'string', description: '密码' }
								},
								required: ['username', 'password']
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
										token: { type: 'string', description: 'JWT Token' },
										user: { $ref: '#/components/schemas/User' }
									},
									required: ['token', 'user']
								}
							}
						}
					},
					400: errorResponse('用户名或密码错误'),
					500: commonResponses[500]
				}
			}
		},
		'/auth/logout': {
			post: {
				tags: ['认证'],
				summary: '用户登出',
				responses: {
					200: successResponse('登出成功'),
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},

		// ==================== 帖子 ====================
		'/posts': {
			get: {
				tags: ['帖子'],
				summary: '获取热门时间线帖子列表',
				parameters: paginationParams,
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					500: commonResponses[500]
				}
			},
			post: {
				tags: ['帖子'],
				summary: '发布新帖子',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									content: {
										type: 'string',
										description: '帖子内容（Markdown，最多 1000 字符）'
									},
									media: {
										type: 'array',
										items: { type: 'string' },
										description: '附件 URL 列表'
									},
									password: { type: 'string', description: '密码保护（可选）' }
								},
								required: ['content']
							}
						}
					}
				},
				responses: {
					200: successResponse('发帖成功', '#/components/schemas/Post'),
					400: errorResponse('内容不能为空或超过长度限制'),
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/posts/{id}': {
			get: {
				tags: ['帖子'],
				summary: '获取单个帖子详情',
				parameters: [idParam],
				responses: {
					200: successResponse('帖子详情', '#/components/schemas/Post'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			},
			put: {
				tags: ['帖子'],
				summary: '编辑帖子',
				parameters: [idParam],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									content: { type: 'string', description: '新内容' },
									media: {
										type: 'array',
										items: { type: 'string' },
										description: '附件 URL 列表'
									},
									password: { type: 'string', description: '密码保护（可选）' }
								},
								required: ['content']
							}
						}
					}
				},
				responses: {
					200: successResponse('编辑成功', '#/components/schemas/Post'),
					400: commonResponses[400],
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			},
			delete: {
				tags: ['帖子'],
				summary: '删除帖子',
				parameters: [idParam],
				responses: {
					200: successResponse('删除成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/posts/{id}/like': {
			put: {
				tags: ['帖子'],
				summary: '切换点赞状态（点赞/取消点赞）',
				parameters: [idParam],
				responses: {
					200: {
						description: '切换成功',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										isLiked: { type: 'boolean', description: '当前点赞状态' },
										likeCount: { type: 'integer', description: '点赞总数' }
									},
									required: ['isLiked', 'likeCount']
								}
							}
						}
					},
					401: authResponses[401],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/posts/{id}/pin': {
			put: {
				tags: ['帖子'],
				summary: '切换置顶状态（置顶/取消置顶）',
				parameters: [idParam],
				responses: {
					200: {
						description: '切换成功',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										isPinned: { type: 'boolean', description: '当前置顶状态' }
									},
									required: ['isPinned']
								}
							}
						}
					},
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/posts/{id}/lock': {
			put: {
				tags: ['帖子'],
				summary: '锁定帖子（帖子作者操作，禁止评论）',
				parameters: [idParam],
				responses: {
					200: successResponse('锁定成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/posts/{id}/verify-password': {
			post: {
				tags: ['帖子'],
				summary: '验证帖子访问密码',
				parameters: [idParam],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									password: { type: 'string', description: '访问密码' }
								},
								required: ['password']
							}
						}
					}
				},
				responses: {
					200: {
						description: '验证结果',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										valid: { type: 'boolean', description: '密码是否正确' }
									},
									required: ['valid']
								}
							}
						}
					},
					400: commonResponses[400],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},

		// ==================== 评论 ====================
		'/posts/{id}/comments': {
			get: {
				tags: ['评论'],
				summary: '获取帖子的评论列表',
				parameters: [idParam, ...paginationParams],
				responses: {
					200: paginatedResponse('#/components/schemas/Comment'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			},
			post: {
				tags: ['评论'],
				summary: '在帖子下发表评论',
				parameters: [idParam],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									content: { type: 'string', description: '评论内容' }
								},
								required: ['content']
							}
						}
					}
				},
				responses: {
					200: successResponse('评论成功', '#/components/schemas/Comment'),
					400: commonResponses[400],
					401: authResponses[401],
					403: errorResponse('帖子已锁定，无法评论'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/comments/{id}': {
			delete: {
				tags: ['评论'],
				summary: '删除评论',
				parameters: [idParam],
				responses: {
					200: successResponse('删除成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/comments/{id}/like': {
			put: {
				tags: ['评论'],
				summary: '切换评论点赞状态',
				parameters: [idParam],
				responses: {
					200: {
						description: '切换成功',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										isLiked: { type: 'boolean', description: '当前点赞状态' },
										likeCount: { type: 'integer', description: '点赞总数' }
									},
									required: ['isLiked', 'likeCount']
								}
							}
						}
					},
					401: authResponses[401],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},

		// ==================== 用户 ====================
		'/users/{username}': {
			get: {
				tags: ['用户'],
				summary: '获取用户信息',
				parameters: [usernameParam],
				responses: {
					200: successResponse('用户信息', '#/components/schemas/User'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/users/{username}/follow': {
			put: {
				tags: ['用户'],
				summary: '切换关注状态（关注/取消关注）',
				parameters: [usernameParam],
				responses: {
					200: {
						description: '切换成功',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										isFollowing: {
											type: 'boolean',
											description: '当前关注状态'
										}
									},
									required: ['isFollowing']
								}
							}
						}
					},
					401: authResponses[401],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/users/{username}/posts': {
			get: {
				tags: ['用户'],
				summary: '获取用户的帖子列表',
				parameters: [usernameParam, ...paginationParams],
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},

		// ==================== 时间线 ====================
		'/timeline/following': {
			get: {
				tags: ['时间线'],
				summary: '获取关注用户的时间线',
				parameters: paginationParams,
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},

		// ==================== 搜索 ====================
		'/search/posts': {
			get: {
				tags: ['搜索'],
				summary: '搜索帖子',
				parameters: [
					{
						name: 'q',
						in: 'query',
						description: '搜索关键词',
						required: true,
						schema: { type: 'string' }
					},
					...paginationParams
				],
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					400: errorResponse('缺少搜索关键词'),
					500: commonResponses[500]
				}
			}
		},
		'/search/users': {
			get: {
				tags: ['搜索'],
				summary: '搜索用户',
				parameters: [
					{
						name: 'q',
						in: 'query',
						description: '搜索关键词',
						required: true,
						schema: { type: 'string' }
					},
					...paginationParams
				],
				responses: {
					200: paginatedResponse('#/components/schemas/User'),
					400: errorResponse('缺少搜索关键词'),
					500: commonResponses[500]
				}
			}
		},

		// ==================== 标签 ====================
		'/tags/{name}/posts': {
			get: {
				tags: ['标签'],
				summary: '获取标签下的帖子列表',
				parameters: [tagNameParam, ...paginationParams],
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					500: commonResponses[500]
				}
			}
		},

		// ==================== 上传 ====================
		'/upload': {
			post: {
				tags: ['上传'],
				summary: '上传图片或附件',
				requestBody: {
					required: true,
					content: {
						'multipart/form-data': {
							schema: {
								type: 'object',
								properties: {
									file: {
										type: 'string',
										format: 'binary',
										description: '上传的文件'
									}
								},
								required: ['file']
							}
						}
					}
				},
				responses: {
					200: {
						description: '上传成功',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										url: { type: 'string', description: '文件访问 URL' }
									},
									required: ['url']
								}
							}
						}
					},
					400: errorResponse('文件格式不支持或大小超限'),
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},

		// ==================== 通知 ====================
		'/notifications': {
			get: {
				tags: ['通知'],
				summary: '获取通知列表',
				parameters: paginationParams,
				responses: {
					200: paginatedResponse('#/components/schemas/Notification'),
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/notifications/read': {
			put: {
				tags: ['通知'],
				summary: '标记通知为已读',
				requestBody: {
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									ids: {
										type: 'array',
										items: { type: 'string' },
										description: '要标记已读的通知 ID 列表，为空则标记全部'
									}
								}
							}
						}
					}
				},
				responses: {
					200: successResponse('标记成功'),
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/notifications/unread-count': {
			get: {
				tags: ['通知'],
				summary: '获取未读通知数量',
				responses: {
					200: {
						description: '未读数量',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										count: { type: 'integer', description: '未读通知数量' }
									},
									required: ['count']
								}
							}
						}
					},
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},

		// ==================== 设置 ====================
		'/settings': {
			get: {
				tags: ['设置'],
				summary: '获取当前用户设置',
				responses: {
					200: successResponse('设置信息', '#/components/schemas/Settings'),
					401: authResponses[401],
					500: commonResponses[500]
				}
			},
			put: {
				tags: ['设置'],
				summary: '更新站点设置（管理员）',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/Settings' }
						}
					}
				},
				responses: {
					200: successResponse('更新成功', '#/components/schemas/Settings'),
					401: authResponses[401],
					403: commonResponses[403],
					500: commonResponses[500]
				}
			}
		},
		'/settings/profile': {
			put: {
				tags: ['设置'],
				summary: '更新个人资料',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									displayName: { type: 'string', description: '显示名称' },
									bio: { type: 'string', description: '个人简介' },
									avatar: { type: 'string', description: '头像 URL' }
								}
							}
						}
					}
				},
				responses: {
					200: successResponse('更新成功', '#/components/schemas/User'),
					400: commonResponses[400],
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/settings/password': {
			put: {
				tags: ['设置'],
				summary: '修改密码',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									currentPassword: { type: 'string', description: '当前密码' },
									newPassword: {
										type: 'string',
										description: '新密码（最少 8 字符）'
									}
								},
								required: ['currentPassword', 'newPassword']
							}
						}
					}
				},
				responses: {
					200: successResponse('密码修改成功'),
					400: errorResponse('当前密码错误或新密码不符合要求'),
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/settings/comment-sort': {
			put: {
				tags: ['设置'],
				summary: '更新评论排序偏好',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									sortBy: {
										type: 'string',
										enum: ['newest', 'oldest'],
										description: '排序方式'
									}
								},
								required: ['sortBy']
							}
						}
					}
				},
				responses: {
					200: successResponse('更新成功'),
					400: commonResponses[400],
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},

		// ==================== API Token ====================
		'/tokens': {
			get: {
				tags: ['API Token'],
				summary: '获取 Token 列表',
				responses: {
					200: {
						description: 'Token 列表',
						content: {
							'application/json': {
								schema: {
									type: 'array',
									items: { $ref: '#/components/schemas/Token' }
								}
							}
						}
					},
					401: authResponses[401],
					500: commonResponses[500]
				}
			},
			post: {
				tags: ['API Token'],
				summary: '创建新 Token',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									name: { type: 'string', description: 'Token 名称' }
								},
								required: ['name']
							}
						}
					}
				},
				responses: {
					200: {
						description: '创建成功（仅创建时返回完整 Token 值）',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										id: { type: 'string', description: 'Token ID' },
										name: { type: 'string', description: 'Token 名称' },
										token: {
											type: 'string',
											description: '完整 Token 值（仅此一次返回）'
										}
									},
									required: ['id', 'name', 'token']
								}
							}
						}
					},
					400: commonResponses[400],
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/tokens/{id}': {
			delete: {
				tags: ['API Token'],
				summary: '撤销 Token',
				parameters: [idParam],
				responses: {
					200: successResponse('撤销成功'),
					401: authResponses[401],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},

		// ==================== Webhook ====================
		'/webhooks': {
			get: {
				tags: ['Webhook'],
				summary: '获取 Webhook 列表',
				responses: {
					200: {
						description: 'Webhook 列表',
						content: {
							'application/json': {
								schema: {
									type: 'array',
									items: { $ref: '#/components/schemas/Webhook' }
								}
							}
						}
					},
					401: authResponses[401],
					500: commonResponses[500]
				}
			},
			post: {
				tags: ['Webhook'],
				summary: '创建 Webhook',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									url: { type: 'string', description: '回调 URL' },
									events: {
										type: 'array',
										items: { type: 'string' },
										description: '订阅的事件类型列表'
									},
									secret: { type: 'string', description: '签名密钥（可选）' }
								},
								required: ['url', 'events']
							}
						}
					}
				},
				responses: {
					200: successResponse('创建成功', '#/components/schemas/Webhook'),
					400: commonResponses[400],
					401: authResponses[401],
					500: commonResponses[500]
				}
			}
		},
		'/webhooks/{id}': {
			put: {
				tags: ['Webhook'],
				summary: '更新 Webhook',
				parameters: [idParam],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									url: { type: 'string', description: '回调 URL' },
									events: {
										type: 'array',
										items: { type: 'string' },
										description: '订阅的事件类型列表'
									},
									isActive: { type: 'boolean', description: '是否启用' }
								}
							}
						}
					}
				},
				responses: {
					200: successResponse('更新成功', '#/components/schemas/Webhook'),
					400: commonResponses[400],
					401: authResponses[401],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			},
			delete: {
				tags: ['Webhook'],
				summary: '删除 Webhook',
				parameters: [idParam],
				responses: {
					200: successResponse('删除成功'),
					401: authResponses[401],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},

		// ==================== 管理后台 ====================
		'/admin/users': {
			get: {
				tags: ['管理后台'],
				summary: '获取用户列表（管理员）',
				parameters: [
					...paginationParams,
					{
						name: 'search',
						in: 'query',
						description: '搜索关键词',
						required: false,
						schema: { type: 'string' }
					},
					{
						name: 'status',
						in: 'query',
						description: '用户状态筛选',
						required: false,
						schema: { type: 'string', enum: ['active', 'disabled'] }
					}
				],
				responses: {
					200: paginatedResponse('#/components/schemas/User'),
					401: authResponses[401],
					403: commonResponses[403],
					500: commonResponses[500]
				}
			}
		},
		'/admin/users/{id}/disable': {
			put: {
				tags: ['管理后台'],
				summary: '禁用用户（管理员）',
				parameters: [idParam],
				responses: {
					200: successResponse('禁用成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/users/{id}/enable': {
			put: {
				tags: ['管理后台'],
				summary: '启用用户（管理员）',
				parameters: [idParam],
				responses: {
					200: successResponse('启用成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/posts': {
			get: {
				tags: ['管理后台'],
				summary: '获取全部帖子列表（管理员）',
				parameters: [
					...paginationParams,
					{
						name: 'status',
						in: 'query',
						description: '帖子状态筛选',
						required: false,
						schema: { type: 'string', enum: ['active', 'deleted'] }
					}
				],
				responses: {
					200: paginatedResponse('#/components/schemas/Post'),
					401: authResponses[401],
					403: commonResponses[403],
					500: commonResponses[500]
				}
			}
		},
		'/admin/posts/{id}': {
			delete: {
				tags: ['管理后台'],
				summary: '删除帖子（管理员）',
				parameters: [idParam],
				responses: {
					200: successResponse('删除成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/posts/{id}/restore': {
			put: {
				tags: ['管理后台'],
				summary: '恢复已删除帖子（管理员）',
				parameters: [idParam],
				responses: {
					200: successResponse('恢复成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/posts/{id}/global-pin': {
			put: {
				tags: ['管理后台'],
				summary: '全局置顶帖子（管理员）',
				parameters: [idParam],
				responses: {
					200: successResponse('置顶成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/posts/{id}/lock': {
			put: {
				tags: ['管理后台'],
				summary: '锁定帖子（管理员，禁止评论）',
				parameters: [idParam],
				responses: {
					200: successResponse('锁定成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/posts/{id}/unlock': {
			put: {
				tags: ['管理后台'],
				summary: '解锁帖子（管理员）',
				parameters: [idParam],
				responses: {
					200: successResponse('解锁成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/comments': {
			get: {
				tags: ['管理后台'],
				summary: '获取评论列表（管理员）',
				parameters: paginationParams,
				responses: {
					200: paginatedResponse('#/components/schemas/Comment'),
					401: authResponses[401],
					403: commonResponses[403],
					500: commonResponses[500]
				}
			}
		},
		'/admin/comments/{id}': {
			delete: {
				tags: ['管理后台'],
				summary: '删除评论（管理员）',
				parameters: [idParam],
				responses: {
					200: successResponse('删除成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/tags': {
			get: {
				tags: ['管理后台'],
				summary: '获取标签列表（管理员）',
				parameters: paginationParams,
				responses: {
					200: {
						description: '标签列表',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										items: {
											type: 'array',
											items: {
												type: 'object',
												properties: {
													id: { type: 'string', description: '标签 ID' },
													name: {
														type: 'string',
														description: '标签名称'
													},
													postCount: {
														type: 'integer',
														description: '关联帖子数'
													},
													isHidden: {
														type: 'boolean',
														description: '是否隐藏'
													}
												}
											}
										},
										total: { type: 'integer' },
										page: { type: 'integer' },
										pageSize: { type: 'integer' }
									},
									required: ['items', 'total', 'page', 'pageSize']
								}
							}
						}
					},
					401: authResponses[401],
					403: commonResponses[403],
					500: commonResponses[500]
				}
			}
		},
		'/admin/tags/{id}/hide': {
			put: {
				tags: ['管理后台'],
				summary: '隐藏标签（管理员）',
				parameters: [idParam],
				responses: {
					200: successResponse('隐藏成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/tags/{id}/show': {
			put: {
				tags: ['管理后台'],
				summary: '显示标签（管理员）',
				parameters: [idParam],
				responses: {
					200: successResponse('显示成功'),
					401: authResponses[401],
					403: commonResponses[403],
					404: commonResponses[404],
					500: commonResponses[500]
				}
			}
		},
		'/admin/activity-logs': {
			get: {
				tags: ['管理后台'],
				summary: '获取操作记录列表（管理员）',
				parameters: paginationParams,
				responses: {
					200: paginatedResponse('#/components/schemas/ActivityLog'),
					401: authResponses[401],
					403: commonResponses[403],
					500: commonResponses[500]
				}
			}
		}
	}
};

/**
 * GET /api/docs.json
 *
 * 返回 OpenAPI 3.0 规范 JSON，供 Scalar API Reference 渲染
 */
export const GET: APIRoute = async () => {
	return new Response(JSON.stringify(spec, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
