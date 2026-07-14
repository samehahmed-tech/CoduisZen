import { drizzle } from 'drizzle-orm/node-mssql';
import * as schema from '../src/db/schema.js';
import mssql from 'mssql';

const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
};

// Try to build the path to schema.ts
const path = require('path');
