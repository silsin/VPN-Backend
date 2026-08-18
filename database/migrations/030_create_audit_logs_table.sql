-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(255) NOT NULL,
  user_id UUID,
  admin_id UUID,
  resource VARCHAR(255) NOT NULL,
  resource_id UUID,
  changes JSONB,
  reason VARCHAR(500),
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX idx_audit_logs_user_id_created ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_logs_admin_id_created ON audit_logs(admin_id, created_at);
CREATE INDEX idx_audit_logs_action_created ON audit_logs(action, created_at);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
