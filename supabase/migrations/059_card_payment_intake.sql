-- Intima migration 059: carry the booking details on the card payment.
--
-- On the Paystack rail the client leaves the app to pay, and the
-- callback page must open the connection when they return. The
-- screening answers and the service pick used to ride across that
-- redirect in sessionStorage, which silently loses them when the
-- return lands in a different tab or app context: the payment is
-- confirmed, POST /api/connections refuses for missing answers,
-- and the client is stranded with money taken and no connection.
-- Store both on the card_payments row at initialize time instead,
-- so the verify endpoint can hand them back as server-side truth.
alter table public.card_payments
  add column if not exists intake_answers jsonb,
  add column if not exists service_type text;
