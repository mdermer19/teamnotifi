-- CreateTable
CREATE TABLE "app_users" (
    "id" SERIAL NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'manager',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_locations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,

    CONSTRAINT "app_user_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_clerk_user_id_key" ON "app_users"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_locations_user_id_location_id_key" ON "app_user_locations"("user_id", "location_id");

-- AddForeignKey
ALTER TABLE "app_user_locations" ADD CONSTRAINT "app_user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_locations" ADD CONSTRAINT "app_user_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
