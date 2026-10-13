import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Mail, Save, AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CEONotificationSettingsPage() {
  const { toast } = useToast();
  const [globalEmailEnabled, setGlobalEmailEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch current global email setting
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/system-settings/global-email', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGlobalEmailEnabled(data.globalEmailEnabled);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load email settings",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Unable to connect to server",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/system-settings/global-email', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ globalEmailEnabled }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: globalEmailEnabled 
            ? "Email system enabled for all users"
            : "Email system disabled for all users",
        });
      } else {
        const error = await response.json();
        toast({
          variant: "destructive",
          title: "Error",
          description: error.error || "Failed to update settings",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Unable to connect to server",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchSettings();
    toast({
      title: "Reset",
      description: "Settings reset to saved values",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Email Settings</h1>
        <p className="text-muted-foreground mt-2">
          Control email notifications for the entire organization
        </p>
      </div>

      <Alert className="border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-900">
          <strong>CEO Control:</strong> This setting affects all users in the system. When disabled, 
          NO emails will be sent to anyone regardless of their individual preferences.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Global Email System
          </CardTitle>
          <CardDescription>
            Master switch for all email notifications in the system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="global-email" className="text-base font-medium">
                Email System Status
              </Label>
              <p className="text-sm text-muted-foreground">
                {globalEmailEnabled 
                  ? "All email notifications are enabled system-wide"
                  : "All email notifications are disabled system-wide"}
              </p>
            </div>
            <Switch
              id="global-email"
              checked={globalEmailEnabled}
              onCheckedChange={setGlobalEmailEnabled}
              className="ml-4"
            />
          </div>

          <div className="rounded-lg border p-4 bg-muted/50">
            <h3 className="font-semibold mb-3">How This Works</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span><strong>ON:</strong> Email notifications work normally based on individual user settings</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span><strong>OFF:</strong> No emails sent to anyone (EOD reminders, alerts, escalations, etc.)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Portal notifications continue to work regardless of this setting</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Useful for: System maintenance, holidays, or preventing email floods</span>
              </li>
            </ul>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={saving}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Changes take effect immediately. All subsequent email operations will check this setting first.
        </AlertDescription>
      </Alert>
    </div>
  );
}
