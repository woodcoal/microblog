-- 支持推荐用户按 90 天公开活跃度筛选及最新公开帖查询。
CREATE INDEX "Post_isDeleted_visibility_createdAt_idx" ON "Post"("isDeleted", "visibility", "createdAt");
