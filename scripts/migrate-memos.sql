-- 迁移 memos 表以兼容 ContentItem 接口

-- 添加 ContentItem 核心字段
ALTER TABLE memos ADD COLUMN type TEXT DEFAULT 'memo';
ALTER TABLE memos ADD COLUMN slug TEXT;
ALTER TABLE memos ADD COLUMN title TEXT;
ALTER TABLE memos ADD COLUMN excerpt TEXT;
ALTER TABLE memos ADD COLUMN last_modified INTEGER;
ALTER TABLE memos ADD COLUMN source TEXT;
ALTER TABLE memos ADD COLUMN file_path TEXT;
ALTER TABLE memos ADD COLUMN draft INTEGER DEFAULT 0;
ALTER TABLE memos ADD COLUMN public INTEGER DEFAULT 1;
ALTER TABLE memos ADD COLUMN publish_date INTEGER;
ALTER TABLE memos ADD COLUMN update_date INTEGER;
ALTER TABLE memos ADD COLUMN category TEXT;
ALTER TABLE memos ADD COLUMN author TEXT;
ALTER TABLE memos ADD COLUMN image TEXT;
ALTER TABLE memos ADD COLUMN metadata TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_memos_slug ON memos(slug);
CREATE INDEX IF NOT EXISTS idx_memos_type ON memos(type);
CREATE INDEX IF NOT EXISTS idx_memos_source ON memos(source);
CREATE INDEX IF NOT EXISTS idx_memos_public ON memos(public);
CREATE INDEX IF NOT EXISTS idx_memos_publish_date ON memos(publish_date);
CREATE INDEX IF NOT EXISTS idx_memos_last_modified ON memos(last_modified);

-- 更新现有记录
UPDATE memos SET 
  type = 'memo',
  slug = COALESCE(slug, REPLACE(REPLACE(id, '/', '-'), '.md', '')),
  source = COALESCE(data_source, 'webdav'),
  file_path = COALESCE(source_path, id),
  draft = 0,
  public = COALESCE(is_public, 1),
  publish_date = COALESCE(created_at, strftime('%s', 'now')),
  update_date = updated_at,
  last_modified = COALESCE(updated_at, created_at, strftime('%s', 'now')),
  metadata = '{}'
WHERE type IS NULL OR slug IS NULL OR source IS NULL OR file_path IS NULL OR publish_date IS NULL;

-- 确保关键字段不为空
UPDATE memos SET slug = REPLACE(REPLACE(id, '/', '-'), '.md', '') WHERE slug IS NULL OR slug = '';
UPDATE memos SET source = 'webdav' WHERE source IS NULL OR source = '';
UPDATE memos SET file_path = id WHERE file_path IS NULL OR file_path = '';
UPDATE memos SET publish_date = created_at WHERE publish_date IS NULL;
UPDATE memos SET last_modified = COALESCE(updated_at, created_at) WHERE last_modified IS NULL;
