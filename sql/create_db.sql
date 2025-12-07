-- Drop and create database
DROP DATABASE IF EXISTS health;
CREATE DATABASE health CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE health;

-- Users table for login (create first so FKs can reference it)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Achievements table, linked to users
CREATE TABLE achievements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  metric VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_achievements_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit logs for site-wide activity
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  details TEXT NULL,
  ip VARCHAR(64) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Period logs for period tracker
CREATE TABLE IF NOT EXISTS period_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  start_date DATE NOT NULL,
  cycle_length INT NOT NULL DEFAULT 28,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_period_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Medications (simple tracker)
CREATE TABLE IF NOT EXISTS medications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  dosage VARCHAR(100) NULL,
  interval_hours INT NOT NULL, -- how often to take, in hours
  freq_type ENUM('interval','daily','weekly') NOT NULL DEFAULT 'interval',
  time_of_day VARCHAR(5) NULL, -- HH:MM for daily/weekly
  days_of_week VARCHAR(50) NULL, -- comma-separated days e.g., Mon,Tue for weekly
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_med_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
