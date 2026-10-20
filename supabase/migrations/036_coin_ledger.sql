-- 036: Coin ledger.
-- Every coin movement writes one immutable row here, inside the same
-- database functions that move the balance (spend_coins and
-- credit_coins below), so the ledger can never drift from the balance
-- write itself. coin_balances stays the fast read path; this table is
-- the audit trail and the input to the reconcile cron.
--
-- Backfill: there is deliberately no fake history for movements that
-- happened before this migration. Instead, coin_ledger_baseline
-- captures each user's balance at migration time, and reconciliation
-- checks: balance = baseline + sum(ledger deltas since baseline).

CREATE TABLE IF NOT EXISTS public.coin_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  balance_after integer NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'topup_card',
    'topup_crypto',
    'topup_transfer',
    'gift_send',
    'gift_receive',
    'ppv_unlock',
    'ppv_receive',
    'cashout_request',
    'cashout_refund',
    'boost',
    'subscription_charge',
    'subscription_earning',
    'referral',
    'admin_adjust'
  )),
  ref text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency for credited movements: one row per (kind, ref) when a
-- ref is present. credit_coins checks for an existing row first and
-- this index is the hard backstop.
CREATE UNIQUE INDEX IF NOT EXISTS coin_ledger_kind_ref_uidx
  ON public.coin_ledger (kind, ref) WHERE ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS coin_ledger_user_created_idx
  ON public.coin_ledger (user_id, created_at DESC);

ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coin_ledger_select_own ON public.coin_ledger;
CREATE POLICY coin_ledger_select_own ON public.coin_ledger
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

-- Baseline snapshot for reconciliation (see header comment).
CREATE TABLE IF NOT EXISTS public.coin_ledger_baseline (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coin_ledger_baseline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coin_ledger_baseline_select ON public.coin_ledger_baseline;
CREATE POLICY coin_ledger_baseline_select ON public.coin_ledger_baseline
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

INSERT INTO public.coin_ledger_baseline (user_id, balance)
SELECT user_id, balance FROM public.coin_balances
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- spend_coins: atomic guarded spend (from migration 024), now with
-- a ledger row written in the same transaction. The old 2 argument
-- signature is dropped and replaced by one with defaults, so existing
-- 2 argument calls keep working unchanged.
-- Unknown kinds fall back to 'admin_adjust' so a caller typo can
-- never fail a spend or violate the kind check constraint.
-- ============================================================
DROP FUNCTION IF EXISTS public.spend_coins(uuid, integer);

CREATE OR REPLACE FUNCTION public.spend_coins(
  p_user_id uuid,
  p_amount integer,
  p_kind text DEFAULT 'spend',
  p_ref text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'
)
RETURNS TABLE (new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
  v_kind text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  v_kind := CASE WHEN p_kind IN (
    'topup_card',
    'topup_crypto',
    'topup_transfer',
    'gift_send',
    'gift_receive',
    'ppv_unlock',
    'ppv_receive',
    'cashout_request',
    'cashout_refund',
    'boost',
    'subscription_charge',
    'subscription_earning',
    'referral',
    'admin_adjust'
  ) THEN p_kind ELSE 'admin_adjust' END;

  UPDATE public.coin_balances
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance >= p_amount
  RETURNING balance INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  INSERT INTO public.coin_ledger (user_id, delta, balance_after, kind, ref, meta)
  VALUES (p_user_id, -p_amount, v_new, v_kind, p_ref, COALESCE(p_meta, '{}'::jsonb));

  new_balance := v_new;
  RETURN NEXT;
END;
$$;

-- ============================================================
-- credit_coins: atomic credit with a ledger row. Idempotent when
-- p_ref is present: if a ledger row with the same (kind, ref)
-- already exists, the current balance is returned and nothing is
-- credited again.
-- ============================================================
CREATE OR REPLACE FUNCTION public.credit_coins(
  p_user_id uuid,
  p_amount integer,
  p_kind text,
  p_ref text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'
)
RETURNS TABLE (new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
  v_kind text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  v_kind := CASE WHEN p_kind IN (
    'topup_card',
    'topup_crypto',
    'topup_transfer',
    'gift_send',
    'gift_receive',
    'ppv_unlock',
    'ppv_receive',
    'cashout_request',
    'cashout_refund',
    'boost',
    'subscription_charge',
    'subscription_earning',
    'referral',
    'admin_adjust'
  ) THEN p_kind ELSE 'admin_adjust' END;

  IF p_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.coin_ledger WHERE kind = v_kind AND ref = p_ref
  ) THEN
    SELECT balance INTO v_new FROM public.coin_balances WHERE user_id = p_user_id;
    new_balance := COALESCE(v_new, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.coin_balances (user_id, balance, updated_at)
  VALUES (p_user_id, p_amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.coin_balances.balance + EXCLUDED.balance,
        updated_at = now()
  RETURNING balance INTO v_new;

  INSERT INTO public.coin_ledger (user_id, delta, balance_after, kind, ref, meta)
  VALUES (p_user_id, p_amount, v_new, v_kind, p_ref, COALESCE(p_meta, '{}'::jsonb));

  new_balance := v_new;
  RETURN NEXT;
END;
$$;
