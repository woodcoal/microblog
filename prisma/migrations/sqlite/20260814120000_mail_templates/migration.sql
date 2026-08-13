ALTER TABLE "SystemConfig" ADD COLUMN "mailSubjectVerifyEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailBodyVerifyEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailSubjectPasswordReset" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailBodyPasswordReset" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailSubjectChangeEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemConfig" ADD COLUMN "mailBodyChangeEmail" TEXT NOT NULL DEFAULT '';
