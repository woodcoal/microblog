ALTER TABLE `ApiToken` ADD COLUMN `purpose` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `ApiToken_userId_purpose_key` ON `ApiToken`(`userId`, `purpose`);
