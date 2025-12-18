INSERT INTO settings ("key", "value", "category", "description")
VALUES ('MaxVPNUsage', '10', 'general', 'Maximum VPN usage limit')
ON CONFLICT ("key") DO NOTHING;
