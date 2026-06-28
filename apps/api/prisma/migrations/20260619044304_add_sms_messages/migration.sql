-- CreateTable
CREATE TABLE "sms_messages" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "absence_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_absence_id_fkey" FOREIGN KEY ("absence_id") REFERENCES "absences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
