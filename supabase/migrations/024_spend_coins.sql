-- 024: atomic coin spending (prevents double-spend on concurrent gift/cashout requests).
create or replace function public.spend_coins(p_user_id uuid, p_amount integer)
returns table (new_balance integer)
language plpgsql
security definer
as $$
declare
  v_new integer;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  update public.coin_balances
  set balance = balance - p_amount,
      updated_at = now()
  where user_id = p_user_id
    and balance >= p_amount
  returning balance into v_new;
  if not found then
    raise exception 'insufficient_balance';
  end if;
  new_balance := v_new;
  return next;
end;
$$;
