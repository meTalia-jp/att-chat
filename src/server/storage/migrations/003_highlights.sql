CREATE TABLE highlights (
  highlight_id TEXT PRIMARY KEY NOT NULL,
  turn_id TEXT NOT NULL REFERENCES turns(turn_id),
  start_offset INTEGER NOT NULL CHECK(start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK(end_offset > start_offset),
  source_text TEXT NOT NULL CHECK(length(source_text) > 0 AND instr(source_text, char(13)) = 0),
  target_text TEXT NOT NULL CHECK(length(trim(target_text)) > 0),
  color TEXT NOT NULL CHECK(color IN ('yellow','red','green','blue')),
  note TEXT NOT NULL CHECK(length(note) <= 10000 AND instr(note, char(13)) = 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('resolved','unresolved')),
  reason TEXT,
  CHECK((status='resolved' AND reason IS NULL) OR (status='unresolved' AND length(reason) > 0))
) STRICT;
CREATE INDEX highlights_turn_range ON highlights(turn_id, start_offset, end_offset);
CREATE TRIGGER highlight_insert_validate BEFORE INSERT ON highlights
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM turns WHERE turn_id=NEW.turn_id AND role='assistant' AND status='completed'
  ) THEN RAISE(ABORT,'invalid_highlight_turn') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM highlights h WHERE h.turn_id=NEW.turn_id AND h.status='resolved'
      AND h.start_offset < NEW.end_offset AND NEW.start_offset < h.end_offset
  ) THEN RAISE(ABORT,'overlapping_highlight') END;
END;
CREATE TRIGGER highlight_anchor_immutable BEFORE UPDATE ON highlights
WHEN NEW.highlight_id IS NOT OLD.highlight_id OR NEW.turn_id IS NOT OLD.turn_id
 OR NEW.start_offset IS NOT OLD.start_offset OR NEW.end_offset IS NOT OLD.end_offset
 OR NEW.source_text IS NOT OLD.source_text OR NEW.target_text IS NOT OLD.target_text
 OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT,'highlight_anchor_immutable'); END;
CREATE TRIGGER highlight_update_validate BEFORE UPDATE ON highlights
BEGIN
  SELECT CASE WHEN NEW.updated_at <= OLD.updated_at THEN RAISE(ABORT,'highlight_updated_at_not_advanced') END;
END;
