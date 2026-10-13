import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Mail, Save, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface NotificationSettings {
  portalNotificationsEnabled: boolean;
  emailAlertsEnabled: boolean;
  updatedAt?: string;
}

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings>({
    portalNotificationsEnabled: true,
    emailAlertsEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch current settings
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/notification-settings', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load notification settings",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to connect to server",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (field: keyof NotificationSettings, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch('/api/notification-settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          portalNotificationsEnabled: settings.portalNotificationsEnabled,
          emailAlertsEnabled: settings.emailAlertsEnabled,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        toast({
          title: "Settings saved",
          description: "Your notification preferences have been updated",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save settings",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to connect to server",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
        <p className="text-gray-500 mt-1">Manage your notification preferences</p>
      </div>

      <Alert className="border-blue-200 bg-blue-50">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>About Notifications:</strong> You can control portal notifications and email alerts independently. 
          Portal notifications appear in-app, while email alerts are sent to your registered email address.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6">
        {/* Portal Notifications Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Portal Notifications</CardTitle>
                <CardDescription>
                  Show notifications in the application
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-4 px-4 bg-gray-50 rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="portal-notifications" className="text-base font-medium">
                  Enable Portal Notifications
                </Label>
                <p className="text-sm text-gray-600">
                  Receive in-app notifications for tasks, EOD, and updates
                </p>
              </div>
              <Switch
                id="portal-notifications"
                checked={settings.portalNotificationsEnabled}
                onCheckedChange={(checked) => handleToggle('portalNotificationsEnabled', checked)}
              />
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <p className="font-medium text-gray-700">Portal notifications include:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Task assignments and updates</li>
                <li>Daily work approvals and rejections</li>
                <li>Training record updates</li>
                <li>EOD submission reminders</li>
                <li>System announcements</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Email Alerts Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Mail className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <CardTitle>Email Alerts</CardTitle>
                <CardDescription>
                  Receive automated email notifications
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-4 px-4 bg-gray-50 rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="email-alerts" className="text-base font-medium">
                  Enable Email Alerts
                </Label>
                <p className="text-sm text-gray-600">
                  Receive automated emails for important events
                </p>
              </div>
              <Switch
                id="email-alerts"
                checked={settings.emailAlertsEnabled}
                onCheckedChange={(checked) => handleToggle('emailAlertsEnabled', checked)}
              />
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <p className="font-medium text-gray-700">Email alerts include:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Missing EOD submission alerts</li>
                <li>Overdue task notifications (WIP/YTS &gt; 5 days)</li>
                <li>Task escalation emails</li>
                <li>Leadership notifications</li>
                <li>Critical system updates</li>
              </ul>
            </div>

            {!settings.emailAlertsEnabled && (
              <Alert className="mt-4 border-orange-200 bg-orange-50">
                <Info className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  <strong>Note:</strong> With email alerts disabled, you will not receive any automated emails 
                  including EOD reminders and overdue task notifications.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Notification Behavior Table */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Behavior</CardTitle>
            <CardDescription>
              How different combinations of settings affect your notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Portal Notifications</th>
                    <th className="text-left py-3 px-4 font-medium">Email Alerts</th>
                    <th className="text-left py-3 px-4 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-3 px-4">✅ ON</td>
                    <td className="py-3 px-4">✅ ON</td>
                    <td className="py-3 px-4">🔔 Portal notifications + 📧 Emails enabled</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-4">✅ ON</td>
                    <td className="py-3 px-4">❌ OFF</td>
                    <td className="py-3 px-4">🔔 Portal notifications enabled, 📧 Emails stopped</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-4">❌ OFF</td>
                    <td className="py-3 px-4">✅ ON</td>
                    <td className="py-3 px-4">🔔 Portal notifications disabled, 📧 Emails still sent</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">❌ OFF</td>
                    <td className="py-3 px-4">❌ OFF</td>
                    <td className="py-3 px-4">🔕 Portal notifications + 📧 Emails both disabled</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          variant="outline"
          onClick={fetchSettings}
          disabled={saving}
        >
          Reset
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {settings.updatedAt && (
        <p className="text-sm text-gray-500 text-center">
          Last updated: {new Date(settings.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
