ALTER TABLE "ApiToken" ADD COLUMN "purpose" TEXT;
CREATE UNIQUE INDEX "ApiToken_userId_purpose_key" ON "ApiToken"("userId", "purpose");
