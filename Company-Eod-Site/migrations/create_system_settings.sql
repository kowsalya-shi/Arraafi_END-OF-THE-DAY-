-- Create system_settings table for global controls
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default global email setting (enabled by default)
INSERT INTO system_settings (setting_key, setting_value) 
VALUES ('global_email_enabled', 'true')
ON CONFLICT (setting_key) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

COMMENT ON TABLE system_settings IS 'System-wide settings controlled by CEO';
COMMENT ON COLUMN system_settings.setting_key IS 'Unique identifier for the setting';
COMMENT ON COLUMN system_settings.setting_value IS 'JSON or string value of the setting';
COMMENT ON COLUMN system_settings.updated_by IS 'User ID who last updated this setting';
