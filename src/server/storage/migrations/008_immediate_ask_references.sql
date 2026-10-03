CREATE TABLE run_marker_references (
  run_id TEXT NOT NULL REFERENCES generation_runs(run_id) ON DELETE RESTRICT,
  reference_no INTEGER NOT NULL CHECK(reference_no >= 0),
  source_conversation_id TEXT NOT NULL,
  source_turn_id TEXT NOT NULL,
  source_highlight_id TEXT NOT NULL,
  prefix TEXT NOT NULL CHECK(prefix IN ('質問','しかし…','意見')),
  question_text TEXT NOT NULL CHECK(length(trim(question_text)) > 0 AND length(question_text) <= 10000 AND instr(question_text,char(13))=0),
  reference_snapshot TEXT NOT NULL CHECK(json_valid(reference_snapshot) AND json_type(reference_snapshot)='object'),
  PRIMARY KEY(run_id,reference_no),
  UNIQUE(run_id,source_highlight_id)
) STRICT;

CREATE INDEX marker_runs_source_highlight ON run_marker_references(source_highlight_id);
CREATE INDEX marker_runs_source_turn ON run_marker_references(source_conversation_id,source_turn_id);

CREATE TRIGGER marker_reference_validate BEFORE INSERT ON run_marker_references
BEGIN
  SELECT CASE WHEN NEW.reference_no<>(SELECT count(*) FROM run_marker_references WHERE run_id=NEW.run_id)
    THEN RAISE(ABORT,'marker_reference_ordinal') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM run_question_references WHERE run_id=NEW.run_id)
    THEN RAISE(ABORT,'mixed_run_references') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM generation_runs r
    JOIN conversations c ON c.conversation_id=NEW.source_conversation_id
    JOIN highlights h ON h.highlight_id=NEW.source_highlight_id
    JOIN turns t ON t.turn_id=h.turn_id
    WHERE r.run_id=NEW.run_id AND r.outcome='preparing' AND r.kind='highlight_question'
      AND r.context_strategy='immediate_marker_questions' AND r.strategy_version='1'
      AND r.conversation_id=NEW.source_conversation_id
      AND h.status='resolved' AND h.turn_id=NEW.source_turn_id
      AND t.conversation_id=NEW.source_conversation_id AND t.role='assistant' AND t.status='completed'
      AND t.turn_id=(SELECT latest.turn_id FROM turns latest
        WHERE latest.conversation_id=NEW.source_conversation_id AND latest.role='assistant' AND latest.status='completed'
        ORDER BY latest.sequence_no DESC LIMIT 1)
      AND json_extract(NEW.reference_snapshot,'$.snapshot_version')=1
      AND json_extract(NEW.reference_snapshot,'$.source_conversation_id')=c.conversation_id
      AND json_extract(NEW.reference_snapshot,'$.source_conversation_title')=c.title
      AND json_extract(NEW.reference_snapshot,'$.source_turn_id')=t.turn_id
      AND json_extract(NEW.reference_snapshot,'$.source_turn_sequence_no')=t.sequence_no
      AND json_extract(NEW.reference_snapshot,'$.source_turn_role')=t.role
      AND json_extract(NEW.reference_snapshot,'$.source_highlight_id')=h.highlight_id
      AND json_extract(NEW.reference_snapshot,'$.start_offset')=h.start_offset
      AND json_extract(NEW.reference_snapshot,'$.end_offset')=h.end_offset
      AND json_extract(NEW.reference_snapshot,'$.source_text')=h.source_text
      AND json_extract(NEW.reference_snapshot,'$.target_text')=h.target_text
      AND json_extract(NEW.reference_snapshot,'$.color')=h.color
      AND json_extract(NEW.reference_snapshot,'$.prefix')=NEW.prefix
  ) THEN RAISE(ABORT,'invalid_marker_reference') END;
END;

CREATE TRIGGER marker_reference_immutable BEFORE UPDATE ON run_marker_references
BEGIN SELECT RAISE(ABORT,'marker_reference_immutable'); END;

CREATE TRIGGER marker_reference_retained BEFORE DELETE ON run_marker_references
BEGIN SELECT RAISE(ABORT,'marker_reference_retained'); END;

DROP TRIGGER question_reference_validate;
CREATE TRIGGER question_reference_validate BEFORE INSERT ON run_question_references
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM run_marker_references WHERE run_id=NEW.run_id)
    THEN RAISE(ABORT,'mixed_run_references') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM generation_runs r JOIN question_keeps k ON k.keep_id=NEW.keep_id
    JOIN highlights h ON h.highlight_id=k.highlight_id JOIN turns t ON t.turn_id=h.turn_id
    WHERE r.run_id=NEW.run_id AND r.kind='highlight_question' AND r.outcome='preparing'
      AND k.status IN ('pending','asked') AND h.status='resolved'
      AND h.highlight_id=NEW.source_highlight_id AND t.turn_id=NEW.source_turn_id
      AND t.role='assistant' AND t.status='completed'
      AND (
        (r.strategy_version='1' AND t.conversation_id=r.conversation_id) OR
        (r.strategy_version='2' AND json_extract(NEW.reference_snapshot,'$.snapshot_version')=2
         AND json_extract(NEW.reference_snapshot,'$.source_conversation_id')=t.conversation_id
         AND json_extract(NEW.reference_snapshot,'$.source_highlight_id')=h.highlight_id
         AND json_extract(NEW.reference_snapshot,'$.highlight_id')=h.highlight_id
         AND json_extract(NEW.reference_snapshot,'$.source_turn_id')=t.turn_id
         AND json_extract(NEW.reference_snapshot,'$.start_offset')=h.start_offset
         AND json_extract(NEW.reference_snapshot,'$.end_offset')=h.end_offset
         AND json_extract(NEW.reference_snapshot,'$.source_text')=h.source_text
         AND json_extract(NEW.reference_snapshot,'$.target_text')=h.target_text)
      )
  ) THEN RAISE(ABORT,'invalid_question_reference') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM run_question_references q JOIN generation_runs r ON r.run_id=q.run_id
    WHERE q.keep_id=NEW.keep_id AND r.outcome IN ('preparing','running')
  ) THEN RAISE(ABORT,'keep_question_active') END;
END;
