-- 密码重置：独立一次性令牌与 JWT 凭据版本。令牌原文绝不落库。
ALTER TABLE `User` ADD COLUMN `credentialVersion` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `PasswordResetToken_expiresAt_consumedAt_revokedAt_idx`(`expiresAt`, `consumedAt`, `revokedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
