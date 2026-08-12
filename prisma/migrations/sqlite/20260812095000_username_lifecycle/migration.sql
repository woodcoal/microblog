-- 用户名生命周期：已有当前名写入永久占用表，后续改名保留历史名。
ALTER TABLE "User" ADD COLUMN "hasSelfRenamed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "UsernameClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsernameClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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

-- 统一采用小写规范名；若旧库存在仅大小写不同的用户名，迁移应停止以避免静默合并身份。
UPDATE "User" SET "username" = lower("username") WHERE "username" <> lower("username");

INSERT INTO "UsernameClaim" ("id", "username", "userId", "createdAt")
SELECT lower(hex(randomblob(16))), "username", "id", CURRENT_TIMESTAMP FROM "User";

CREATE UNIQUE INDEX "UsernameClaim_username_key" ON "UsernameClaim"("username");
CREATE INDEX "UsernameClaim_userId_createdAt_idx" ON "UsernameClaim"("userId", "createdAt");
CREATE INDEX "UsernameRenameAudit_userId_createdAt_idx" ON "UsernameRenameAudit"("userId", "createdAt");
CREATE INDEX "UsernameRenameAudit_actorId_createdAt_idx" ON "UsernameRenameAudit"("actorId", "createdAt");
