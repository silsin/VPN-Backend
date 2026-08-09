-- Migration: Add indexes to optimize dialog queries
-- This migration adds indexes to improve performance for the frequently-used
-- getActiveDialogsForMobile query which was being executed 10-100+ times per second

-- Index on the main filter columns for active dialogs
CREATE INDEX IF NOT EXISTS idx_dialogs_status_type_placement 
ON dialogs(status, type, placement)
WHERE status = 'sent';

-- Index for target filtering
CREATE INDEX IF NOT EXISTS idx_dialogs_target 
ON dialogs(target);

-- Index for expire time filtering
CREATE INDEX IF NOT EXISTS idx_dialogs_expire_time 
ON dialogs(expire_time)
WHERE expire_time IS NOT NULL;

-- Composite index for priority and sent_time ordering
CREATE INDEX IF NOT EXISTS idx_dialogs_priority_sent_time 
ON dialogs(priority DESC, sent_time DESC);

-- Index to speed up the EXISTS subquery for device delivery checks
CREATE INDEX IF NOT EXISTS idx_dialog_deliveries_dialog_device_status 
ON dialog_deliveries(dialog_id, device_id, dismissed, clicked);

-- This index helps with the NOT EXISTS check for non-repeatable dialogs
CREATE INDEX IF NOT EXISTS idx_dialog_deliveries_device_dialog 
ON dialog_deliveries(device_id, dialog_id)
WHERE dismissed = true OR clicked = true;
