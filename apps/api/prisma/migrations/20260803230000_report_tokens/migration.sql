-- Secure one-time web report links (SMS becomes the entry point only).

CREATE TABLE "report_tokens" (
    "id"            SERIAL       NOT NULL,
    "token_hash"    TEXT         NOT NULL,
    "employee_id"   INTEGER      NOT NULL,
    "state"         TEXT         NOT NULL DEFAULT 'CONFIRM_DATE',
    "context"       JSONB        NOT NULL DEFAULT '{}',
    "state_history" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status"        TEXT         NOT NULL DEFAULT 'active',
    "absence_id"    INTEGER,
    "expires_at"    TIMESTAMP(3) NOT NULL,
    "submitted_at"  TIMESTAMP(3),
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_tokens_token_hash_key" ON "report_tokens"("token_hash");
CREATE UNIQUE INDEX "report_tokens_absence_id_key"  ON "report_tokens"("absence_id");
CREATE INDEX "report_tokens_employee_id_status_idx" ON "report_tokens"("employee_id", "status");

ALTER TABLE "report_tokens"
  ADD CONSTRAINT "report_tokens_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_tokens"
  ADD CONSTRAINT "report_tokens_absence_id_fkey"
  FOREIGN KEY ("absence_id") REFERENCES "absences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Concurrency guarantee #1: at most one ACTIVE token per employee.
-- A plain composite index cannot enforce this; a partial unique index can.
-- Two simultaneous inbound texts => one INSERT wins, the other gets P2002
-- and is resolved by re-reading the winner, so both send the same link.
CREATE UNIQUE INDEX "report_tokens_one_active_per_employee"
    ON "report_tokens"("employee_id")
    WHERE "status" = 'active';

-- Concurrency guarantee #2: never two absences for the same employee+date,
-- regardless of which flow (legacy SMS or new web) created them. This is the
-- real backstop behind the existing read-then-write findFirst() check.
-- Verified safe: zero duplicate (employee_id, shift_date) rows exist.
CREATE UNIQUE INDEX "absences_employee_shift_date_key"
    ON "absences"("employee_id", "shift_date");
