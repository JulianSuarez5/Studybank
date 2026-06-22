import { Pool } from 'pg';

let pool: Pool;

interface StatementMethods {
  run: (...params: any[]) => Promise<{ lastInsertRowid: number; changes: number }>;
  get: (...params: any[]) => Promise<any>;
  all: (...params: any[]) => Promise<any[]>;
}

interface DbWrapper {
  prepare: (sql: string) => StatementMethods;
  query: (sql: string, params?: any[]) => Promise<any>;
}

function prepareStmt(sql: string): StatementMethods {
  return {
    run: async (...params: any[]) => {
      // For INSERT, use RETURNING id
      const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
      const finalSql = isInsert && !sql.includes('RETURNING')
        ? sql + ' RETURNING id'
        : sql;
      const result = await pool.query(finalSql, params);
      const row = result.rows[0];
      return {
        lastInsertRowid: row?.id || 0,
        changes: result.rowCount || 0,
      };
    },
    get: async (...params: any[]) => {
      const result = await pool.query(sql, params);
      return result.rows[0] || undefined;
    },
    all: async (...params: any[]) => {
      const result = await pool.query(sql, params);
      return result.rows;
    },
  };
}

export async function initDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no configurada. Crea una base de datos en Supabase y copia la URL.');
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await pool.query('SELECT 1');
  console.log('Connected to PostgreSQL');

  await runMigrations();
}

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      content TEXT,
      status TEXT DEFAULT 'processing',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      document_id INTEGER REFERENCES documents(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      statement TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      explanation TEXT DEFAULT '',
      topic TEXT DEFAULT '',
      subtopic TEXT DEFAULT '',
      specialty TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT DEFAULT '',
      config TEXT NOT NULL,
      total_questions INTEGER NOT NULL,
      correct_answers INTEGER DEFAULT 0,
      started_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_answers (
      id SERIAL PRIMARY KEY,
      exam_attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id),
      question_id INTEGER NOT NULL REFERENCES questions(id),
      selected_answer TEXT,
      is_correct INTEGER DEFAULT 0,
      answered_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id SERIAL PRIMARY KEY,
      question_id INTEGER REFERENCES questions(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      topic TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS key_concepts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      concept TEXT NOT NULL,
      definition TEXT DEFAULT '',
      topic TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      topic TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      source_type TEXT NOT NULL,
      source_id INTEGER DEFAULT 0,
      content TEXT NOT NULL,
      vector TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS spaced_repetition (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      flashcard_id INTEGER REFERENCES flashcards(id),
      ease_factor REAL DEFAULT 2.5,
      interval_days INTEGER DEFAULT 0,
      repetitions INTEGER DEFAULT 0,
      next_review TIMESTAMP DEFAULT NOW(),
      last_quality INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS study_plans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      plan_date TEXT NOT NULL,
      content TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(user_id);
    CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);
    CREATE INDEX IF NOT EXISTS idx_questions_specialty ON questions(specialty);
    CREATE INDEX IF NOT EXISTS idx_exam_answers_attempt ON exam_answers(exam_attempt_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_user ON embeddings(user_id);
    CREATE INDEX IF NOT EXISTS idx_spaced_repetition_user ON spaced_repetition(user_id);
  `);

  try { await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'DOCUMENT'`); } catch {}
  try { await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT ''`); } catch {}
  try { await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_generated_content TEXT`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS specialty TEXT DEFAULT ''`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS subtopic TEXT DEFAULT ''`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'medio'`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT ''`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS document_id INTEGER REFERENCES documents(id)`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS last_studied TIMESTAMP`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS repetitions_count INTEGER DEFAULT 0`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS accuracy_rate REAL DEFAULT 0`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 0`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS next_review TIMESTAMP DEFAULT NOW()`); } catch {}
  try { await pool.query(`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS ease_factor REAL DEFAULT 2.5`); } catch {}

  console.log('Migrations completed');
}

export function getDb(): DbWrapper {
  return {
    prepare: (sql: string) => prepareStmt(sql),
    query: (sql: string, params?: any[]) => pool.query(sql, params),
  };
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
}
