ALTER TABLE "employees" ADD COLUMN "notify_direct_reports" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "employees" ADD COLUMN "notify_team_subs" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "employees" ADD COLUMN "notify_coverage" BOOLEAN NOT NULL DEFAULT true;
