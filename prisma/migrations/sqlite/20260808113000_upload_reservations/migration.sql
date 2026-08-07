CREATE TABLE "UploadReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fileStorageId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UploadReservation_fileStorageId_fkey" FOREIGN KEY ("fileStorageId") REFERENCES "FileStorage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "UploadReservation_owner_file_active_idx"
ON "UploadReservation"("userId", "fileStorageId", "consumedAt", "cancelledAt", "expiresAt");

CREATE INDEX "UploadReservation_expiry_active_idx"
ON "UploadReservation"("expiresAt", "consumedAt", "cancelledAt");
