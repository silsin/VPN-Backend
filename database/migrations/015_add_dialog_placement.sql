-- When/where mobile should show a dialog (separate from type=in-app|push|both)
ALTER TABLE dialogs
  ADD COLUMN IF NOT EXISTS placement VARCHAR(50) NOT NULL DEFAULT 'general';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dialogs_placement_check'
  ) THEN
    ALTER TABLE dialogs
      ADD CONSTRAINT dialogs_placement_check
      CHECK (placement IN (
        'general',
        'splash',
        'before_connect',
        'after_connect'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dialogs_placement ON dialogs(placement);

COMMENT ON COLUMN dialogs.placement IS
  'When to show: general | splash | before_connect | after_connect';
