// SQLite tables + initialization in TypeScript/JavaScript using better-sqlite3

import Database from 'better-sqlite3';
import logger from '../logger';

// Initialize or open database
const db = new Database('lp_dashboard.db');

// Create lp_strategy_snapshots table
db.exec(`
CREATE TABLE IF NOT EXISTS lp_strategy_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_time DATETIME,
    pair_name TEXT,
    pool_address TEXT,
    pool_name TEXT,
    position_token_id INTEGER,
    position_create_time DATETIME,
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
    is_active boolean,
    block_number INTEGER,
    end_block_number INTEGER,
    UNIQUE(pool_address, pool_name, position_token_id)
);
`);

// Create lp_operations table
db.exec(`
CREATE TABLE IF NOT EXISTS lp_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op_time DATETIME,
    op_type TEXT,
    pool_address TEXT,
    position_token_id INTEGER,
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
    block_number INTEGER,
    UNIQUE(pool_address, position_token_id, tx_hash, op_type)
);
`);

// Create lp_parameters table for storing parameters like last listen block
db.exec(`
CREATE TABLE IF NOT EXISTS lp_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    param_key TEXT UNIQUE,
    param_value TEXT
);`);

logger.info('SQLite tables initialized successfully.');

export default db;