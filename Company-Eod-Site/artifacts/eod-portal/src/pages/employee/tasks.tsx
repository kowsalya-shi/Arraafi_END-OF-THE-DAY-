import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { 
  useListTasks, 
  getListTasksQueryKey, 
  useCreateTask, 
  useUpdateTask,
  useDeleteTask
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { exportToCsv } from "@/lib/export-csv";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Plus, Edit2, Trash2, Search, Filter } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ImportDialog } from "@/components/import-dialog";

const taskSchema = z.object({
  taskCode: z.string().optional(),
  taskName: z.string().min(1, "Task name is required"),
  how: z.string().optional(),
  who: z.string().optional(),
  assignedBy: z.string().optional(),
  priority: z.string().optional(),
  plannedStartDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
  actualStartDate: z.string().optional(),
  actualEndDate: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  completionPct: z.coerce.number().min(0).max(100).optional(),
  dependency: z.string().optional(),
  remarks: z.string().optional(),
  etc: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

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

export default function EmployeeTasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);

  const { data: tasks, isLoading } = useListTasks(
    { 
      userId: user?.id,
      status: statusFilter !== "all" ? statusFilter : undefined,
      priority: priorityFilter !== "all" ? priorityFilter : undefined,
      assignmentStatus: "accepted" // Only show accepted tasks in My Tasks
    },
    { query: { queryKey: getListTasksQueryKey({ 
      userId: user?.id,
      status: statusFilter !== "all" ? statusFilter : undefined,
      priority: priorityFilter !== "all" ? priorityFilter : undefined,
      assignmentStatus: "accepted"
    }) } }
  );

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      taskName: "",
      taskCode: "",
      how: "",
      who: user?.name || "",
      assignedBy: "",
      priority: "medium",
      status: "yts",
      completionPct: 0,
      dependency: "",
      remarks: "",
      etc: "",
      plannedStartDate: format(new Date(), "yyyy-MM-dd"),
      plannedEndDate: format(new Date(), "yyyy-MM-dd"),
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
    if (tasks) {
      exportToCsv("tasks_export.csv", tasks.map(t => ({
        ID: t.id,
        Code: t.taskCode || '',
        Name: t.taskName,
        Priority: t.priority || '',
        Status: t.status,
        Progress: `${t.completionPct || 0}%`,
        'Assigned By': t.assignedBy || '',
        'Planned Start': t.plannedStartDate || '',
        'Planned End': t.plannedEndDate || '',
        'Actual Start': t.actualStartDate || '',
        'Actual End': t.actualEndDate || '',
      })));
      toast({ title: "Export successful", description: "Tasks exported to CSV" });
    }
  };

  const onSubmit = (values: TaskFormData) => {
    if (selectedTask) {
      updateMutation.mutate(
        { id: selectedTask.id, data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            setIsEditOpen(false);
            toast({ title: "Success", description: "Task updated successfully" });
          }
        }
      );
    } else {
      createMutation.mutate(
        { data: { ...values, userId: user?.id, teamId: user?.teamId } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            setIsCreateOpen(false);
            form.reset();
            toast({ title: "Success", description: "Task created successfully" });
          }
        }
      );
    }
  };

  const handleDelete = () => {
    if (selectedTask) {
      deleteMutation.mutate(
        { id: selectedTask.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            setIsDeleteOpen(false);
            toast({ title: "Success", description: "Task deleted successfully" });
          }
        }
      );
    }
  };

  const openEdit = (task: any) => {
    setSelectedTask(task);
    form.reset({
      taskName: task.taskName,
      taskCode: task.taskCode || "",
      how: task.how || "",
      who: task.who || "",
      assignedBy: task.assignedBy || "",
      priority: task.priority || "medium",
      status: task.status,
      completionPct: task.completionPct || 0,
      dependency: task.dependency || "",
      remarks: task.remarks || "",
      etc: task.etc || "",
      plannedStartDate: task.plannedStartDate || "",
      plannedEndDate: task.plannedEndDate || "",
      actualStartDate: task.actualStartDate || "",
      actualEndDate: task.actualEndDate || "",
    });
    setIsEditOpen(true);
  };

  const openDelete = (task: any) => {
    setSelectedTask(task);
    setIsDeleteOpen(true);
  };

  const TaskFormFields = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
      <FormField control={form.control} name="taskName" render={({ field }) => (
        <FormItem className="md:col-span-2">
          <FormLabel>Task Name *</FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      
      <FormField control={form.control} name="taskCode" render={({ field }) => (
        <FormItem>
          <FormLabel>Task Code</FormLabel>
          <FormControl><Input {...field} /></FormControl>
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
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="priority" render={({ field }) => (
        <FormItem>
          <FormLabel>Priority</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
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

      <FormField control={form.control} name="plannedStartDate" render={({ field }) => (
        <FormItem>
          <FormLabel>Planned Start Date</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="plannedEndDate" render={({ field }) => (
        <FormItem>
          <FormLabel>Planned End Date</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="actualStartDate" render={({ field }) => (
        <FormItem>
          <FormLabel>Actual Start Date</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="actualEndDate" render={({ field }) => (
        <FormItem>
          <FormLabel>Actual End Date</FormLabel>
          <FormControl><Input type="date" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="assignedBy" render={({ field }) => (
        <FormItem>
          <FormLabel>Assigned By</FormLabel>
          <FormControl><Input {...field} /></FormControl>
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
          <h1 className="text-2xl font-bold text-gray-900">Internal Tasks</h1>
          <p className="text-gray-500 mt-1">Manage and track your assigned tasks.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <ImportDialog
            title="Import Tasks"
            description="Upload an Excel or CSV file to import multiple tasks at once"
            importEndpoint="/tasks/import"
            sampleData={[
              {
                "Task Name": "Example Task 1",
                "Task Code": "TASK-001",
                "Status": "yts",
                "Priority": "high",
                "How": "Follow the standard procedure",
                "Who": user?.name || "Employee Name",
                "Assigned By": "Manager Name",
                "Planned Start Date": "2026-09-08",
                "Planned End Date": "2026-09-15",
                "Actual Start Date": "",
                "Actual End Date": "",
                "Completion %": "0",
                "Dependency": "",
                "Remarks": "Important task",
                "ETC": ""
              },
              {
                "Task Name": "Example Task 2",
                "Task Code": "TASK-002",
                "Status": "wip",
                "Priority": "medium",
                "How": "Research and implement",
                "Who": user?.name || "Employee Name",
                "Assigned By": "Team Lead",
                "Planned Start Date": "2026-09-10",
                "Planned End Date": "2026-09-20",
                "Actual Start Date": "2026-09-10",
                "Actual End Date": "",
                "Completion %": "50",
                "Dependency": "TASK-001",
                "Remarks": "",
                "ETC": "5 days"
              }
            ]}
            sampleFilename="tasks_import_template.xlsx"
            onImportSuccess={() => {
              queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
            }}
            additionalData={{
              userId: user?.id,
              teamId: user?.teamId
            }}
          />
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            if (open) {
              form.reset();
              setSelectedTask(null);
            }
            setIsCreateOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Task</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <TaskFormFields />
                  <div className="flex justify-end pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="mr-2">Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending}>Save Task</Button>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="wip">WIP</SelectItem>
              <SelectItem value="yts">YTS</SelectItem>
              <SelectItem value="hold">Hold</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Code</TableHead>
                <TableHead className="min-w-[200px]">Task Name</TableHead>
                <TableHead>Assigned By</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Planned Start</TableHead>
                <TableHead>Planned End</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center text-gray-500">
                    Loading tasks...
                  </TableCell>
                </TableRow>
              ) : tasks && tasks.length > 0 ? (
                tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-mono text-xs">{task.taskCode || "-"}</TableCell>
                    <TableCell className="font-medium">{task.taskName}</TableCell>
                    <TableCell>{task.assignedBy || "-"}</TableCell>
                    <TableCell>
                      <span className={`text-xs uppercase font-medium ${
                        task.priority === 'high' ? 'text-red-600' : 
                        task.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'
                      }`}>
                        {task.priority || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={task.status} />
                      {(task as any).rejectionReason && <p className="mt-1 text-xs text-red-600">Reason: {(task as any).rejectionReason}</p>}
                    </TableCell>
                    <TableCell><StatusBadge status={(task as any).approvalStatus || "pending"} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary" 
                            style={{ width: `${task.completionPct || 0}%` }} 
                          />
                        </div>
                        <span className="text-xs text-gray-500">{task.completionPct || 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{task.plannedStartDate || "-"}</TableCell>
                    <TableCell className="text-sm">{task.plannedEndDate || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(task)} className="h-8 w-8 text-gray-500 hover:text-primary">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDelete(task)} className="h-8 w-8 text-gray-500 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center text-gray-500">
                    No tasks found matching your filters.
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
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <TaskFormFields />
              <div className="flex justify-end pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)} className="mr-2">Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>Update Task</Button>
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
              This will permanently delete the task "{selectedTask?.taskName}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
              {deleteMutation.isPending ? "Deleting..." : "Delete Task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
