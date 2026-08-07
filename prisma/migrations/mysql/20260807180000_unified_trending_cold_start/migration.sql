-- Unified trending candidate and interaction indexes.
CREATE INDEX `Post_mode_isDeleted_createdAt_idx` ON `Post`(`mode`, `isDeleted`, `createdAt`);
CREATE INDEX `Like_postId_userId_idx` ON `Like`(`postId`, `userId`);
CREATE INDEX `Bookmark_postId_userId_idx` ON `Bookmark`(`postId`, `userId`);
CREATE INDEX `Comment_postId_isDeleted_userId_idx` ON `Comment`(`postId`, `isDeleted`, `userId`);

ALTER TABLE `UserSettings` ADD COLUMN `interestOnboardingCompletedAt` DATETIME(3) NULL;

CREATE TABLE `UserTagInterest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `UserTagInterest_userId_tagId_key`(`userId`, `tagId`),
    INDEX `UserTagInterest_tagId_userId_idx`(`tagId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserCategoryInterest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `UserCategoryInterest_userId_categoryId_key`(`userId`, `categoryId`),
    INDEX `UserCategoryInterest_categoryId_userId_idx`(`categoryId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserTagInterest` ADD CONSTRAINT `UserTagInterest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserTagInterest` ADD CONSTRAINT `UserTagInterest_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserCategoryInterest` ADD CONSTRAINT `UserCategoryInterest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserCategoryInterest` ADD CONSTRAINT `UserCategoryInterest_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
