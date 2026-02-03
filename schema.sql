CREATE TABLE user (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role ENUM('admin','setter','solver') DEFAULT 'solver',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE problem (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(256) NOT NULL,
    slug VARCHAR(256) UNIQUE NOT NULL,
    statement LONGTEXT NOT NULL,

    setter_id INT NOT NULL,
    deadline_at DATETIME NULL,

    time_limit_ms INT NOT NULL DEFAULT 1024,
    memory_limit_kb INT NOT NULL DEFAULT 262144,

    visibility ENUM('public','private') DEFAULT 'public',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (setter_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE testcase (
    id INT AUTO_INCREMENT PRIMARY KEY,
    problem_id INT NOT NULL,

    input_data LONGTEXT NOT NULL,
    output_data LONGTEXT NOT NULL,

    weight INT DEFAULT 1,
    is_sample BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (problem_id) REFERENCES problem(id) ON DELETE CASCADE
);

CREATE TABLE submission (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,
    problem_id INT NOT NULL,

    language ENUM('c','cpp','python') NOT NULL,
    source_code LONGTEXT NOT NULL,

    status ENUM(
        'queued',
        'running',
        'accepted',
        'wrong_answer',
        'runtime_error',
        'compile_error',
        'time_limit_exceeded'
    ) DEFAULT 'queued',

    score INT DEFAULT 0,

    compile_log TEXT,
    runtime_log TEXT,

    execution_time_ms INT,
    memory_used_kb INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,

    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (problem_id) REFERENCES problem(id)
);

CREATE TABLE problem_permission (
    problem_id INT,
    user_id INT,

    PRIMARY KEY (problem_id, user_id),

    FOREIGN KEY (problem_id) REFERENCES problem(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
