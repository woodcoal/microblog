-- 邮件模板自定义：主题与正文，留空使用内置默认值。
ALTER TABLE `SystemConfig`
	ADD COLUMN `mailSubjectVerifyEmail` TEXT NOT NULL DEFAULT '',
	ADD COLUMN `mailBodyVerifyEmail` TEXT NOT NULL DEFAULT '',
	ADD COLUMN `mailSubjectPasswordReset` TEXT NOT NULL DEFAULT '',
	ADD COLUMN `mailBodyPasswordReset` TEXT NOT NULL DEFAULT '',
	ADD COLUMN `mailSubjectChangeEmail` TEXT NOT NULL DEFAULT '',
	ADD COLUMN `mailBodyChangeEmail` TEXT NOT NULL DEFAULT '';
