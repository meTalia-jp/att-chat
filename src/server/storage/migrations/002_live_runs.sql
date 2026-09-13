DROP TRIGGER run_immutable;
CREATE UNIQUE INDEX one_active_run_per_conversation ON generation_runs(conversation_id)
WHERE outcome IN ('preparing','running');
CREATE TABLE chat_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
  run_id TEXT NOT NULL UNIQUE REFERENCES generation_runs(run_id)
) STRICT;
CREATE TRIGGER run_identity_immutable BEFORE UPDATE ON generation_runs
WHEN NEW.run_id IS NOT OLD.run_id OR NEW.conversation_id IS NOT OLD.conversation_id
 OR NEW.user_turn_id IS NOT OLD.user_turn_id OR NEW.assistant_turn_id IS NOT OLD.assistant_turn_id
 OR NEW.retry_of_run_id IS NOT OLD.retry_of_run_id OR NEW.kind IS NOT OLD.kind
 OR NEW.model_id IS NOT OLD.model_id OR NEW.provider IS NOT OLD.provider
 OR NEW.context_strategy IS NOT OLD.context_strategy OR NEW.strategy_version IS NOT OLD.strategy_version
 OR NEW.request_snapshot IS NOT OLD.request_snapshot OR NEW.started_at IS NOT OLD.started_at
BEGIN SELECT RAISE(ABORT,'run_identity_immutable'); END;
CREATE TRIGGER run_transition BEFORE UPDATE ON generation_runs
BEGIN
  SELECT CASE WHEN OLD.outcome NOT IN ('preparing','running') THEN RAISE(ABORT,'final_run_immutable') END;
  SELECT CASE WHEN NOT (
    (OLD.outcome='preparing' AND NEW.outcome IN ('running','failed','cancelled','interrupted')) OR
    (OLD.outcome='running' AND NEW.outcome IN ('succeeded','failed','cancelled','interrupted'))
  ) THEN RAISE(ABORT,'invalid_run_transition') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM turns WHERE turn_id=NEW.assistant_turn_id AND status=CASE
      WHEN NEW.outcome='succeeded' THEN 'completed'
      WHEN NEW.outcome='cancelled' THEN 'cancelled'
      WHEN NEW.outcome IN ('failed','interrupted') THEN 'failed'
      ELSE 'generating' END
  ) THEN RAISE(ABORT,'run_turn_state_mismatch') END;
END;
