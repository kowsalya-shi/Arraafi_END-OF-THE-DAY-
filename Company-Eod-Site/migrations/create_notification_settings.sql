-- Create notification_settings table
CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  portal_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  email_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);

-- Insert default settings for all existing users
INSERT INTO notification_settings (user_id, portal_notifications_enabled, email_alerts_enabled)
SELECT id, true, true
FROM users
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE notification_settings IS 'User notification preferences for portal notifications and email alerts';
COMMENT ON COLUMN notification_settings.portal_notifications_enabled IS 'Enable/disable in-portal notifications';
COMMENT ON COLUMN notification_settings.email_alerts_enabled IS 'Enable/disable email notifications (EOD alerts, overdue alerts, etc.)';
