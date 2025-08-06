import { pool } from './pg-client';
import { LpStrategySnapshotParams, LpOperationParams } from './type';
import logger from '../logger';

export async function getParamValue(paramKey: string): Promise<string | null> {
    const result = await pool.query(`SELECT param_value FROM lp_parameters WHERE param_key = $1`, [paramKey]);
    return result.rows.length ? result.rows[0].param_value : null;
}

export async function isTokenIdRecordExists(poolAddress: string, tokenId: number, poolName: string): Promise<boolean> {
    try {
        const result = await pool.query(
            `SELECT 1 FROM lp_strategy_snapshots WHERE pool_address = $1 AND position_token_id = $2 AND pool_name = $3`,
            [poolAddress, tokenId, poolName]
        );
        return (result?.rowCount ?? 0) > 0;
    } catch (error) {
        throw new Error(`Error checking token ID record: ${error}`);
    }
}

export async function insertPositionRecord(params: LpStrategySnapshotParams): Promise<boolean> {
    try {
        const { pool_address, position_token_id, pool_name } = params;

        const exists = await isTokenIdRecordExists(pool_address, position_token_id, pool_name);
        if (exists) return true;

        const fields = Object.keys(params);
        const values = Object.values(params);
        const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

        const query = `INSERT INTO lp_strategy_snapshots (${fields.join(', ')}) VALUES (${placeholders})`;
        await pool.query(query, values);
        return true;
    } catch (error) {
        throw new Error(`Error inserting position record: ${error}`);
    }
}

export async function updatePositionRecord(params: LpStrategySnapshotParams): Promise<boolean> {
    try {
        const { pool_address, position_token_id, pool_name } = params;

        const exists = await isTokenIdRecordExists(pool_address, position_token_id, pool_name);
        if (!exists) return false;

        const fields = Object.keys(params).filter(
            f => !['pool_address', 'position_token_id', 'pool_name'].includes(f)
                && params[f] !== undefined && params[f] !== null
        );

        const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
        const values = fields.map(f => (params as any)[f]);

        const conditionIndex = fields.length;
        const query = `UPDATE lp_strategy_snapshots SET ${setClause} WHERE pool_address = $${conditionIndex + 1} AND position_token_id = $${conditionIndex + 2} AND pool_name = $${conditionIndex + 3}`;
        values.push(pool_address, position_token_id, pool_name);

        await pool.query(query, values);
        return true;
    } catch (error) {
        throw new Error(`Error updating position record: ${error}`);
    }
}

export async function insertOperationRecord(params: LpOperationParams): Promise<boolean> {
    try {
        const fields = Object.keys(params);
        const values = Object.values(params);
        const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

        const query = `INSERT INTO lp_operations (${fields.join(', ')}) VALUES (${placeholders})`;
        await pool.query(query, values);
        return true;
    } catch (error) {
        throw new Error(`Error inserting operation record: ${error}`);
    }
}

export async function getAllActivePositions(poolName: string): Promise<any[]> {
    try {
        const query = `SELECT position_token_id, pool_name, pool_address, base_token_address, quote_token_address, base_token_location, position_create_time, block_number FROM lp_strategy_snapshots WHERE is_active = true AND pool_name = $1`;
        const result = await pool.query(query, [poolName]);

        return result.rows.map(row => ({
            tokenId: row.position_token_id,
            poolName: row.pool_name,
            poolAddress: row.pool_address,
            baseTokenAddress: row.base_token_address,
            quoteTokenAddress: row.quote_token_address,
            blockNumber: row.block_number,
            baseTokenLocation: row.base_token_location,
            createTime: row.position_create_time,
        }));
    } catch (error) {
        throw new Error(`Error fetching active token IDs: ${error}`);
    }
}

export async function upsertParamValue(paramKey: string, paramValue: string): Promise<boolean> {
    try {
        const query = `
            INSERT INTO lp_parameters (param_key, param_value)
            VALUES ($1, $2)
            ON CONFLICT(param_key) DO UPDATE SET param_value = EXCLUDED.param_value
        `;
        await pool.query(query, [paramKey, paramValue]);
        return true;
    } catch (error) {
        throw new Error(`Error upserting parameter value: ${error}`);
    }
}

export async function insertManyOperations(paramsList: LpOperationParams[]) {
    if (paramsList.length === 0) return;

    const fields = Object.keys(paramsList[0]);
    const fieldList = fields.join(', ');

    const valueRows: string[] = [];
    const values: any[] = [];

    paramsList.forEach((row, rowIndex) => {
        const placeholders = fields.map((_, colIndex) => `$${rowIndex * fields.length + colIndex + 1}`);
        valueRows.push(`(${placeholders.join(', ')})`);
        values.push(...fields.map(f => (row as any)[f]));
    });

    const query = `
        INSERT INTO lp_operations (${fieldList})
        VALUES ${valueRows.join(', ')}
        ON CONFLICT(pool_address, position_token_id, tx_hash, op_type) DO NOTHING
    `;

    try {
        await pool.query(query, values);
        logger.info(`✅ Inserted ${paramsList.length} lp_operations rows`);
    } catch (error) {
        throw new Error(`❌ Error inserting batch lp_operations: ${error}`);
    }
}

export async function getOperationsByTokenId(poolAddress: string, tokenId: string) {
    try {
        const query = `
            SELECT * FROM lp_operations
            WHERE pool_address = $1 AND position_token_id = $2
            ORDER BY block_number ASC
        `;
        const result = await pool.query(query, [poolAddress, tokenId]);
        return result.rows;
    } catch (error) {
        console.error('❌ Error fetching lp_operations:', error);
        return [];
    }
}