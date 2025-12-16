require('dotenv').config();
const { pool } = require('./database');

const migrationSQL = `
-- Drop tables if they exist (for development reset)
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS violations CASCADE;
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS student_sessions CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table (students + admins)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'ADMIN')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exams table
CREATE TABLE exams (
    id SERIAL PRIMARY KEY,
    exam_code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    max_violations INTEGER DEFAULT 3,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    is_active BOOLEAN DEFAULT FALSE,
    shuffle_questions BOOLEAN DEFAULT TRUE,
    shuffle_options BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Questions table
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) DEFAULT 'MCQ' CHECK (question_type IN ('MCQ', 'TRUE_FALSE', 'SHORT_ANSWER')),
    options JSONB,
    correct_answer TEXT,
    marks INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student Sessions table
CREATE TABLE student_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    exam_id INTEGER REFERENCES exams(id),
    question_order JSONB,
    option_orders JSONB,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    time_remaining_seconds INTEGER,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUBMITTED', 'DISQUALIFIED', 'EXPIRED', 'DISCONNECTED')),
    violation_count INTEGER DEFAULT 0,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Answers table
CREATE TABLE answers (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES student_sessions(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
    selected_answer TEXT,
    is_correct BOOLEAN,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, question_id)
);

-- Violations (append-only log)
CREATE TABLE violations (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES student_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Submissions table
CREATE TABLE submissions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES student_sessions(id) ON DELETE CASCADE UNIQUE,
    total_questions INTEGER,
    answered_questions INTEGER,
    correct_answers INTEGER,
    score DECIMAL(5,2),
    max_score INTEGER,
    percentage DECIMAL(5,2),
    submission_type VARCHAR(20) CHECK (submission_type IN ('MANUAL', 'AUTO_TIME', 'AUTO_VIOLATION', 'FORCE_SUBMIT')),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_student_id ON users(student_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_exams_code ON exams(exam_code);
CREATE INDEX idx_exams_active ON exams(is_active);
CREATE INDEX idx_sessions_user ON student_sessions(user_id);
CREATE INDEX idx_sessions_exam ON student_sessions(exam_id);
CREATE INDEX idx_sessions_status ON student_sessions(status);
CREATE INDEX idx_violations_session ON violations(session_id);
CREATE INDEX idx_violations_timestamp ON violations(timestamp);
CREATE INDEX idx_answers_session ON answers(session_id);

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON student_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

async function migrate() {
    try {
        console.log('Running database migrations...');
        await pool.query(migrationSQL);
        console.log('✓ Database migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
