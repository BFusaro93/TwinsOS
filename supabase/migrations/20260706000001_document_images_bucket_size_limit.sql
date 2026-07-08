-- Bump document-images size limit from 10MB to 20MB — phone photos routinely
-- exceed 10MB and were failing to upload with a generic error.

update storage.buckets
set file_size_limit = 20971520
where id = 'document-images';
