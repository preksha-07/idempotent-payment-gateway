-- The idempotency reservation and payment row are created
-- in the same transaction.
--
-- The idempotency row references the payment UUID before the
-- payment row itself exists, so the foreign-key check must be
-- deferred until transaction commit.

ALTER TABLE idempotency_keys
DROP CONSTRAINT IF EXISTS idempotency_keys_payment_id_fkey;

ALTER TABLE idempotency_keys
ADD CONSTRAINT idempotency_keys_payment_id_fkey
FOREIGN KEY (payment_id)
REFERENCES payments(id)
DEFERRABLE INITIALLY DEFERRED;