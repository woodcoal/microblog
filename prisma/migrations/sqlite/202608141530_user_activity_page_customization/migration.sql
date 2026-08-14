-- 历史用户保持未知活跃时间及零次成功登录，禁止回填。
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "lastActiveAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "loginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SystemConfig" ADD COLUMN "publicAnalyticsScript" TEXT NOT NULL DEFAULT '';
