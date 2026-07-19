-- App versioning / force-update settings for mobile clients
INSERT INTO settings ("key", "value", "category", "description")
VALUES
  ('androidVersion', '"1.0.0"', 'app_version', 'Latest Android version name (e.g. 1.0.0)'),
  ('androidBuild', '1', 'app_version', 'Latest Android build number (integer)'),
  ('androidForceUpdate', 'false', 'app_version', 'Force update when client build is older'),
  ('androidOptionalUpdate', 'true', 'app_version', 'Show optional update dialog when client build is older'),
  ('androidStoreUrl', '""', 'app_version', 'Android store / download URL'),
  ('androidMessage', '"A new version is available."', 'app_version', 'Upgrade dialog message for Android'),
  ('iosVersion', '"1.0.0"', 'app_version', 'Latest iOS version name (e.g. 1.0.0)'),
  ('iosBuild', '1', 'app_version', 'Latest iOS build number (integer)'),
  ('iosForceUpdate', 'false', 'app_version', 'Force update when client build is older'),
  ('iosOptionalUpdate', 'true', 'app_version', 'Show optional update dialog when client build is older'),
  ('iosStoreUrl', '""', 'app_version', 'iOS App Store / download URL'),
  ('iosMessage', '"A new version is available."', 'app_version', 'Upgrade dialog message for iOS')
ON CONFLICT ("key") DO NOTHING;
