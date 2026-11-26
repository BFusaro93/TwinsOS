-- Master Property / Sub-property tags, kept in step with the client hierarchy.
--
-- A client that has child clients carries the "Master Property" tag; a client
-- with a parent carries "Sub-property". SA needed those tagged by hand (plus an
-- automation that set a custom field from the tag, only to work around a
-- reporting quirk); here the hierarchy already says it, so the tags follow it:
-- they are added when a link is made and removed when it is broken or the
-- client is deleted. The tag names are created in the org's tag list the first
-- time they are needed, so an org that never uses parent/child never sees them.
--
-- Only changes made from now on are tagged. Existing links are not rewritten
-- (the tags are ordinary tags and can still be added or removed by hand).

CREATE OR REPLACE FUNCTION public.sync_property_tags_for_client(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_parent uuid;
  v_deleted timestamptz;
  v_has_children boolean;
BEGIN
  IF p_client_id IS NULL THEN RETURN; END IF;
  SELECT org_id, parent_client_id, deleted_at INTO v_org, v_parent, v_deleted
    FROM clients WHERE id = p_client_id;
  IF v_org IS NULL THEN RETURN; END IF;

  -- Sub-property: has a parent (and is not deleted).
  IF v_parent IS NOT NULL AND v_deleted IS NULL THEN
    INSERT INTO crm_list_options (org_id, list_name, value)
      VALUES (v_org, 'client_tags', 'Sub-property')
      ON CONFLICT (org_id, list_name, value) DO NOTHING;
    INSERT INTO client_tags (org_id, client_id, tag)
      VALUES (v_org, p_client_id, 'Sub-property')
      ON CONFLICT (org_id, client_id, tag) DO NOTHING;
  ELSE
    DELETE FROM client_tags WHERE org_id = v_org AND client_id = p_client_id AND tag = 'Sub-property';
  END IF;

  -- Master Property: has at least one live child (and is not deleted itself).
  SELECT EXISTS (
    SELECT 1 FROM clients c WHERE c.parent_client_id = p_client_id AND c.org_id = v_org AND c.deleted_at IS NULL
  ) INTO v_has_children;
  IF v_has_children AND v_deleted IS NULL THEN
    INSERT INTO crm_list_options (org_id, list_name, value)
      VALUES (v_org, 'client_tags', 'Master Property')
      ON CONFLICT (org_id, list_name, value) DO NOTHING;
    INSERT INTO client_tags (org_id, client_id, tag)
      VALUES (v_org, p_client_id, 'Master Property')
      ON CONFLICT (org_id, client_id, tag) DO NOTHING;
  ELSE
    DELETE FROM client_tags WHERE org_id = v_org AND client_id = p_client_id AND tag = 'Master Property';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_clients_sync_property_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_client_id IS NOT NULL THEN
      PERFORM public.sync_property_tags_for_client(NEW.id);
      PERFORM public.sync_property_tags_for_client(NEW.parent_client_id);
    END IF;
  ELSE
    IF NEW.parent_client_id IS DISTINCT FROM OLD.parent_client_id OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      PERFORM public.sync_property_tags_for_client(NEW.id);
      PERFORM public.sync_property_tags_for_client(NEW.parent_client_id);
      PERFORM public.sync_property_tags_for_client(OLD.parent_client_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_property_tags_for_client(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_clients_sync_property_tags() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_clients_sync_property_tags ON clients;
CREATE TRIGGER trg_clients_sync_property_tags
  AFTER INSERT OR UPDATE OF parent_client_id, deleted_at ON clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_clients_sync_property_tags();
