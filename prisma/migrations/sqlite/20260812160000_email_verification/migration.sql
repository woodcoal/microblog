-- 邮箱所有权验证：存储状态与不可逆令牌摘要，原始令牌不落库。
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" DATETIME;

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

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_purpose_createdAt_idx" ON "EmailVerificationToken"("userId", "purpose", "createdAt");
CREATE INDEX "EmailVerificationToken_expiresAt_consumedAt_revokedAt_idx" ON "EmailVerificationToken"("expiresAt", "consumedAt", "revokedAt");
