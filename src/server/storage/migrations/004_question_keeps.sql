CREATE TABLE question_keeps (
  keep_id TEXT PRIMARY KEY NOT NULL,
  highlight_id TEXT NOT NULL REFERENCES highlights(highlight_id) ON DELETE CASCADE,
  question_draft TEXT NOT NULL CHECK(length(question_draft)<=10000 AND instr(question_draft,char(13))=0),
  memo TEXT NOT NULL CHECK(length(memo)<=10000 AND instr(memo,char(13))=0),
  status TEXT NOT NULL CHECK(status IN ('pending','asked','dismissed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  asked_at TEXT,
  CHECK((status='asked' AND asked_at IS NOT NULL) OR (status<>'asked' AND asked_at IS NULL))
) STRICT;
CREATE INDEX question_keeps_highlight_status ON question_keeps(highlight_id,status);
CREATE TRIGGER keep_insert_validate BEFORE INSERT ON question_keeps
BEGIN
  SELECT CASE WHEN NEW.status<>'pending' OR NOT EXISTS(
    SELECT 1 FROM highlights h JOIN turns t ON t.turn_id=h.turn_id
    WHERE h.highlight_id=NEW.highlight_id AND h.status='resolved' AND t.role='assistant' AND t.status='completed'
  ) THEN RAISE(ABORT,'invalid_keep_creation') END;
END;
CREATE TRIGGER keep_update_validate BEFORE UPDATE ON question_keeps
BEGIN
  SELECT CASE WHEN NEW.keep_id IS NOT OLD.keep_id OR NEW.highlight_id IS NOT OLD.highlight_id
    OR NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT,'keep_identity_immutable') END;
  SELECT CASE WHEN NEW.updated_at<=OLD.updated_at THEN RAISE(ABORT,'keep_timestamp_not_advanced') END;
  SELECT CASE WHEN OLD.status='asked' THEN RAISE(ABORT,'asked_keep_immutable') END;
  SELECT CASE WHEN NEW.status='asked' AND OLD.status<>'pending' THEN RAISE(ABORT,'invalid_keep_transition') END;
END;
