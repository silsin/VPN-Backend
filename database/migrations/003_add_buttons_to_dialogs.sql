-- Add buttons column to dialogs table
ALTER TABLE dialogs
ADD COLUMN buttons JSONB;

-- Add comment to explain the structure
COMMENT ON COLUMN dialogs.buttons IS 'Array of button objects with structure: {label: string, actionUrl?: string, action?: string, style?: string}';
