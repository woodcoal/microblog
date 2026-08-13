-- SQLite 合并基线迁移；由 DATABASE_PROVIDER=sqlite 选择。

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'user',
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "hasSelfRenamed" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" DATETIME,
    "credentialVersion" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" DATETIME,
    "emailVerificationRequired" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "passwordHash" TEXT,
    "allowedUserIds" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isGlobalPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedBy" TEXT,
    "lockReason" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deleteReason" TEXT,
    "deletedBy" TEXT,
    "restoreReason" TEXT,
    "restoredBy" TEXT,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'weibo',
    "title" TEXT,
    "categoryId" TEXT,
    "customCategory" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FileStorage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "md5Hash" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'image',
    "refCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "fileStorageId" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'image',
    "originalName" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "slot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Media_fileStorageId_fkey" FOREIGN KEY ("fileStorageId") REFERENCES "FileStorage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Like" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Like_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Like_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PostTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "PostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PostTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostRead_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Mention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "accent" TEXT NOT NULL DEFAULT '',
    "commentSortOrder" TEXT NOT NULL DEFAULT 'asc',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "interestOnboardingCompletedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "postId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Webhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "parentId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteCopy" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "markdown" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiteCopy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteCopyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteCopyVersion_key_fkey" FOREIGN KEY ("key") REFERENCES "SiteCopy" ("key") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteCopyVersion_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserTagInterest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserTagInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTagInterest_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserCategoryInterest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCategoryInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserCategoryInterest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'success',
    "requestedCount" INTEGER NOT NULL,
    "affectedCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminAuditTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditLogId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'updated',
    CONSTRAINT "AdminAuditTarget_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AdminAuditLog" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fileStorageId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UploadReservation_fileStorageId_fkey" FOREIGN KEY ("fileStorageId") REFERENCES "FileStorage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: 用户名生命周期 — 永久用户名占用记录；当前名和历史名都保留，禁止再次分配。
CREATE TABLE "UsernameClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsernameClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: 用户名变更的不可变审计记录。
CREATE TABLE "UsernameRenameAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousUsername" TEXT NOT NULL,
    "nextUsername" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsernameRenameAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsernameRenameAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: 邮箱所有权验证令牌。仅保存不可逆摘要，原始令牌只出现在一次性邮件链接中。
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'verify_email',
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: 密码重置令牌与邮箱验证令牌物理隔离；仅保存 SHA-256 摘要。
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: 安全邮箱换绑：确认前只保存目标邮箱和令牌摘要，不修改 User.email。
CREATE TABLE "EmailChangeToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: 唯一全局配置记录，固定使用 id=global。
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailOwnershipEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "mailSubjectVerifyEmail" TEXT NOT NULL DEFAULT '',
    "mailBodyVerifyEmail" TEXT NOT NULL DEFAULT '',
    "mailSubjectPasswordReset" TEXT NOT NULL DEFAULT '',
    "mailBodyPasswordReset" TEXT NOT NULL DEFAULT '',
    "mailSubjectChangeEmail" TEXT NOT NULL DEFAULT '',
    "mailBodyChangeEmail" TEXT NOT NULL DEFAULT ''
);

-- CreateTable: 管理员 bootstrap 记录。
CREATE TABLE "AdminBootstrap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable: SMTP 配置存储。
CREATE TABLE "SmtpConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "host" TEXT,
    "port" INTEGER,
    "security" TEXT,
    "username" TEXT,
    "passwordEncrypted" TEXT,
    "fromName" TEXT,
    "fromAddress" TEXT,
    "smtpEverConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FileStorage_md5Hash_key" ON "FileStorage"("md5Hash");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_postId_key" ON "Like"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_commentId_key" ON "Like"("userId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PostTag_postId_tagId_key" ON "PostTag"("postId", "tagId");

-- CreateIndex
CREATE INDEX "PostRead_userId_createdAt_idx" ON "PostRead"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostRead_userId_postId_key" ON "PostRead"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_postId_key" ON "Bookmark"("userId", "postId");

-- CreateIndex
CREATE INDEX "SiteCopyVersion_key_updatedAt_idx" ON "SiteCopyVersion"("key", "updatedAt");

-- CreateIndex
CREATE INDEX "Post_isDeleted_visibility_createdAt_idx" ON "Post"("isDeleted", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "Post_userId_isDeleted_visibility_createdAt_idx" ON "Post"("userId", "isDeleted", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "Follow_followingId_followerId_idx" ON "Follow"("followingId", "followerId");

-- CreateIndex
CREATE INDEX "Post_mode_isDeleted_createdAt_idx" ON "Post"("mode", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "Like_postId_userId_idx" ON "Like"("postId", "userId");

-- CreateIndex
CREATE INDEX "Bookmark_postId_userId_idx" ON "Bookmark"("postId", "userId");

-- CreateIndex
CREATE INDEX "Comment_postId_isDeleted_userId_idx" ON "Comment"("postId", "isDeleted", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTagInterest_userId_tagId_key" ON "UserTagInterest"("userId", "tagId");

-- CreateIndex
CREATE INDEX "UserTagInterest_tagId_userId_idx" ON "UserTagInterest"("tagId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCategoryInterest_userId_categoryId_key" ON "UserCategoryInterest"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "UserCategoryInterest_categoryId_userId_idx" ON "UserCategoryInterest"("categoryId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Media_postId_slot_key" ON "Media"("postId", "slot");

-- CreateIndex
CREATE INDEX "Media_postId_fileType_sortOrder_idx" ON "Media"("postId", "fileType", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AdminAuditLog_operatorId_requestId_key" ON "AdminAuditLog"("operatorId", "requestId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_id_idx" ON "AdminAuditLog"("createdAt", "id");

-- CreateIndex
CREATE INDEX "AdminAuditLog_operatorId_createdAt_id_idx" ON "AdminAuditLog"("operatorId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_action_createdAt_id_idx" ON "AdminAuditLog"("targetType", "action", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AdminAuditTarget_auditLogId_targetId_key" ON "AdminAuditTarget"("auditLogId", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditTarget_targetId_auditLogId_idx" ON "AdminAuditTarget"("targetId", "auditLogId");

-- CreateIndex
CREATE INDEX "UploadReservation_owner_file_active_idx" ON "UploadReservation"("userId", "fileStorageId", "consumedAt", "cancelledAt", "expiresAt");

-- CreateIndex
CREATE INDEX "UploadReservation_expiry_active_idx" ON "UploadReservation"("expiresAt", "consumedAt", "cancelledAt");

-- CreateIndex: 用户名生命周期
CREATE UNIQUE INDEX "UsernameClaim_username_key" ON "UsernameClaim"("username");
CREATE INDEX "UsernameClaim_userId_createdAt_idx" ON "UsernameClaim"("userId", "createdAt");
CREATE INDEX "UsernameRenameAudit_userId_createdAt_idx" ON "UsernameRenameAudit"("userId", "createdAt");
CREATE INDEX "UsernameRenameAudit_actorId_createdAt_idx" ON "UsernameRenameAudit"("actorId", "createdAt");

-- CreateIndex: 邮箱验证令牌
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_purpose_createdAt_idx" ON "EmailVerificationToken"("userId", "purpose", "createdAt");
CREATE INDEX "EmailVerificationToken_expiresAt_consumedAt_revokedAt_idx" ON "EmailVerificationToken"("expiresAt", "consumedAt", "revokedAt");

-- CreateIndex: 密码重置令牌
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");
CREATE INDEX "PasswordResetToken_expiresAt_consumedAt_revokedAt_idx" ON "PasswordResetToken"("expiresAt", "consumedAt", "revokedAt");

-- CreateIndex: 邮箱换绑令牌
CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON "EmailChangeToken"("tokenHash");
CREATE INDEX "EmailChangeToken_userId_createdAt_idx" ON "EmailChangeToken"("userId", "createdAt");
CREATE INDEX "EmailChangeToken_expiresAt_consumedAt_revokedAt_idx" ON "EmailChangeToken"("expiresAt", "consumedAt", "revokedAt");

-- CreateIndex: 管理员 bootstrap
CREATE UNIQUE INDEX "AdminBootstrap_userId_key" ON "AdminBootstrap"("userId");

-- CreateIndex: 永久注销墓碑
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- 初始化数据
-- 统一采用小写规范名；若旧库存在仅大小写不同的用户名，迁移应停止以避免静默合并身份。
UPDATE "User" SET "username" = lower("username") WHERE "username" <> lower("username");

INSERT INTO "UsernameClaim" ("id", "username", "userId", "createdAt")
SELECT lower(hex(randomblob(16))), "username", "id", CURRENT_TIMESTAMP FROM "User";

-- 升级已有站点时永久关闭"首位用户"通道，绝不因历史管理员注销而重新开放。
INSERT INTO "AdminBootstrap" ("id", "userId")
SELECT 'global', "id" FROM "User" LIMIT 1;

-- 管理员跳过邮箱验证
UPDATE "User" SET "emailVerificationRequired" = false WHERE "role" = 'admin';

-- 已升级实例修复：仅有效管理员可占用 bootstrap；无有效管理员时提升最早有效用户。
UPDATE "User"
SET "role" = 'admin', "emailVerificationRequired" = false
WHERE "id" = (
    SELECT "id" FROM "User"
    WHERE "isDisabled" = false AND "deletedAt" IS NULL
    ORDER BY "createdAt", "id"
    LIMIT 1
)
AND NOT EXISTS (
    SELECT 1 FROM "User" WHERE "role" = 'admin' AND "isDisabled" = false AND "deletedAt" IS NULL
);

UPDATE "AdminBootstrap"
SET "userId" = (
    SELECT "id" FROM "User"
    WHERE "role" = 'admin' AND "isDisabled" = false AND "deletedAt" IS NULL
    ORDER BY "createdAt", "id"
    LIMIT 1
)
WHERE "id" = 'global'
  AND EXISTS (
    SELECT 1 FROM "User" WHERE "role" = 'admin' AND "isDisabled" = false AND "deletedAt" IS NULL
  );

-- Triggers
CREATE TRIGGER "AdminAuditLog_no_update" BEFORE UPDATE ON "AdminAuditLog"
BEGIN
    SELECT RAISE(ABORT, 'AdminAuditLog is immutable');
END;

CREATE TRIGGER "AdminAuditLog_no_delete" BEFORE DELETE ON "AdminAuditLog"
BEGIN
    SELECT RAISE(ABORT, 'AdminAuditLog is immutable');
END;

CREATE TRIGGER "AdminAuditTarget_no_update" BEFORE UPDATE ON "AdminAuditTarget"
BEGIN
    SELECT RAISE(ABORT, 'AdminAuditTarget is immutable');
END;

CREATE TRIGGER "AdminAuditTarget_no_delete" BEFORE DELETE ON "AdminAuditTarget"
BEGIN
    SELECT RAISE(ABORT, 'AdminAuditTarget is immutable');
END;
