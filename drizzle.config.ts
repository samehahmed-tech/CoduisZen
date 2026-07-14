import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'mssql',
    dbCredentials: {
        connectionString: process.env.DATABASE_URL ||
            'Server=(localdb)\\CoduisZen;Integrated Security=True;Database=CoduisZen',
    },
    verbose: true,
    strict: true,
} as any);
