ALTER TABLE "User" ADD COLUMN "emailVerificationRequired" BOOLEAN NOT NULL DEFAULT true;
UPDATE "User" SET "emailVerificationRequired" = false WHERE "role" = 'admin';

CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailOwnershipEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "AdminBootstrap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AdminBootstrap_userId_key" ON "AdminBootstrap"("userId");
-- 升级已有站点时永久关闭“首位用户”通道，绝不因历史管理员注销而重新开放。
INSERT INTO "AdminBootstrap" ("id", "userId")
SELECT 'global', "id" FROM "User" LIMIT 1;

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
