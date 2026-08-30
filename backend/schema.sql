CREATE DATABASE IF NOT EXISTS eduos_cbt_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE eduos_cbt_dev;

CREATE TABLE IF NOT EXISTS students (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  nis        VARCHAR(50)  NOT NULL UNIQUE,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_nis (nis)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS exams (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_code        VARCHAR(50)  NOT NULL UNIQUE,
  title            VARCHAR(255) NOT NULL,
  duration_minutes INT UNSIGNED  NOT NULL DEFAULT 30,
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exams_code (exam_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS questions (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_id        INT UNSIGNED  NOT NULL,
  question_text  TEXT          NOT NULL,
  options        JSON          NOT NULL,
  correct_option CHAR(1)       NOT NULL,
  created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_questions_exam (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS exam_sessions (
  id           INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  student_id   INT UNSIGNED     NOT NULL,
  exam_id      INT UNSIGNED     NOT NULL,
  session_uuid CHAR(36)         NOT NULL UNIQUE,
  status       ENUM("answering","finalizing","done") DEFAULT "answering",
  started_at   DATETIME         NOT NULL,
  submitted_at DATETIME         NULL,
  created_at   TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (exam_id)      REFERENCES exams(id)     ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_sessions_student (student_id),
  INDEX idx_sessions_exam    (exam_id),
  INDEX idx_sessions_uuid     (session_uuid),
  UNIQUE KEY uk_student_exam (student_id, exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS answers (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_session_id  INT UNSIGNED  NOT NULL,
  question_id      INT UNSIGNED  NOT NULL,
  selected_option  CHAR(1)       NOT NULL,
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (question_id)     REFERENCES questions(id)     ON DELETE RESTRICT ON UPDATE CASCADE,
  UNIQUE KEY uk_session_question (exam_session_id, question_id),
  INDEX idx_answers_session (exam_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO students (name, nis) VALUES ("Raffa Hitipeuw", "2024001");
INSERT INTO exams (exam_code, title, duration_minutes) VALUES ("MTK-101", "Ujian Matematika Dasar", 30);
INSERT INTO questions (id, exam_id, question_text, options, correct_option) VALUES
  (1, 1, "Berapakah hasil dari 12 x 8?",      '[{"key":"A","text":"86"},{"key":"B","text":"96"},{"key":"C","text":"106"},{"key":"D","text":"116"}]', "B"),
  (2, 1, "Manakah dari berikut ini yang merupakan bilangan prima?", '[{"key":"A","text":"21"},{"key":"B","text":"27"},{"key":"C","text":"29"},{"key":"D","text":"33"}]', "C"),
  (3, 1, "Jika x + 7 = 15, maka nilai x adalah...", '[{"key":"A","text":"6"},{"key":"B","text":"7"},{"key":"C","text":"8"},{"key":"D","text":"9"}]', "C"),
  (4, 1, "Luas persegi panjang dengan panjang 9 cm dan lebar 4 cm adalah...", '[{"key":"A","text":"13 cm²"},{"key":"B","text":"26 cm²"},{"key":"C","text":"36 cm²"},{"key":"D","text":"40 cm²"}]', "C"),
  (5, 1, "Hasil dari 3/4 + 1/4 adalah...", '[{"key":"A","text":"1/2"},{"key":"B","text":"1"},{"key":"C","text":"4/8"},{"key":"D","text":"3/8"}]', "B");
