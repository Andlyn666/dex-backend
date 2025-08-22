import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const isTestEnv = process.env.IS_TEST_ENV === 'true';
const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  statement_timeout: 5000,
  query_timeout: 5000,
  ...(!isTestEnv ? { ssl: { rejectUnauthorized: false } } : {})
});

export { pool };