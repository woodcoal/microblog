-- 博客文章可保存作者自行填写的分类名称；系统分类仍由 categoryId 关联维护。
ALTER TABLE "Post" ADD COLUMN "customCategory" TEXT;
