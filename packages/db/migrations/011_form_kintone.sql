-- 011: Add kintone integration fields to forms table
ALTER TABLE forms ADD COLUMN kintone_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE forms ADD COLUMN kintone_subdomain TEXT;
ALTER TABLE forms ADD COLUMN kintone_app_id TEXT;
ALTER TABLE forms ADD COLUMN kintone_api_token TEXT;
ALTER TABLE forms ADD COLUMN kintone_field_mapping TEXT;
