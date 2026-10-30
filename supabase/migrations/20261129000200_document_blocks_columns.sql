-- Allow the 'columns' block type (content stored as JSON in the existing text column).
alter table crm_document_blocks drop constraint if exists crm_document_blocks_block_type_check;
alter table crm_document_blocks add constraint crm_document_blocks_block_type_check
  check (block_type in ('header','paragraph','list','divider','spacer','line_items','signature','image','button','columns'));
