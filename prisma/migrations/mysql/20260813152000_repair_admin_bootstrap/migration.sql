-- 已升级实例修复：仅有效管理员可占用 bootstrap；无有效管理员时提升最早有效用户。
UPDATE `User`
SET `role` = 'admin', `emailVerificationRequired` = false
WHERE `id` = (
    SELECT `id` FROM (
        SELECT `id` FROM `User`
        WHERE `isDisabled` = false AND `deletedAt` IS NULL
        ORDER BY `createdAt`, `id`
        LIMIT 1
    ) AS `eligible_user`
)
AND NOT EXISTS (
    SELECT 1 FROM `User` AS `valid_admin`
    WHERE `valid_admin`.`role` = 'admin'
      AND `valid_admin`.`isDisabled` = false
      AND `valid_admin`.`deletedAt` IS NULL
);

UPDATE `AdminBootstrap`
SET `userId` = (
    SELECT `id` FROM (
        SELECT `id` FROM `User`
        WHERE `role` = 'admin' AND `isDisabled` = false AND `deletedAt` IS NULL
        ORDER BY `createdAt`, `id`
        LIMIT 1
    ) AS `valid_admin`
)
WHERE `id` = 'global'
  AND EXISTS (
    SELECT 1 FROM `User` AS `valid_admin`
    WHERE `valid_admin`.`role` = 'admin'
      AND `valid_admin`.`isDisabled` = false
      AND `valid_admin`.`deletedAt` IS NULL
  );
