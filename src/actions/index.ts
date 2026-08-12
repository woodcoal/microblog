/**
 * Astro Actions 入口
 *
 * 统一导出所有服务端 Actions，按业务领域模块化组织。
 * 使用 defineAction + zod schema 实现类型安全的 RPC 调用。
 */

// 社交互动模块
import { toggleLike, toggleFollow, toggleBookmark } from './social';

// 内容管理模块
import { createPost, updatePost, deletePost, createComment, deleteComment } from './content';

// 媒体处理模块
import { cancelUpload, uploadMedia } from './media';

// 搜索功能模块
import { searchUsers, searchSuggest } from './search';

// 用户配置模块
import { updateTheme } from './config';

// Webhook 管理模块
import { createWebhook, updateWebhook, deleteWebhook, revealWebhookSecret } from './webhook';

// API 令牌模块
import { createToken, revokeToken } from './token';

// 分类管理模块
import { createCategory, updateCategory, deleteCategory, reorderCategories } from './category';

// 认证模块
import {
	login,
	register,
	verifyEmail,
	resendVerification,
	forgotPassword,
	confirmPasswordReset,
	requestEmailChangeAction,
	confirmEmailChangeAction,
	deleteAccountAction,
	logout
} from './auth';

// 设置模块
import {
	getSettings,
	updateSettings,
	updateProfile,
	renameUsername,
	changePassword,
	uploadAvatar,
	updateCommentSort
} from './settings';

// 通知模块
import {
	getUnreadCount,
	getNotifications,
	deleteAllNotifications,
	deleteNotification,
	markNotificationsRead
} from './notifications';

// 帖子扩展模块
import { getPostLikers, togglePin, verifyPostPassword } from './posts';

// 推荐模块
import {
	getRecommend,
	getRecommendUsers,
	getSimilarPosts,
	recordRead,
	saveInterests,
	getRecommendationProfile
} from './recommend';

// 管理后台模块
import {
	batchUsers,
	createUser,
	renameUser,
	batchPosts,
	batchComments,
	toggleTagVisibility,
	queryAdminAuditLogs
} from './admin';

// 工具模块
import { markdownPreview } from './misc';

// 站点固定文案管理模块
import { getSiteCopy, getSiteCopyHistory, previewSiteCopy, updateSiteCopy } from './site-copy';

/** 导出所有服务端 Actions */
export const server = {
	toggleLike,
	toggleFollow,
	toggleBookmark,
	createPost,
	updatePost,
	deletePost,
	createComment,
	deleteComment,
	uploadMedia,
	cancelUpload,
	searchUsers,
	updateTheme,
	searchSuggest,
	createWebhook,
	updateWebhook,
	deleteWebhook,
	revealWebhookSecret,
	createToken,
	revokeToken,
	createCategory,
	updateCategory,
	deleteCategory,
	reorderCategories,
	// 认证
	login,
	register,
	verifyEmail,
	resendVerification,
	forgotPassword,
	confirmPasswordReset,
	requestEmailChangeAction,
	confirmEmailChangeAction,
	deleteAccountAction,
	logout,
	// 设置
	getSettings,
	updateSettings,
	updateProfile,
	renameUsername,
	changePassword,
	uploadAvatar,
	updateCommentSort,
	// 通知
	getUnreadCount,
	getNotifications,
	deleteAllNotifications,
	deleteNotification,
	markNotificationsRead,
	// 帖子扩展
	getPostLikers,
	togglePin,
	verifyPostPassword,
	// 推荐
	getRecommend,
	getRecommendUsers,
	getSimilarPosts,
	recordRead,
	saveInterests,
	getRecommendationProfile,
	// 管理后台
	batchUsers,
	createUser,
	renameUser,
	batchPosts,
	batchComments,
	toggleTagVisibility,
	queryAdminAuditLogs,
	// 站点固定文案（管理员）
	getSiteCopy,
	getSiteCopyHistory,
	previewSiteCopy,
	updateSiteCopy,
	// 工具
	markdownPreview
};
