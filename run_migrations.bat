@echo off
REM Database connection variables (update these with your values)
if not defined DB_HOST set DB_HOST=46.225.167.224
if not defined DB_PORT set DB_PORT=5432
if not defined DB_USER set DB_USER=postgres
if not defined DB_NAME set DB_NAME=flyvpn
if not defined DB_PASSWORD set DB_PASSWORD=13740519ff

echo Starting database migrations...

REM Run migrations
set "MIGRATIONS[0]=database/migrations/026_add_suspension_fields_to_subscriptions.sql"
set "MIGRATIONS[1]=database/migrations/027_create_device_tokens_table.sql"

for %%M in ("%MIGRATIONS[0]%" "%MIGRATIONS[1]%") do (
  echo Running: %%M
  
  psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -f %%M
  
  if errorlevel 1 (
    echo Failed: %%M
    exit /b 1
  ) else (
    echo Completed: %%M
  )
)

echo All migrations completed successfully!
