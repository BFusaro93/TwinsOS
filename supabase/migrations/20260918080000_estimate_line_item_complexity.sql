-- Complexity multiplier: an Aspire-style adjustment that scales both a line
-- item's price and its modeled cost by the same % (10000 bps = 100%, i.e. no
-- adjustment), so margin % stays constant while a "harder" job costs and
-- prices higher. Applied as the final step in computeLineItem (estimate-calc.ts).

alter table estimate_line_items
  add column if not exists complexity_bps int not null default 10000;
