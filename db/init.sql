CREATE DATABASE IF NOT EXISTS appdb;
USE appdb;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- default user with password
INSERT INTO users (username, password, email)
SELECT 'almog', 'Aa123456', 'almog.levinshtein@gmail.com'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'almog');
