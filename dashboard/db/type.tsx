export type LpStrategySnapshotParams = {
  query_time: Date | string;
  pair_name?: string;
  pool_address: string;
  pool_name: string;
  position_token_id: number;
  position_create_time?: Date | string;
  position_duration_h?: number;
  base_price_usd?: number;
  quote_price_usd?: number;
  base_token_address?: string;
  quote_token_address?: string;
  base_token_location?: string;

  total_add_base_amount?: number;
  total_add_quote_amount?: number;
  total_add_base_value_usd?: number;
  total_add_quote_value_usd?: number;
  total_add_value_usd?: number;

  total_remove_base_amount?: number;
  total_remove_quote_amount?: number;
  total_remove_base_value_usd?: number;
  total_remove_quote_value_usd?: number;
  total_remove_value_usd?: number;

  total_fee_claim_base_amount?: number;
  total_fee_claim_quote_amount?: number;
  total_fee_claim_base_value_usd?: number;
  total_fee_claim_quote_value_usd?: number;
  total_fee_claim_value_usd?: number;

  unclaimed_fee_base_amount?: number;
  unclaimed_fee_quote_amount?: number;
  unclaimed_fee_base_value_usd?: number;
  unclaimed_fee_quote_value_usd?: number;
  unclaimed_fee_value_usd?: number;

  current_base_amount?: number;
  current_quote_amount?: number;
  current_position_value_usd?: number;

  pnl_total_usd?: number;
  pnl_total_percentage?: number;

  is_active?: number;
  block_number?: number;
  end_block_number?: number;
};

export type LpOperationParams = {
  op_time: Date | string;
  op_type: string;
  pool_address: string;
  position_token_id: number;
  base_token_address: string;
  quote_token_address: string;
  base_decimals?: number;
  quote_decimals?: number;
  base_amount?: number;
  base_price_usd?: number;
  quote_amount?: number;
  quote_price_usd?: number;
  liquidity?: string;
  tx_hash: string;
  block_number: number;
};