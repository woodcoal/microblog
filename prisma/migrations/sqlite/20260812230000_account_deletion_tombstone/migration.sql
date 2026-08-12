-- 永久注销墓碑：不物理删除 User，保留身份占用和审计/评论外键。
ALTER TABLE "User" ADD COLUMN "deletedAt" DATETIME;
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
