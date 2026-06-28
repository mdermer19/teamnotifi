/*
  Warnings:

  - You are about to drop the column `covering_manager_id` on the `temp_coverage` table. All the data in the column will be lost.
  - You are about to drop the column `covering_name` on the `temp_coverage` table. All the data in the column will be lost.
  - You are about to drop the column `covering_phone` on the `temp_coverage` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "temp_coverage" DROP CONSTRAINT "temp_coverage_covering_manager_id_fkey";

-- AlterTable
ALTER TABLE "temp_coverage" DROP COLUMN "covering_manager_id",
DROP COLUMN "covering_name",
DROP COLUMN "covering_phone";

-- CreateTable
CREATE TABLE "temp_coverage_coverers" (
    "id" SERIAL NOT NULL,
    "coverage_id" INTEGER NOT NULL,
    "manager_id" INTEGER NOT NULL,

    CONSTRAINT "temp_coverage_coverers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_subscriptions" (
    "id" SERIAL NOT NULL,
    "subscriber_id" INTEGER NOT NULL,
    "team_owner_id" INTEGER NOT NULL,

    CONSTRAINT "team_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "temp_coverage_coverers_coverage_id_manager_id_key" ON "temp_coverage_coverers"("coverage_id", "manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_subscriptions_subscriber_id_team_owner_id_key" ON "team_subscriptions"("subscriber_id", "team_owner_id");

-- AddForeignKey
ALTER TABLE "temp_coverage_coverers" ADD CONSTRAINT "temp_coverage_coverers_coverage_id_fkey" FOREIGN KEY ("coverage_id") REFERENCES "temp_coverage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temp_coverage_coverers" ADD CONSTRAINT "temp_coverage_coverers_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_subscriptions" ADD CONSTRAINT "team_subscriptions_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_subscriptions" ADD CONSTRAINT "team_subscriptions_team_owner_id_fkey" FOREIGN KEY ("team_owner_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
