ALTER TABLE "employees" ADD COLUMN "work_email" TEXT;
ALTER TABLE "app_users" ADD COLUMN "employee_id" INTEGER REFERENCES "employees"("id");
