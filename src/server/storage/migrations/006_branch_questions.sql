-- Preserve all existing rows and immutable snapshots. v1 stays same-conversation.
DROP TRIGGER question_reference_validate;
CREATE TRIGGER question_reference_validate BEFORE INSERT ON run_question_references
BEGIN
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
