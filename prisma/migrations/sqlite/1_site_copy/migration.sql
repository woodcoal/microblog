-- CreateTable
CREATE TABLE "SiteCopy" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "markdown" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiteCopy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteCopyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteCopyVersion_key_fkey" FOREIGN KEY ("key") REFERENCES "SiteCopy" ("key") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteCopyVersion_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SiteCopyVersion_key_updatedAt_idx" ON "SiteCopyVersion"("key", "updatedAt");
