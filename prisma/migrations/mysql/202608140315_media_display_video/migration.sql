ALTER TABLE `FileStorage`
  ADD COLUMN `displayFilePath` VARCHAR(191) NULL,
  ADD COLUMN `displayFileSize` INT NULL,
  ADD COLUMN `displayMimeType` VARCHAR(191) NULL,
  ADD COLUMN `displayWidth` INT NULL,
  ADD COLUMN `displayHeight` INT NULL;
