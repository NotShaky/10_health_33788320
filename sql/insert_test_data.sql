USE health;

-- Insert required marking user (gold)
-- Password is bcrypt hash for 'smiths'
INSERT INTO users (username, password_hash) VALUES
('gold', '$2b$10$z0Wu0MYEIVz9Zw7TFzItdep0U/cd6GGSaTu657.l4c3GBirKe4YC2');

-- Seed achievements for the gold user
INSERT INTO achievements (user_id, title, category, metric, amount, notes)
VALUES
((SELECT id FROM users WHERE username='gold' LIMIT 1), 'Morning Run', 'Cardio', 'km', 5.00, 'Felt great'),
((SELECT id FROM users WHERE username='gold' LIMIT 1), 'Push-ups', 'Strength', 'reps', 30.00, '3 sets of 10'),
((SELECT id FROM users WHERE username='gold' LIMIT 1), 'Yoga Session', 'Flexibility', 'minutes', 45.00, 'Deep stretches');
