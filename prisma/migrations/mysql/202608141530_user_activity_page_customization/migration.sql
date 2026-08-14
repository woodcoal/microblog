-- 历史用户保持未知活跃时间及零次成功登录，禁止回填。
ALTER TABLE `User`
  ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
  ADD COLUMN `lastActiveAt` DATETIME(3) NULL,
  ADD COLUMN `loginCount` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `SystemConfig` ADD COLUMN `publicAnalyticsScript` LONGTEXT NOT NULL;
