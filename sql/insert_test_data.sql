USE health;

-- Insert required marking user (gold)
-- Password is bcrypt hash for 'smiths'
INSERT INTO users (username, password_hash) VALUES
('gold', '$2b$10$z0Wu0MYEIVz9Zw7TFzItdep0U/cd6GGSaTu657.l4c3GBirKe4YC2');