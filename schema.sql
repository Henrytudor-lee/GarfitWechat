-- ============================================================
-- Fitness WeChat Mini Program — Database Schema
-- Target: PostgreSQL (Supabase / 腾讯云 PostgreSQL)
-- ============================================================

-- -------------------------------------------------------
-- Table 1: users
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  openid      VARCHAR(64)  UNIQUE NOT NULL,
  name        VARCHAR(64)  DEFAULT '',
  avatar      TEXT         DEFAULT '',
  role        VARCHAR(20)  DEFAULT 'user',
  status      SMALLINT     DEFAULT 1,
  created_at  TIMESTAMPT   DEFAULT NOW(),
  updated_at  TIMESTAMPT   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);

-- -------------------------------------------------------
-- Table 2: sessions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time  TIMESTAMPT  NOT NULL DEFAULT NOW(),
  end_time    TIMESTAMPT,
  duration    INTEGER     DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'running',
  is_done     SMALLINT    DEFAULT 0,
  created_at  TIMESTAMPT  DEFAULT NOW(),
  updated_at  TIMESTAMPT  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_done  ON sessions(user_id, is_done);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);

-- -------------------------------------------------------
-- Table 3: exercises
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER      NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER      NOT NULL,
  name        VARCHAR(128) NOT NULL,
  sequence    INTEGER      DEFAULT 0,
  weight      DECIMAL(8,2) DEFAULT 0,
  weight_unit VARCHAR(10)  DEFAULT 'kg',
  reps        INTEGER      DEFAULT 0,
  create_time TIMESTAMPT   DEFAULT NOW(),
  update_time TIMESTAMPT   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exercises_session_id  ON exercises(session_id);
CREATE INDEX IF NOT EXISTS idx_exercises_user_id     ON exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_exercises_exercise_id ON exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercises_create_time ON exercises(create_time);

-- -------------------------------------------------------
-- Table 4: exercises_library
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises_library (
  id              INTEGER PRIMARY KEY,
  name            VARCHAR(128) NOT NULL,      -- 英文名称
  name_zh         VARCHAR(128) DEFAULT '',    -- 中文名称（新增）
  image_name      VARCHAR(512) DEFAULT '',
  video_name      VARCHAR(255) DEFAULT '',
  video_file      VARCHAR(512) DEFAULT '',
  equipment_id    VARCHAR(64)  DEFAULT '',   -- 逗号分隔，如 '1,19'
  body_part_id    VARCHAR(64)  DEFAULT '',   -- 逗号分隔，如 '2,4'
  exercise_type   VARCHAR(32)  DEFAULT 'Strength',
  is_favorite     SMALLINT    DEFAULT 0,
  created_at      TIMESTAMPT  DEFAULT NOW(),
  updated_at      TIMESTAMPT  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_el_equipment_id ON exercises_library(equipment_id);
CREATE INDEX IF NOT EXISTS idx_el_body_part_id  ON exercises_library(body_part_id);
CREATE INDEX IF NOT EXISTS idx_el_name          ON exercises_library(name);
CREATE INDEX IF NOT EXISTS idx_el_name_zh       ON exercises_library(name_zh);

-- -------------------------------------------------------
-- Table 5: user_streaks
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak          INTEGER     DEFAULT 0,
  last_session_id INTEGER,
  last_date       DATE,
  updated_at      TIMESTAMPT  DEFAULT NOW()
);

-- -------------------------------------------------------
-- Table 6: user_levels
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_levels (
  user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level     INTEGER     DEFAULT 1,
  label     VARCHAR(32) DEFAULT 'ROOKIE',
  score     INTEGER     DEFAULT 0,
  updated_at TIMESTAMPT DEFAULT NOW()
);

-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_col()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_col();
CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_col();
CREATE TRIGGER trg_exercises_updated_at
  BEFORE UPDATE ON exercises FOR EACH ROW EXECUTE FUNCTION update_updated_at_col();
CREATE TRIGGER trg_exercises_library_updated_at
  BEFORE UPDATE ON exercises_library FOR EACH ROW EXECUTE FUNCTION update_updated_at_col();
CREATE TRIGGER trg_user_streaks_updated_at
  BEFORE UPDATE ON user_streaks FOR EACH ROW EXECUTE FUNCTION update_updated_at_col();
CREATE TRIGGER trg_user_levels_updated_at
  BEFORE UPDATE ON user_levels FOR EACH ROW EXECUTE FUNCTION update_updated_at_col();
