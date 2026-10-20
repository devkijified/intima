/**
 * Coin ledger kinds. The source of truth is the database: every
 * balance movement goes through the SQL functions spend_coins and
 * credit_coins (migration 036), which write the coin_ledger row in
 * the same transaction as the balance change. Call those via
 * supabase.rpc instead of writing coin_balances directly.
 */
export type CoinLedgerKind =
  | 'topup_card'
  | 'topup_crypto'
  | 'topup_transfer'
  | 'gift_send'
  | 'gift_receive'
  | 'ppv_unlock'
  | 'ppv_receive'
  | 'cashout_request'
  | 'cashout_refund'
  | 'boost'
  | 'subscription_charge'
  | 'subscription_earning'
  | 'referral'
  | 'admin_adjust';
