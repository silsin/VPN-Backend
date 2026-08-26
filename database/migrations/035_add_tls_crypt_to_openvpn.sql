-- Add tls-crypt support to openvpn_servers
-- For auth-user-pass configs that use tls-crypt instead of client certs

ALTER TABLE openvpn_servers 
ADD COLUMN tls_crypt LONGTEXT AFTER client_key;

ALTER TABLE openvpn_servers 
ADD COLUMN auth_type ENUM('certificate', 'user-pass') DEFAULT 'certificate' AFTER tls_crypt;

-- Add index for auth_type for filtering
CREATE INDEX idx_auth_type ON openvpn_servers(auth_type);
