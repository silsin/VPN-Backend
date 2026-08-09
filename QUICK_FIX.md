# Quick Fix - Missing isIranSide Column

## The Error
```
ERROR: column V2RayConfig.isIranSide does not exist
```

## The Fix (1 command)

```bash
psql -U your_postgres_user -d your_database_name -f database/fix_missing_column.sql
```

Replace:
- `your_postgres_user` → Your PostgreSQL username (usually `postgres`)
- `your_database_name` → Your database name (usually in your `.env` file)

## Example

```bash
# If your .env has:
# DB_HOST=localhost
# DB_PORT=5432
# DB_USERNAME=postgres
# DB_PASSWORD=yourpassword
# DB_NAME=flyvpn

psql -U postgres -d flyvpn -f database/fix_missing_column.sql
```

## What This Does

✅ Removes any incorrectly named columns  
✅ Adds the correct `"isIranSide"` column  
✅ Creates performance index  
✅ Marks migration as completed  
✅ Verifies everything works  

## After Running Fix

Restart your backend:

```bash
pm2 restart vpn-backend
# or
npm run start
```

## Verify It Worked

Check the logs - you should see:
```
[DatabaseMigrationService] Database migrations completed successfully.
[Nest] Application started on port 3000
```

And NO errors about `isIranSide does not exist`.

## If It Doesn't Work

See `MIGRATION_TROUBLESHOOTING.md` for detailed troubleshooting steps.

---

That's it! 🚀
