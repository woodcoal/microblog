-- Unified trending candidate and interaction indexes.
CREATE INDEX "Post_mode_isDeleted_createdAt_idx" ON "Post"("mode", "isDeleted", "createdAt");
CREATE INDEX "Like_postId_userId_idx" ON "Like"("postId", "userId");
CREATE INDEX "Bookmark_postId_userId_idx" ON "Bookmark"("postId", "userId");
CREATE INDEX "Comment_postId_isDeleted_userId_idx" ON "Comment"("postId", "isDeleted", "userId");

-- Explicit cold-start interests; recommendation output itself is never persisted.
ALTER TABLE "UserSettings" ADD COLUMN "interestOnboardingCompletedAt" DATETIME;

CREATE TABLE "UserTagInterest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserTagInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTagInterest_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserTagInterest_userId_tagId_key" ON "UserTagInterest"("userId", "tagId");
CREATE INDEX "UserTagInterest_tagId_userId_idx" ON "UserTagInterest"("tagId", "userId");

CREATE TABLE "UserCategoryInterest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCategoryInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserCategoryInterest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserCategoryInterest_userId_categoryId_key" ON "UserCategoryInterest"("userId", "categoryId");
CREATE INDEX "UserCategoryInterest_categoryId_userId_idx" ON "UserCategoryInterest"("categoryId", "userId");
