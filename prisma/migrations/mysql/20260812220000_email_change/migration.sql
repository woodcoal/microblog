-- 安全邮箱换绑：确认前只保存目标邮箱和令牌摘要，不修改 User.email。
CREATE TABLE `EmailChangeToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `targetEmail` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `EmailChangeToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailChangeToken_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `EmailChangeToken_expiresAt_consumedAt_revokedAt_idx`(`expiresAt`, `consumedAt`, `revokedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `EmailChangeToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
