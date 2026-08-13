ALTER TABLE `User` ADD COLUMN `emailVerificationRequired` BOOLEAN NOT NULL DEFAULT true;
UPDATE `User` SET `emailVerificationRequired` = false WHERE `role` = 'admin';

CREATE TABLE `SystemConfig` (
    `id` VARCHAR(191) NOT NULL,
    `emailOwnershipEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AdminBootstrap` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `claimedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `AdminBootstrap_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SmtpConfiguration` (
    `id` VARCHAR(191) NOT NULL,
    `host` VARCHAR(255) NULL,
    `port` INTEGER NULL,
    `security` VARCHAR(16) NULL,
    `username` VARCHAR(255) NULL,
    `passwordEncrypted` TEXT NULL,
    `fromName` VARCHAR(255) NULL,
    `fromAddress` VARCHAR(320) NULL,
    `smtpEverConfigured` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 升级已有站点时永久关闭“首位用户”通道，绝不因历史管理员注销而重新开放。
INSERT INTO `AdminBootstrap` (`id`, `userId`)
SELECT 'global', `id` FROM `User` LIMIT 1;
