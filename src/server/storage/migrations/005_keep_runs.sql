-- Historical IDs deliberately have no FK to deletable Keeps/Highlights.
CREATE TABLE run_question_references (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES generation_runs(run_id),
  keep_id TEXT NOT NULL,
  source_highlight_id TEXT NOT NULL,
  source_turn_id TEXT NOT NULL,
  user_question TEXT NOT NULL CHECK(length(trim(user_question)) > 0),
  reference_snapshot TEXT NOT NULL CHECK(json_valid(reference_snapshot) AND json_type(reference_snapshot)='object')
) STRICT;
CREATE INDEX question_runs_keep ON run_question_references(keep_id);
CREATE TRIGGER question_reference_validate BEFORE INSERT ON run_question_references
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM generation_runs r JOIN question_keeps k ON k.keep_id=NEW.keep_id
    JOIN highlights h ON h.highlight_id=k.highlight_id JOIN turns t ON t.turn_id=h.turn_id
    WHERE r.run_id=NEW.run_id AND r.kind='highlight_question' AND r.outcome='preparing'
      AND k.status IN ('pending','asked') AND h.status='resolved'
      AND h.highlight_id=NEW.source_highlight_id AND t.turn_id=NEW.source_turn_id
      AND t.conversation_id=r.conversation_id AND t.role='assistant' AND t.status='completed'
  ) THEN RAISE(ABORT,'invalid_question_reference') END;
END;
CREATE TRIGGER question_reference_immutable BEFORE UPDATE ON run_question_references
BEGIN SELECT RAISE(ABORT,'question_reference_immutable'); END;
CREATE TRIGGER question_reference_retained BEFORE DELETE ON run_question_references
BEGIN SELECT RAISE(ABORT,'question_reference_retained'); END;
