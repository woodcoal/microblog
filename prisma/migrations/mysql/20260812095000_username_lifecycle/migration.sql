-- 用户名生命周期：已有当前名写入永久占用表，后续改名保留历史名。
ALTER TABLE `User` ADD COLUMN `hasSelfRenamed` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `UsernameClaim` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `UsernameClaim_username_key`(`username`),
    INDEX `UsernameClaim_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UsernameRenameAudit` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `previousUsername` VARCHAR(191) NOT NULL,
    `nextUsername` VARCHAR(191) NOT NULL,
    `isAdmin` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `UsernameRenameAudit_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `UsernameRenameAudit_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- MySQL 基线使用大小写不敏感排序；仍显式规范化已有值，保证 SQLite/MySQL 同一契约。
UPDATE `User` SET `username` = LOWER(`username`) WHERE BINARY `username` <> BINARY LOWER(`username`);

INSERT INTO `UsernameClaim` (`id`, `username`, `userId`, `createdAt`)
SELECT UUID(), `username`, `id`, CURRENT_TIMESTAMP(3) FROM `User`;

ALTER TABLE `UsernameClaim`
    ADD CONSTRAINT `UsernameClaim_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UsernameRenameAudit`
    ADD CONSTRAINT `UsernameRenameAudit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `UsernameRenameAudit_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
