-- 支持按候选用户关联筛选、90 天公开活跃度统计与最新公开帖排序。
CREATE INDEX `Post_isDeleted_visibility_createdAt_idx` ON `Post`(`isDeleted`, `visibility`, `createdAt`);
CREATE INDEX `Post_userId_isDeleted_visibility_createdAt_idx` ON `Post`(`userId`, `isDeleted`, `visibility`, `createdAt`);
-- Follow 的唯一键支持 followerId 正向查询；此索引覆盖反向粉丝统计。
CREATE INDEX `Follow_followingId_followerId_idx` ON `Follow`(`followingId`, `followerId`);
