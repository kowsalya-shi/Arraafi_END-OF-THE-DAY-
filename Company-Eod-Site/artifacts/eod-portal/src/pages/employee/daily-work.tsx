import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { 
  useListDailyWork, 
  getListDailyWorkQueryKey, 
  useCreateDailyWork, 
  useUpdateDailyWork,
  useDeleteDailyWork,
  getListTasksQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { exportToCsv } from "@/lib/export-csv";
import { parseCsvFile, downloadCsvTemplate } from "@/lib/import-csv";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Plus, Edit2, Trash2, Filter, Copy, Upload, FileDown } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ImportDialog } from "@/components/import-dialog";

const dailyWorkSchema = z.object({
  action: z.string().min(1, "Action is required"),
  how: z.string().optional(),
  who: z.string().optional(),
  assignedBy: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  startDate: z.string().optional(),
  completionDate: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  completionPct: z.coerce.number().min(0).max(100).optional(),
  remarks: z.string().optional(),
});

type DailyWorkFormData = z.infer<typeof dailyWorkSchema>;

// Helper function to calculate progress based on status
const getProgressFromStatus = (status: string, currentProgress?: number): number => {
  switch(status) {
    case "yts": return 0;
    case "completed": return 100;
    case "cancelled": return 0;
    case "hold": return currentProgress ?? 0; // Keep existing progress
    default: return currentProgress ?? 0; // WIP - user can edit
  }
};

// Helper function to check if progress field should be disabled
const isProgressDisabled = (status: string): boolean => {
  return status === "yts" || status === "completed" || status === "hold" || status === "cancelled";
};

export default function EmployeeDailyWork() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  
  // Show all of the employee's imported work by default. Import files often
  // contain historical dates, which should not disappear behind a today-only
  // filter immediately after import.
  const [dateFilter, setDateFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedWork, setSelectedWork] = useState<any>(null);

  const { data: dailyWork, isLoading } = useListDailyWork(
    { 
      userId: user?.id,
      date: dateFilter || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
    },
    { query: { queryKey: getListDailyWorkQueryKey({ 
      userId: user?.id,
      date: dateFilter || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
    }) } }
  );

  const createMutation = useCreateDailyWork();
  const updateMutation = useUpdateDailyWork();
  const deleteMutation = useDeleteDailyWork();

  const form = useForm<DailyWorkFormData>({
    resolver: zodResolver(dailyWorkSchema),
    defaultValues: {
      action: "",
      how: "",
      who: user?.name || "",
      assignedBy: user?.name || "",
      date: today,
      startDate: today,
      completionDate: "",
      status: "wip",
      completionPct: 0,
      remarks: "",
    },
  });

  // Watch status changes to automatically update progress
  const watchStatus = form.watch("status");
  const watchProgress = form.watch("completionPct");
  
  useEffect(() => {
    if (watchStatus) {
      const newProgress = getProgressFromStatus(watchStatus, watchProgress);
      if (newProgress !== watchProgress) {
        form.setValue("completionPct", newProgress);
      }
    }
  }, [watchStatus]);

  const handleExport = () => {
    if (dailyWork) {
      exportToCsv("daily_work_export.csv", dailyWork.map(w => ({
        ID: w.id,
        Date: w.date,
        Action: w.action,
        How: w.how || '',
        Who: w.who || '',
        'Assigned By': w.assignedBy || '',
        Status: w.status,
        Progress: `${w.completionPct || 0}%`,
        'Start Date': w.startDate || '',
        'Completion Date': w.completionDate || '',
        Remarks: w.remarks || '',
      })));
      toast({ title: "Export successful", description: "Daily work exported to CSV" });
    }
  };

  const handleDownloadTemplate = () => {
    downloadCsvTemplate(
      "daily_work_template.csv",
      ["Date", "Action", "How", "Who", "Assigned By", "Start Date", "Completion Date", "Status", "Completion %", "Remarks"],
      [
        [today, "Sample Task", "Method description", "Responsible person", "Manager", today, "", "yts", "0", "Optional remarks"],
        [today, "Another Task", "", "", "", "", "", "wip", "50", ""],
      ]
    );
    toast({ title: "Template downloaded", description: "Use this template to import daily work" });
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseCsvFile(file);
      
      if (data.length === 0) {
        toast({ title: "Import failed", description: "CSV file is empty", variant: "destructive" });
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const row of data) {
        try {
          const workData: DailyWorkFormData = {
            action: row.Action || "",
            how: row.How || undefined,
            who: row.Who || undefined,
            assignedBy: row["Assigned By"] || undefined,
            date: row.Date || today,
            startDate: row["Start Date"] || undefined,
            completionDate: row["Completion Date"] || undefined,
            status: row.Status?.toLowerCase() || "yts",
            completionPct: parseInt(row["Completion %"] || "0"),
            remarks: row.Remarks || undefined,
          };

          await createMutation.mutateAsync({ data: workData });
          successCount++;
        } catch (error) {
          errorCount++;
          console.error("Failed to import row:", row, error);
        }
      }

      queryClient.invalidateQueries({ queryKey: getListDailyWorkQueryKey({ userId: user?.id }) });
      
      if (successCount > 0) {
        toast({ 
          title: "Import completed", 
          description: `Successfully imported ${successCount} records${errorCount > 0 ? `, ${errorCount} failed` : ""}` 
        });
      } else {
        toast({ title: "Import failed", description: "No records were imported", variant: "destructive" });
      }
    } catch (error) {
      console.error("Import error:", error);
      toast({ title: "Import failed", description: "Failed to parse CSV file", variant: "destructive" });
    }

    // Reset file input
    event.target.value = "";
  };

  const copyPreviousDay = () => {
    // This would typically involve fetching yesterday's data or calling a specific endpoint
    // For now, we'll just show a toast since we might not have yesterday's data loaded
    toast({ title: "Copy Previous Day", description: "Fetching previous day's unfinished work..." });
  };

  const onSubmit = (values: DailyWorkFormData) => {
    const workData = { ...values, assignedBy: values.assignedBy || user?.name || "Self" };
    if (selectedWork) {
      updateMutation.mutate(
        { id: selectedWork.id, data: workData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListDailyWorkQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            setIsEditOpen(false);
            toast({ title: "Success", description: "Daily work updated successfully" });
          }
        }
      );
    } else {
      createMutation.mutate(
        { data: { ...workData, userId: user?.id, teamId: user?.teamId } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListDailyWorkQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            setIsCreateOpen(false);
            form.reset();
            toast({ title: "Success", description: "Daily work added successfully" });
          }
        }
      );
    }
  };

  const handleDelete = () => {
    if (selectedWork) {
      deleteMutation.mutate(
        { id: selectedWork.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListDailyWorkQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            setIsDeleteOpen(false);
            toast({ title: "Success", description: "Daily work deleted successfully" });
          }
        }
      );
    }
  };

  const openEdit = (work: any) => {
    setSelectedWork(work);
    form.reset({
      action: work.action,
      how: work.how || "",
      who: work.who || "",
      assignedBy: work.assignedBy || "",
      date: work.date,
      startDate: work.startDate || "",
      completionDate: work.completionDate || "",
      status: work.status,
      completionPct: work.completionPct || 0,
      remarks: work.remarks || "",
    });
    setIsEditOpen(true);
  };

  const openDelete = (work: any) => {
    setSelectedWork(work);
    setIsDeleteOpen(true);
  };

  const WorkFormFields = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
      <FormField control={form.control} name="date" render={({ field }) => (
        <FormItem>
          <FormLabel>Date *</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      
      <FormField control={form.control} name="action" render={({ field }) => (
        <FormItem className="md:col-span-2">
          <FormLabel>Action / Task *</FormLabel>
          <FormControl><Input placeholder="What did you do?" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="how" render={({ field }) => (
        <FormItem className="md:col-span-2">
          <FormLabel>How (Method/Tool)</FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="who" render={({ field }) => (
        <FormItem>
          <FormLabel>Who</FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="assignedBy" render={({ field }) => (
        <FormItem>
          <FormLabel>Assigned By</FormLabel>
          <FormControl><Input placeholder="Name of person who assigned this work" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="status" render={({ field }) => (
        <FormItem>
          <FormLabel>Status *</FormLabel>
          <Select onValueChange={field.onChange} defaultValue={field.value}>
            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="wip">WIP</SelectItem>
              <SelectItem value="yts">YTS</SelectItem>
              <SelectItem value="hold">Hold</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="completionPct" render={({ field }) => (
        <FormItem>
          <FormLabel>Progress %</FormLabel>
          <FormControl>
            <Input 
              type="number" 
              min="0" 
              max="100" 
              {...field} 
              disabled={isProgressDisabled(watchStatus)}
              className={isProgressDisabled(watchStatus) ? "bg-gray-100 cursor-not-allowed" : ""}
            />
          </FormControl>
          <FormMessage />
          {isProgressDisabled(watchStatus) && (
            <p className="text-xs text-muted-foreground mt-1">
              Progress is auto-managed for this status
            </p>
          )}
        </FormItem>
      )} />

      <FormField control={form.control} name="startDate" render={({ field }) => (
        <FormItem>
          <FormLabel>Start Date</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="completionDate" render={({ field }) => (
        <FormItem>
          <FormLabel>Completion Date</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="remarks" render={({ field }) => (
        <FormItem className="md:col-span-2">
          <FormLabel>Remarks</FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Work Log</h1>
          <p className="text-gray-500 mt-1">Track your daily actions and progress.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={copyPreviousDay}>
            <Copy className="mr-2 h-4 w-4" /> Copy Previous Day
          </Button>
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <FileDown className="mr-2 h-4 w-4" /> Template
          </Button>
          <ImportDialog
            title="Import Daily Work"
            description="Upload an Excel or CSV file to import multiple daily work entries at once"
            importEndpoint="/daily-work/import"
            sampleData={[
              {
                "Date": today,
                "Action": "Complete project documentation",
                "How": "Review and update all sections",
                "Who": user?.name || "Employee Name",
                "Assigned By": "Team Lead",
                "Start Date": today,
                "Completion Date": "",
                "Status": "wip",
                "Completion %": "50",
                "Remarks": "In progress"
              },
              {
                "Date": today,
                "Action": "Team meeting attendance",
                "How": "Participate and take notes",
                "Who": user?.name || "Employee Name",
                "Assigned By": "Manager",
                "Start Date": today,
                "Completion Date": today,
                "Status": "completed",
                "Completion %": "100",
                "Remarks": "Completed successfully"
              }
            ]}
            sampleFilename="daily_work_import_template.xlsx"
            onImportSuccess={() => {
              queryClient.invalidateQueries({ queryKey: getListDailyWorkQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            }}
            additionalData={{
              userId: user?.id,
              teamId: user?.teamId
            }}
          />
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            if (open) {
              form.reset({ ...form.getValues(), date: dateFilter || today });
              setSelectedWork(null);
            }
            setIsCreateOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Work
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Daily Work</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <WorkFormFields />
                  <div className="flex justify-end pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="mr-2">Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending}>Save Work</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border flex flex-wrap gap-4 items-center">
        <div className="flex items-center text-sm font-medium text-gray-500">
          <Filter className="w-4 h-4 mr-2" /> Filters
        </div>
        <div className="w-48">
          <Input 
            type="date" 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value)} 
            placeholder="Filter by Date"
          />
        </div>
        <div className="w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="wip">WIP</SelectItem>
              <SelectItem value="yts">YTS</SelectItem>
              <SelectItem value="hold">Hold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(dateFilter !== "" || statusFilter !== "all") && (
          <Button variant="ghost" onClick={() => { setDateFilter(""); setStatusFilter("all"); }}>
            Clear Filters
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Date</TableHead>
                <TableHead className="min-w-[200px]">Action</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Assigned By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-gray-500">
                    Loading daily work...
                  </TableCell>
                </TableRow>
              ) : dailyWork && dailyWork.length > 0 ? (
                dailyWork.map((work) => (
                  <TableRow key={work.id}>
                    <TableCell className="whitespace-nowrap">{work.date}</TableCell>
                    <TableCell className="font-medium">
                      <div>{work.action}</div>
                      {work.how && <div className="text-xs text-gray-500 font-normal mt-1">via {work.how}</div>}
                    </TableCell>
                    <TableCell>{work.who || "-"}</TableCell>
                    <TableCell>{work.assignedBy || "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={work.status} />
                      {(work as any).rejectionReason && <p className="mt-1 text-xs text-red-600">Reason: {(work as any).rejectionReason}</p>}
                    </TableCell>
                    <TableCell><StatusBadge status={(work as any).approvalStatus || "pending"} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary" 
                            style={{ width: `${work.completionPct || 0}%` }} 
                          />
                        </div>
                        <span className="text-xs text-gray-500">{work.completionPct || 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" title={work.remarks || ""}>
                      {work.remarks || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(work)} className="h-8 w-8 text-gray-500 hover:text-primary">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDelete(work)} className="h-8 w-8 text-gray-500 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-gray-500">
                    No daily work records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Daily Work</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <WorkFormFields />
              <div className="flex justify-end pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)} className="mr-2">Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>Update Work</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this daily work record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
              {deleteMutation.isPending ? "Deleting..." : "Delete Record"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
