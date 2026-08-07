CREATE TABLE `UploadReservation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fileStorageId` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(512) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `UploadReservation_owner_file_active_idx` (`userId`, `fileStorageId`, `consumedAt`, `cancelledAt`, `expiresAt`),
    INDEX `UploadReservation_expiry_active_idx` (`expiresAt`, `consumedAt`, `cancelledAt`),
    CONSTRAINT `UploadReservation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `UploadReservation_fileStorageId_fkey` FOREIGN KEY (`fileStorageId`) REFERENCES `FileStorage` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
