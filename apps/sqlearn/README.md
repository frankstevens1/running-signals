# Sqlearn Deployment

Sqlearn is a shared-password application. It must only be deployed with these server-only
environment variables:

```text
SUPABASE_DB_URL=
SQLEARN_PASSWORD_HASH=
SQLEARN_SESSION_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Generate the shared-password hash without placing the password in shell history:

```bash
pnpm --filter sqlearn hash-password
```

After applying `202608040007_sqlearn_reader.sql`, set a long random password for the reader role
through a privileged database session. Keep its connection string only in deployment secrets:

```sql
alter role sqlearn_reader login password '<generated-password>';
```

The reader role can query only the `sqlearn` schema views. Sqlearn rejects unauthenticated requests,
non-read-only SQL, unbounded result sets, and non-approved source objects.
