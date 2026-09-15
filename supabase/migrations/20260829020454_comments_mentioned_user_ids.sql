-- @mention support on comments: mentioned_user_ids holds the profiles.id of
-- every user tagged in a comment's body via the `@[Name](userId)` token
-- syntax the CommentsSection mention picker writes. Parsed client-side at
-- insert time (see use-comments.ts) and used server-side to resolve who to
-- notify (see comment-mention-notify.ts) — kept as a real column rather than
-- re-parsing `body` on every notify call.
alter table public.comments
  add column if not exists mentioned_user_ids uuid[] not null default '{}';
