-- Whether a dialog should keep showing after the user dismisses it
ALTER TABLE dialogs
  ADD COLUMN IF NOT EXISTS repeatable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN dialogs.repeatable IS
  'If true, mobile may show again after dismiss/click. If false, show once per device.';
