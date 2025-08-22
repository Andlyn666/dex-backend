import Database from 'better-sqlite3';
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { LpStrategySnapshotParams, LpOperationParams } from './type';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, "../db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
export const db = new Database(path.join(dbDir, "lp_dashboard.db"));

export async function getParamValue(paramKey: string): Promise<string | null> {
    const query = `SELECT param_value FROM lp_parameters WHERE param_key = ?`;
    const row = db.prepare(query).get(paramKey);
    return row ? row.param_value : null;
}

export async function isTokenIdRecordExists(poolAddress, tokenId, poolName) {
    try {
        const query = `SELECT * FROM lp_strategy_snapshots WHERE pool_address = ? AND position_token_id = ? AND pool_name = ?`;
        const row = db.prepare(query).get(poolAddress, tokenId, poolName);
        return row !== undefined;
    } catch (error) {
        throw new Error(`Error checking token ID record: ${error}`);
    }
}

export async function insertPositionRecord(params: LpStrategySnapshotParams) {
    try {
        const { pool_address, position_token_id, pool_name } = params;
        // 检查是否已存在
        const existQuery = `SELECT 1 FROM lp_strategy_snapshots WHERE pool_address = ? AND position_token_id = ? AND pool_name = ?`;
        const exist = db.prepare(existQuery).get(pool_address, position_token_id, pool_name);
        if (exist) {
            // 已存在，不插入
            return true;
        }
        // 构造插入
        const fields = Object.keys(params);
        const placeholders = fields.map(() => '?').join(', ');
        const insertQuery = `INSERT INTO lp_strategy_snapshots (${fields.join(', ')}) VALUES (${placeholders})`;
        const values = fields.map(f => (params as any)[f]);
        db.prepare(insertQuery).run(...values);
        return true;
    } catch (error) {
        throw new Error(`Error inserting position record: ${error}`);
    }
}

export async function updatePositionRecord(params: LpStrategySnapshotParams) {
    try {
        const { pool_address, position_token_id, pool_name } = params;
        // 检查是否已存在
        const existQuery = `SELECT 1 FROM lp_strategy_snapshots WHERE pool_address = ? AND position_token_id = ? AND pool_name = ?`;
        const exist = db.prepare(existQuery).get(pool_address, position_token_id, pool_name);
        if (!exist) {
            // 不存在，无法更新
            return false;
        }
        // 构造更新
        const fields = Object.keys(params).filter(
        f => f !== 'pool_address' && f !== 'position_token_id' && f !== 'pool_name' && params[f] !== undefined && params[f] !== null
        );
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const updateQuery = `UPDATE lp_strategy_snapshots SET ${setClause} WHERE pool_address = ? AND position_token_id = ? AND pool_name = ?`;
        const values = fields.map(f => (params as any)[f]).concat(pool_address, position_token_id, pool_name);
        db.prepare(updateQuery).run(...values);
        return true;
    } catch (error) {
        throw new Error(`Error updating position record: ${error}`);
    }
}

export async function insertOperationRecord(params: LpOperationParams) {
    try {
        const fields = Object.keys(params);
        const placeholders = fields.map(() => '?').join(', ');
        const insertQuery = `INSERT INTO lp_operations (${fields.join(', ')}) VALUES (${placeholders})`;
        const values = fields.map(f => (params as any)[f]);
        db.prepare(insertQuery).run(...values);
        return true;
    } catch (error) {
        throw new Error(`Error inserting operation record: ${error}`);
    }
}

export async function getAllActivePositions(poolName): Promise<any[]> {
    try {
        const query = `SELECT position_token_id, pool_name, pool_address, base_token_address, quote_token_address, base_token_location, position_create_time FROM lp_strategy_snapshots WHERE is_active = 1 AND pool_name = ?`
        const rows = db.prepare(query).all(poolName);
        return rows.map(row => ({
            tokenId: row.position_token_id,
            poolName: row.pool_name,
            poolAddress: row.pool_address,
            baseTokenAddress: row.base_token_address,
            quoteTokenAddress: row.quote_token_address,
            blockNumber: row.block_number,
            baseTokenLocation: row.base_token_location,
            createTime: row.position_create_time
        }));
        
    } catch (error) {
        throw new Error(`Error fetching active token IDs: ${error}`);
    }
}

export async function upsertParamValue(paramKey: string, paramValue: string): Promise<boolean> {
    try {
        const upsertQuery = `
            INSERT INTO lp_parameters (param_key, param_value)
            VALUES (?, ?)
            ON CONFLICT(param_key) DO UPDATE SET param_value = excluded.param_value
        `;
        db.prepare(upsertQuery).run(paramKey, paramValue);
        return true;
    } catch (error) {
        throw new Error(`Error upserting parameter value: ${error}`);
    }
}