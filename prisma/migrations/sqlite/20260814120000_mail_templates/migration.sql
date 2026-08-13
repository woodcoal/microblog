-- 邮件模板自定义：主题与正文，留空使用内置默认值。
-- SQLite 不支持单条 ALTER TABLE ADD 多列，只能逐条添加。
ALTER TABLE "SystemConfig" ADD COLUMN "mailSubjectVerifyEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailBodyVerifyEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailSubjectPasswordReset" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailBodyPasswordReset" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailSubjectChangeEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailBodyChangeEmail" TEXT NOT NULL DEFAULT '';
