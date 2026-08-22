ALTER TABLE `SystemConfig`
  ADD COLUMN `watermarkEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `watermarkTemplate` VARCHAR(256) NOT NULL DEFAULT '{{username}} · {{nickname}} · {{publishedAt}}',
  ADD COLUMN `watermarkPosition` VARCHAR(16) NOT NULL DEFAULT 'bottom-right',
  ADD COLUMN `watermarkOffsetX` INTEGER NOT NULL DEFAULT -24,
  ADD COLUMN `watermarkOffsetY` INTEGER NOT NULL DEFAULT -24,
  ADD COLUMN `watermarkFontSize` INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN `watermarkColor` VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
  ADD COLUMN `watermarkOpacity` DOUBLE NOT NULL DEFAULT 0.65,
  ADD COLUMN `watermarkRotation` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `watermarkTiled` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Media`
  ADD COLUMN `watermarkFilePath` VARCHAR(512) NULL,
  ADD COLUMN `watermarkFileSize` INTEGER NULL,
  ADD COLUMN `watermarkMimeType` VARCHAR(127) NULL,
  ADD COLUMN `watermarkWidth` INTEGER NULL,
  ADD COLUMN `watermarkHeight` INTEGER NULL;
