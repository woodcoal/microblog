-- 邮箱所有权验证：存储状态与不可逆令牌摘要，原始令牌不落库。
ALTER TABLE `User` ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL;

CREATE TABLE `EmailVerificationToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL DEFAULT 'verify_email',
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailVerificationToken_userId_purpose_createdAt_idx`(`userId`, `purpose`, `createdAt`),
    INDEX `EmailVerificationToken_expiresAt_consumedAt_revokedAt_idx`(`expiresAt`, `consumedAt`, `revokedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
