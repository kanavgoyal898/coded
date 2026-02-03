CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT CHECK(role IN ('admin', 'setter', 'solver')) DEFAULT 'solver',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS problem (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    statement TEXT NOT NULL,
    setter_id INTEGER NOT NULL,
    deadline_at DATETIME NULL,
    time_limit_ms INTEGER NOT NULL DEFAULT 1024,
    memory_limit_kb INTEGER NOT NULL DEFAULT 262144,
    visibility TEXT CHECK(visibility IN ('public', 'private')) DEFAULT 'public',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (setter_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS testcase (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id INTEGER NOT NULL,
    input_data TEXT NOT NULL,
    output_data TEXT NOT NULL,
    weight INTEGER DEFAULT 1,
    is_sample BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (problem_id) REFERENCES problem(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submission (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    problem_id INTEGER NOT NULL,
    language TEXT CHECK(language IN ('c', 'cpp', 'python')) NOT NULL,
    source_code TEXT NOT NULL,
    status TEXT CHECK(status IN (
        'queued',
        'running',
        'accepted',
        'wrong_answer',
        'runtime_error',
        'compile_error',
        'time_limit_exceeded'
    )) DEFAULT 'queued',
    score INTEGER DEFAULT 0,
    compile_log TEXT,
    runtime_log TEXT,
    execution_time_ms INTEGER,
    memory_used_kb INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (problem_id) REFERENCES problem(id)
);

INSERT INTO user (name, email, role) VALUES ('Test User', 'test@example.com', 'admin');

PRAGMA foreign_keys = ON;
