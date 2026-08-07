-- 既有媒体全部保留为普通媒体；不猜测或回填缩略图。
ALTER TABLE "Media" ADD COLUMN "slot" TEXT;

CREATE UNIQUE INDEX "Media_postId_slot_key" ON "Media"("postId", "slot");
CREATE INDEX "Media_postId_fileType_sortOrder_idx" ON "Media"("postId", "fileType", "sortOrder");

CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'success',
    "requestedCount" INTEGER NOT NULL,
    "affectedCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AdminAuditTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditLogId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'updated',
    CONSTRAINT "AdminAuditTarget_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AdminAuditLog" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AdminAuditLog_operatorId_requestId_key" ON "AdminAuditLog"("operatorId", "requestId");
CREATE INDEX "AdminAuditLog_createdAt_id_idx" ON "AdminAuditLog"("createdAt", "id");
CREATE INDEX "AdminAuditLog_operatorId_createdAt_id_idx" ON "AdminAuditLog"("operatorId", "createdAt", "id");
CREATE INDEX "AdminAuditLog_targetType_action_createdAt_id_idx" ON "AdminAuditLog"("targetType", "action", "createdAt", "id");
CREATE UNIQUE INDEX "AdminAuditTarget_auditLogId_targetId_key" ON "AdminAuditTarget"("auditLogId", "targetId");
CREATE INDEX "AdminAuditTarget_targetId_auditLogId_idx" ON "AdminAuditTarget"("targetId", "auditLogId");

CREATE TRIGGER "AdminAuditLog_no_update" BEFORE UPDATE ON "AdminAuditLog"
BEGIN
    SELECT RAISE(ABORT, 'AdminAuditLog is immutable');
END;

CREATE TRIGGER "AdminAuditLog_no_delete" BEFORE DELETE ON "AdminAuditLog"
BEGIN
    SELECT RAISE(ABORT, 'AdminAuditLog is immutable');
END;

CREATE TRIGGER "AdminAuditTarget_no_update" BEFORE UPDATE ON "AdminAuditTarget"
BEGIN
    SELECT RAISE(ABORT, 'AdminAuditTarget is immutable');
END;

CREATE TRIGGER "AdminAuditTarget_no_delete" BEFORE DELETE ON "AdminAuditTarget"
BEGIN
    SELECT RAISE(ABORT, 'AdminAuditTarget is immutable');
END;
