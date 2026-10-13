import { useState } from "react";
import { format, subDays } from "date-fns";
import {
  useSendReminder, useSendEscalation, useListTeams, getListTeamsQueryKey,
  useListPendingEod, getListPendingEodQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, AlertTriangle, Mail, Users } from "lucide-react";
import { PortalNotifications } from "@/components/portal-notifications";
import { Link } from "wouter";
import { AttendanceBadge } from "@/components/ui/status-badge";

export default function HRNotifications() {
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const pendingDate = format(new Date().getHours() >= 21 ? new Date() : subDays(new Date(), 1), "yyyy-MM-dd");
  const [targetTeam, setTargetTeam] = useState<string>("all");

  const { data: teams } = useListTeams({ query: { queryKey: getListTeamsQueryKey() } });
  
  // Get unique team leaders
  const uniqueTeamLeaders = teams?.filter((team, index, self) => 
    team.tlName && index === self.findIndex(t => t.tlName === team.tlName)
  ) || [];
  
  const { data: pendingList, isLoading: pendingLoading } = useListPendingEod(
    { date: pendingDate, teamId: targetTeam !== "all" ? parseInt(targetTeam) : undefined },
    {
      query: {
        queryKey: getListPendingEodQueryKey({
          date: pendingDate,
          teamId: targetTeam !== "all" ? parseInt(targetTeam) : undefined,
        }),
      },
    },
  );

  const reminderMutation = useSendReminder();
  const escalationMutation = useSendEscalation();

  const handleRemind = () => {
    reminderMutation.mutate(
      { data: { date: pendingDate, teamId: targetTeam === "all" ? null : parseInt(targetTeam) } },
      {
        onSuccess: res => {
          toast({
            title: "Reminders Sent",
            description: `Sent ${res.sent} reminders${res.failed > 0 ? ` (${res.failed} failed)` : ""}.`,
          });
        },
      },
    );
  };

  const handleEscalate = () => {
    escalationMutation.mutate(
      { data: { date: pendingDate, teamId: targetTeam === "all" ? null : parseInt(targetTeam) } },
      {
        onSuccess: res => {
          toast({
            title: "Escalations Sent",
            description: `Sent ${res.sent} escalations to Employee + TL + Manager${res.failed > 0 ? ` (${res.failed} failed)` : ""}.`,
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
            CEO Portal
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <Link href="/ceo/notification-settings" className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
            Email Alert Settings
          </Link>
        </div>
        <p className="text-gray-500 mt-1">
          Employees can submit EOD until 9:00 PM. Portal escalation begins after the deadline.
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-violet-600" /> Manual Triggers
            </CardTitle>
            <CardDescription>
              Optional email reminders for pending EODs &mdash; {pendingDate}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Team</label>
              <Select value={targetTeam} onValueChange={setTargetTeam}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams (Company-wide)</SelectItem>
                  {uniqueTeamLeaders.map(t => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.tlName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t">
              <Button
                variant="outline"
                className="h-24 flex flex-col items-center justify-center gap-2 border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800"
                onClick={handleRemind}
                disabled={reminderMutation.isPending}
              >
                <Bell className="h-6 w-6" />
                <span className="text-sm font-medium">Send Reminder</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex flex-col items-center justify-center gap-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-800"
                onClick={handleEscalate}
                disabled={escalationMutation.isPending}
              >
                <AlertTriangle className="h-6 w-6" />
                <span className="text-sm font-medium">Escalate to Manager</span>
              </Button>
            </div>

            <div className="bg-violet-50 border border-violet-200 rounded-md p-3">
              <p className="text-xs font-semibold text-violet-700 mb-1">Automated Schedule</p>
              <ul className="text-xs text-violet-600 space-y-1">
                <li><strong>8:00 AM to 9:00 PM</strong> — EOD submission remains open</li>
                <li><strong>9:00 PM</strong> — Missing EOD alert and email to the TL, Manager, CEO, and IT Manager</li>
                <li><strong>Third consecutive missed day</strong> — Escalation alert for all of the same recipients</li>
              </ul>
              <p className="text-xs text-violet-500 mt-2">Portal alerts are visible in the alert panel below.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-violet-600" /> Pending EOD
            </CardTitle>
            <CardDescription>
              Employees who have not submitted EOD for {pendingDate}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />
                ))}
              </div>
            ) : pendingList && pendingList.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {pendingList.map(emp => (
                  <div key={emp.userId} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-md">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{emp.userName}</p>
                      <p className="text-xs text-gray-500">{emp.email}</p>
                    </div>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                  <Bell className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-sm font-medium text-gray-900">All caught up!</p>
                <p className="text-xs text-gray-500">No pending EODs for {pendingDate}.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PortalNotifications />
    </div>
  );
}

