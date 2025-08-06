import { pool } from './pg-client';
import logger from '../logger';

async function initPostgres() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lp_strategy_snapshots (
          id SERIAL PRIMARY KEY,
          query_time TIMESTAMP,
          pair_name TEXT,
          pool_address TEXT,
          pool_name TEXT,
          position_token_id BIGINT,
          position_create_time TIMESTAMP,
          position_duration_h REAL,
          base_price_usd REAL,
          quote_price_usd REAL,
          base_token_address TEXT,
          quote_token_address TEXT,
          base_token_location TEXT,

          total_add_base_amount REAL,
          total_add_quote_amount REAL,
          total_add_base_value_usd REAL,
          total_add_quote_value_usd REAL,
          total_add_value_usd REAL,

          total_remove_base_amount REAL,
          total_remove_quote_amount REAL,
          total_remove_base_value_usd REAL,
          total_remove_quote_value_usd REAL,
          total_remove_value_usd REAL,

          total_fee_claim_base_amount REAL,
          total_fee_claim_quote_amount REAL,
          total_fee_claim_base_value_usd REAL,
          total_fee_claim_quote_value_usd REAL,
          total_fee_claim_value_usd REAL,

          total_collect_base_amount REAL,
          total_collect_quote_amount REAL,
          total_collect_base_value_usd REAL,
          total_collect_quote_value_usd REAL,
          total_collect_value_usd REAL,

          unclaimed_fee_base_amount REAL,
          unclaimed_fee_quote_amount REAL,
          unclaimed_fee_base_value_usd REAL,
          unclaimed_fee_quote_value_usd REAL,
          unclaimed_fee_value_usd REAL,

          current_base_amount REAL,
          current_quote_amount REAL,
          current_position_value_usd REAL,

          pnl_total_usd REAL,
          pnl_total_percentage REAL,
          is_active BOOLEAN,
          block_number BIGINT,
          end_block_number BIGINT,
          owner TEXT,
          UNIQUE(pool_address, pool_name, position_token_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lp_operations (
          id SERIAL PRIMARY KEY,
          op_time TIMESTAMP,
          op_type TEXT,
          pool_address TEXT,
          position_token_id BIGINT,
          base_token_address TEXT,
          quote_token_address TEXT,
          base_decimals INTEGER,
          quote_decimals INTEGER,
          base_amount REAL,
          base_price_usd REAL,
          quote_amount REAL,
          quote_price_usd REAL,
          liquidity TEXT,
          tx_hash TEXT,
          block_number BIGINT,
          UNIQUE(pool_address, position_token_id, tx_hash, op_type)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lp_parameters (
          id SERIAL PRIMARY KEY,
          param_key TEXT UNIQUE,
          param_value TEXT
      );
    `);

    logger.info('PostgreSQL tables initialized successfully.');
  } catch (error) {
    logger.error('Error initializing PostgreSQL tables:', error);
    process.exit(1);
  }
}

export default initPostgres;

await initPostgres();