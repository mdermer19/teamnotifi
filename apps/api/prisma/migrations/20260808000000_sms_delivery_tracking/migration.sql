-- Add delivery-tracking columns to sms_messages
ALTER TABLE sms_messages
  ADD COLUMN twilio_sid       VARCHAR UNIQUE,
  ADD COLUMN delivery_status  VARCHAR,
  ADD COLUMN status_updated_at TIMESTAMP(3),
  ADD COLUMN error_code       VARCHAR,
  ADD COLUMN message_type     VARCHAR,
  ADD COLUMN employee_id      INTEGER REFERENCES employees(id);

-- Index for status-callback lookups (by SID is covered by UNIQUE above).
-- This one speeds up the 12-hour reconciliation query if we add it later.
CREATE INDEX sms_messages_delivery_status_idx ON sms_messages(delivery_status)
  WHERE direction = 'outbound' AND delivery_status IS NOT NULL;

-- Admin alert table.  One row per failed message, unique constraint provides
-- idempotency: duplicate webhooks cannot create a second alert for the same message.
CREATE TABLE sms_alerts (
  id               SERIAL PRIMARY KEY,
  sms_message_id   INTEGER NOT NULL UNIQUE REFERENCES sms_messages(id),
  acknowledged_at  TIMESTAMP(3),
  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
