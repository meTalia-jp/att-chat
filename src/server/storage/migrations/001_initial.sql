CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE turns (
  turn_id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
  sequence_no INTEGER NOT NULL CHECK(sequence_no >= 0),
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL CHECK(instr(content, char(13)) = 0),
  status TEXT NOT NULL CHECK(status IN ('completed','generating','cancelled','failed')),
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  UNIQUE(conversation_id, sequence_no),
  UNIQUE(turn_id, conversation_id),
  CHECK((status = 'generating' AND finalized_at IS NULL) OR (status <> 'generating' AND finalized_at IS NOT NULL))
) STRICT;

CREATE TRIGGER turns_final_immutable BEFORE UPDATE ON turns
WHEN OLD.status <> 'generating'
BEGIN SELECT RAISE(ABORT, 'finalized_turn_immutable'); END;
CREATE TRIGGER turns_identity_immutable BEFORE UPDATE ON turns
WHEN NEW.turn_id <> OLD.turn_id OR NEW.conversation_id <> OLD.conversation_id
 OR NEW.sequence_no <> OLD.sequence_no OR NEW.role <> OLD.role OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT, 'turn_identity_immutable'); END;

CREATE TABLE generation_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
  user_turn_id TEXT NOT NULL,
  assistant_turn_id TEXT NOT NULL UNIQUE,
  retry_of_run_id TEXT REFERENCES generation_runs(run_id),
  kind TEXT NOT NULL CHECK(kind IN ('mock','chat','highlight_question')),
  model_id TEXT,
  provider TEXT NOT NULL,
  context_strategy TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  request_snapshot TEXT NOT NULL CHECK(json_valid(request_snapshot) AND json_type(request_snapshot) = 'object'),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('preparing','running','succeeded','failed','cancelled','interrupted')),
  error TEXT CHECK(error IS NULL OR (json_valid(error) AND json_type(error) = 'object')),
  FOREIGN KEY(user_turn_id, conversation_id) REFERENCES turns(turn_id, conversation_id),
  FOREIGN KEY(assistant_turn_id, conversation_id) REFERENCES turns(turn_id, conversation_id),
  CHECK((outcome IN ('preparing','running') AND finished_at IS NULL) OR (outcome NOT IN ('preparing','running') AND finished_at IS NOT NULL)),
  CHECK(outcome <> 'succeeded' OR error IS NULL),
  CHECK(outcome <> 'failed' OR error IS NOT NULL)
) STRICT;
CREATE INDEX runs_conversation ON generation_runs(conversation_id, started_at);
CREATE TRIGGER run_validate BEFORE INSERT ON generation_runs
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM turns WHERE turn_id=NEW.user_turn_id AND role='user' AND status='completed') THEN RAISE(ABORT,'invalid_user_turn') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM turns WHERE turn_id=NEW.assistant_turn_id AND role='assistant') THEN RAISE(ABORT,'invalid_assistant_turn') END;
  SELECT CASE WHEN NEW.outcome='succeeded' AND NOT EXISTS(SELECT 1 FROM turns WHERE turn_id=NEW.assistant_turn_id AND status='completed') THEN RAISE(ABORT,'assistant_not_completed') END;
  SELECT CASE WHEN NEW.retry_of_run_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM generation_runs WHERE run_id=NEW.retry_of_run_id AND conversation_id=NEW.conversation_id AND user_turn_id=NEW.user_turn_id) THEN RAISE(ABORT,'invalid_retry_reference') END;
END;
-- Phase 1A stores finished mock runs only; no run update workflow is exposed.
CREATE TRIGGER run_immutable BEFORE UPDATE ON generation_runs
BEGIN SELECT RAISE(ABORT,'run_immutable_phase1a'); END;
