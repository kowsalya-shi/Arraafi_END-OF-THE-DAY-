import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { 
  useListTraining, 
  getListTrainingQueryKey, 
  useCreateTraining, 
  useUpdateTraining,
  useDeleteTraining
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
import { Download, Plus, Edit2, Trash2, Filter } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ImportDialog } from "@/components/import-dialog";

const trainingSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  category: z.string().optional(),
  trainer: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  progressPct: z.coerce.number().min(0).max(100).optional(),
  remarks: z.string().optional(),
});

type TrainingFormData = z.infer<typeof trainingSchema>;

// Helper function to calculate progress based on status
const getProgressFromStatus = (status: string, currentProgress?: number): number => {
  switch(status) {
    case "yts": return 0;
    case "completed": return 100;
    case "cancelled": return 0;
    case "hold": return currentProgress ?? 0; // Keep existing progress
    default: return currentProgress ?? 0; // Learning/Practicing - user can edit
  }
};

// Helper function to check if progress field should be disabled
const isProgressDisabled = (status: string): boolean => {
  return status === "yts" || status === "completed" || status === "hold" || status === "cancelled";
};

export default function EmployeeTraining() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState<any>(null);

  const { data: trainingRecords, isLoading } = useListTraining(
    { 
      userId: user?.id,
      status: statusFilter !== "all" ? statusFilter : undefined,
    },
    { query: { queryKey: getListTrainingQueryKey({ 
      userId: user?.id,
      status: statusFilter !== "all" ? statusFilter : undefined,
    }) } }
  );

  const createMutation = useCreateTraining();
  const updateMutation = useUpdateTraining();
  const deleteMutation = useDeleteTraining();

  const form = useForm<TrainingFormData>({
    resolver: zodResolver(trainingSchema),
    defaultValues: {
      topic: "",
      category: "",
      trainer: "",
      startDate: today,
      endDate: "",
      status: "yts",
      progressPct: 0,
      remarks: "",
    },
  });

  // Watch status changes to automatically update progress
  const watchStatus = form.watch("status");
  const watchProgress = form.watch("progressPct");
  
  useEffect(() => {
    if (watchStatus) {
      const newProgress = getProgressFromStatus(watchStatus, watchProgress);
      if (newProgress !== watchProgress) {
        form.setValue("progressPct", newProgress);
      }
    }
  }, [watchStatus]);

  const handleExport = () => {
    if (trainingRecords) {
      exportToCsv("training_export.csv", trainingRecords.map(t => ({
        ID: t.id,
        Topic: t.topic,
        Category: t.category || '',
        Trainer: t.trainer || '',
        Status: t.status,
        Progress: `${t.progressPct || 0}%`,
        'Start Date': t.startDate || '',
        'End Date': t.endDate || '',
        Remarks: t.remarks || '',
      })));
      toast({ title: "Export successful", description: "Training records exported to CSV" });
    }
  };

  const onSubmit = (values: TrainingFormData) => {
    if (selectedTraining) {
      updateMutation.mutate(
        { id: selectedTraining.id, data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTrainingQueryKey() });
            setIsEditOpen(false);
            toast({ title: "Success", description: "Training record updated successfully" });
          }
        }
      );
    } else {
      createMutation.mutate(
        { data: { ...values, userId: user?.id, teamId: user?.teamId } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTrainingQueryKey() });
            setIsCreateOpen(false);
            form.reset();
            toast({ title: "Success", description: "Training record added successfully" });
          }
        }
      );
    }
  };

  const handleDelete = () => {
    if (selectedTraining) {
      deleteMutation.mutate(
        { id: selectedTraining.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTrainingQueryKey() });
            setIsDeleteOpen(false);
            toast({ title: "Success", description: "Training record deleted successfully" });
          }
        }
      );
    }
  };

  const openEdit = (training: any) => {
    setSelectedTraining(training);
    form.reset({
      topic: training.topic,
      category: training.category || "",
      trainer: training.trainer || "",
      startDate: training.startDate || "",
      endDate: training.endDate || "",
      status: training.status,
      progressPct: training.progressPct || 0,
      remarks: training.remarks || "",
    });
    setIsEditOpen(true);
  };

  const openDelete = (training: any) => {
    setSelectedTraining(training);
    setIsDeleteOpen(true);
  };

  const TrainingFormFields = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
      <FormField control={form.control} name="topic" render={({ field }) => (
        <FormItem className="md:col-span-2">
          <FormLabel>Topic *</FormLabel>
          <FormControl><Input placeholder="What are you learning?" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      
      <FormField control={form.control} name="category" render={({ field }) => (
        <FormItem>
          <FormLabel>Category</FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="trainer" render={({ field }) => (
        <FormItem>
          <FormLabel>Trainer / Platform</FormLabel>
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
              <SelectItem value="yts">YTS (Yet To Start)</SelectItem>
              <SelectItem value="learning">Learning</SelectItem>
              <SelectItem value="practicing">Practicing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="hold">Hold</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="progressPct" render={({ field }) => (
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

      <FormField control={form.control} name="endDate" render={({ field }) => (
        <FormItem>
          <FormLabel>End Date</FormLabel>
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
          <h1 className="text-2xl font-bold text-gray-900">Training Records</h1>
          <p className="text-gray-500 mt-1">Log and track your professional development.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <ImportDialog
            title="Import Training Records"
            description="Upload an Excel or CSV file to import multiple training records at once"
            importEndpoint="/training/import"
            sampleData={[
              {
                "Topic": "React Advanced Patterns",
                "Category": "Frontend Development",
                "Trainer": "John Smith",
                "Start Date": today,
                "End Date": "",
                "Status": "wip",
                "Progress %": "60",
                "Remarks": "Learning hooks and context"
              },
              {
                "Topic": "Database Optimization",
                "Category": "Backend Development",
                "Trainer": "Jane Doe",
                "Start Date": "2026-09-01",
                "End Date": "2026-09-07",
                "Status": "completed",
                "Progress %": "100",
                "Remarks": "Completed with certification"
              }
            ]}
            sampleFilename="training_import_template.xlsx"
            onImportSuccess={() => {
              queryClient.invalidateQueries({ queryKey: getListTrainingQueryKey() });
            }}
            additionalData={{
              userId: user?.id,
              teamId: user?.teamId
            }}
          />
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            if (open) {
              form.reset();
              setSelectedTraining(null);
            }
            setIsCreateOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Training
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Training Record</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <TrainingFormFields />
                  <div className="flex justify-end pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="mr-2">Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending}>Save Training</Button>
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
              <SelectItem value="yts">YTS</SelectItem>
              <SelectItem value="learning">Learning</SelectItem>
              <SelectItem value="practicing">Practicing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="hold">Hold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {statusFilter !== "all" && (
          <Button variant="ghost" onClick={() => setStatusFilter("all")}>
            Clear Filters
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="min-w-[200px]">Topic</TableHead>
                <TableHead>Trainer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-gray-500">
                    Loading training records...
                  </TableCell>
                </TableRow>
              ) : trainingRecords && trainingRecords.length > 0 ? (
                trainingRecords.map((training) => (
                  <TableRow key={training.id}>
                    <TableCell className="font-medium">
                      <div>{training.topic}</div>
                      {training.category && <div className="text-xs text-gray-500 font-normal mt-1">{training.category}</div>}
                    </TableCell>
                    <TableCell>{training.trainer || "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={training.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary" 
                            style={{ width: `${training.progressPct || 0}%` }} 
                          />
                        </div>
                        <span className="text-xs text-gray-500">{training.progressPct || 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{training.startDate || "-"}</TableCell>
                    <TableCell className="text-sm">{training.endDate || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(training)} className="h-8 w-8 text-gray-500 hover:text-primary">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDelete(training)} className="h-8 w-8 text-gray-500 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-gray-500">
                    No training records found.
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
            <DialogTitle>Edit Training Record</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <TrainingFormFields />
              <div className="flex justify-end pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)} className="mr-2">Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>Update Training</Button>
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
              This will permanently delete this training record. This action cannot be undone.
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

