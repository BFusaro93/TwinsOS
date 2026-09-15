-- Lets a saved custom analysis ("My Reports") carry an optional chart shown
-- above its table/visual and embedded above it in PDF export — the same
-- "combine a saved analysis with a graphic" flow Service Autopilot offers,
-- built on top of the Graphics Library (a header_visual is usually a
-- snapshot copy of a graphic template or saved graphic, not a live
-- reference — same convention as crm_dashboards panels).

alter table crm_custom_reports
  add column if not exists header_visual jsonb,
  add column if not exists header_visual_title text;
