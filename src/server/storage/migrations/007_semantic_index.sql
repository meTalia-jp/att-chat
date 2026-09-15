CREATE TABLE embedding_spaces (
  space_id TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  spec_version INTEGER NOT NULL CHECK(spec_version = 1),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK(dimensions > 0),
  spec_json TEXT NOT NULL CHECK(json_valid(spec_json)),
  created_at INTEGER NOT NULL
) STRICT;
CREATE TRIGGER embedding_spaces_immutable BEFORE UPDATE ON embedding_spaces
BEGIN SELECT RAISE(ABORT, 'embedding_space_immutable'); END;

CREATE TABLE turn_embeddings (
  turn_id TEXT NOT NULL REFERENCES turns(turn_id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES embedding_spaces(space_id),
  source_hash TEXT NOT NULL CHECK(length(source_hash) = 64),
  input_hash TEXT NOT NULL CHECK(length(input_hash) = 64),
  vector BLOB,
  status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','stale')),
  input_tokens INTEGER CHECK(input_tokens >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(turn_id, space_id),
  CHECK((lease_token IS NULL AND lease_until IS NULL) OR
        (lease_token IS NOT NULL AND lease_until IS NOT NULL AND status = 'pending')),
  CHECK((status = 'ready' AND vector IS NOT NULL AND input_tokens IS NOT NULL AND error_code IS NULL) OR
        (status <> 'ready' AND vector IS NULL))
) STRICT;
CREATE INDEX semantic_pending ON turn_embeddings(space_id,status,next_attempt_at,lease_until);
CREATE TRIGGER embedding_insert_guard BEFORE INSERT ON turn_embeddings
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM turns WHERE turn_id=NEW.turn_id AND status='completed' AND role IN ('user','assistant'))
    THEN RAISE(ABORT,'embedding_requires_completed_turn') END;
  SELECT CASE WHEN NEW.status='ready' AND length(NEW.vector) <> (SELECT dimensions*4 FROM embedding_spaces WHERE space_id=NEW.space_id)
    THEN RAISE(ABORT,'embedding_dimensions') END;
END;
CREATE TRIGGER embedding_update_guard BEFORE UPDATE ON turn_embeddings
BEGIN
  SELECT CASE WHEN NEW.turn_id <> OLD.turn_id OR NEW.space_id <> OLD.space_id
    THEN RAISE(ABORT,'embedding_identity_immutable') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM turns WHERE turn_id=NEW.turn_id AND status='completed' AND role IN ('user','assistant'))
    THEN RAISE(ABORT,'embedding_requires_completed_turn') END;
  SELECT CASE WHEN NEW.status='ready' AND length(NEW.vector) <> (SELECT dimensions*4 FROM embedding_spaces WHERE space_id=NEW.space_id)
    THEN RAISE(ABORT,'embedding_dimensions') END;
END;
