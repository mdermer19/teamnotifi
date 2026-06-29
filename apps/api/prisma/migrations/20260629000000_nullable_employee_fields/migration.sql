-- Make phone, firstName, lastName nullable on employees
ALTER TABLE "employees" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "first_name" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "last_name" DROP NOT NULL;
