/*
  Warnings:

  - The primary key for the `idempotency_keys` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_idempotency_keys" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "key")
);
INSERT INTO "new_idempotency_keys" ("createdAt", "key", "method", "path", "responseBody", "responseStatus", "userId") SELECT "createdAt", "key", "method", "path", "responseBody", "responseStatus", "userId" FROM "idempotency_keys";
DROP TABLE "idempotency_keys";
ALTER TABLE "new_idempotency_keys" RENAME TO "idempotency_keys";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
