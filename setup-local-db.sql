-- Run this as the postgres superuser to set up the project databases.
-- Usage: psql -U postgres -f setup-local-db.sql

-- Create the application user
CREATE USER pguser WITH PASSWORD 'pgpassword';

-- Create dev database
CREATE DATABASE payment_gateway OWNER pguser;
GRANT ALL PRIVILEGES ON DATABASE payment_gateway TO pguser;

-- Create test database
CREATE DATABASE payment_gateway_test OWNER pguser;
GRANT ALL PRIVILEGES ON DATABASE payment_gateway_test TO pguser;

-- Grant schema permissions
\connect payment_gateway
GRANT ALL ON SCHEMA public TO pguser;

\connect payment_gateway_test
GRANT ALL ON SCHEMA public TO pguser;

\echo 'Databases created successfully.'
