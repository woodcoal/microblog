-- 既有媒体全部保留为普通媒体；不猜测或回填缩略图。
ALTER TABLE `Media` ADD COLUMN `slot` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Media_postId_slot_key` ON `Media`(`postId`, `slot`);
CREATE INDEX `Media_postId_fileType_sortOrder_idx` ON `Media`(`postId`, `fileType`, `sortOrder`);

CREATE TABLE `AdminAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `operatorId` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `result` VARCHAR(191) NOT NULL DEFAULT 'success',
    `requestedCount` INTEGER NOT NULL,
    `affectedCount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    CONSTRAINT `AdminAuditLog_operatorId_fkey` FOREIGN KEY (`operatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AdminAuditTarget` (
    `id` VARCHAR(191) NOT NULL,
    `auditLogId` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `outcome` VARCHAR(191) NOT NULL DEFAULT 'updated',
    PRIMARY KEY (`id`),
    CONSTRAINT `AdminAuditTarget_auditLogId_fkey` FOREIGN KEY (`auditLogId`) REFERENCES `AdminAuditLog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `AdminAuditLog_operatorId_requestId_key` ON `AdminAuditLog`(`operatorId`, `requestId`);
CREATE INDEX `AdminAuditLog_createdAt_id_idx` ON `AdminAuditLog`(`createdAt`, `id`);
CREATE INDEX `AdminAuditLog_operatorId_createdAt_id_idx` ON `AdminAuditLog`(`operatorId`, `createdAt`, `id`);
CREATE INDEX `AdminAuditLog_targetType_action_createdAt_id_idx` ON `AdminAuditLog`(`targetType`, `action`, `createdAt`, `id`);
CREATE UNIQUE INDEX `AdminAuditTarget_auditLogId_targetId_key` ON `AdminAuditTarget`(`auditLogId`, `targetId`);
CREATE INDEX `AdminAuditTarget_targetId_auditLogId_idx` ON `AdminAuditTarget`(`targetId`, `auditLogId`);

CREATE TRIGGER `AdminAuditLog_no_update` BEFORE UPDATE ON `AdminAuditLog`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AdminAuditLog is immutable';
CREATE TRIGGER `AdminAuditLog_no_delete` BEFORE DELETE ON `AdminAuditLog`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AdminAuditLog is immutable';
CREATE TRIGGER `AdminAuditTarget_no_update` BEFORE UPDATE ON `AdminAuditTarget`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AdminAuditTarget is immutable';
CREATE TRIGGER `AdminAuditTarget_no_delete` BEFORE DELETE ON `AdminAuditTarget`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AdminAuditTarget is immutable';
