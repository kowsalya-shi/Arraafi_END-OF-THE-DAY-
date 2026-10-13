import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import * as XLSX from 'xlsx';

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  imported?: number;
  summary?: {
    totalRows: number;
    successfulImports: number;
    failedImports: number;
  };
  error?: string;
  details?: ImportError[];
}

interface ImportDialogProps {
  title: string;
  description: string;
  importEndpoint: string;
  sampleData: any[];
  sampleFilename: string;
  onImportSuccess?: () => void;
  additionalData?: Record<string, any>; // Extra data to send with import (e.g., userId, teamId)
}

export function ImportDialog({
  title,
  description,
  importEndpoint,
  sampleData,
  sampleFilename,
  onImportSuccess,
  additionalData = {}
}: ImportDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv' // .csv
      ];
      
      if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please select an Excel (.xlsx, .xls) or CSV (.csv) file"
        });
        return;
      }
      
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        variant: "destructive",
        title: "No file selected",
        description: "Please select a file to import"
      });
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      // Add any additional data (userId, teamId, etc.)
      Object.entries(additionalData).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value));
        }
      });

      const response = await fetch(`/api${importEndpoint}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        // Try to parse error response, but handle cases where there's no body
        let errorMessage = 'Import failed';
        let errorDetails = [];
        
        try {
          const result = await response.json();
          errorMessage = result.error || errorMessage;
          errorDetails = result.details || [];
        } catch (e) {
          // Response had no JSON body
          errorMessage = `Server error: ${response.statusText}`;
        }

        setImportResult({
          success: false,
          error: errorMessage,
          details: errorDetails
        });
        
        toast({
          variant: "destructive",
          title: "Import failed",
          description: errorMessage
        });
        
        setIsImporting(false);
        return;
      }

      // Response is OK, parse the success result
      const result = await response.json();
      
      setImportResult(result);
      
      toast({
        title: "Import successful",
        description: `Successfully imported ${result.imported} record(s)`
      });

      // Clear file and close dialog after success
      setSelectedFile(null);
      if (onImportSuccess) {
        onImportSuccess();
      }
      
      // Close dialog after 2 seconds
      setTimeout(() => {
        setIsOpen(false);
        setImportResult(null);
      }, 2000);
    } catch (error) {
      console.error('Import error:', error);
      setImportResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      
      toast({
        variant: "destructive",
        title: "Import failed",
        description: "An error occurred while importing the file"
      });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadSampleFile = () => {
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sample");
    XLSX.writeFile(wb, sampleFilename);
    
    toast({
      title: "Sample downloaded",
      description: `${sampleFilename} has been downloaded`
    });
  };

  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset state when closing
      setSelectedFile(null);
      setImportResult(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-gray-500">{description}</p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Download Sample Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-blue-900 mb-1">Need a template?</h4>
                <p className="text-sm text-blue-700 mb-3">
                  Download our sample Excel file to see the required format
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadSampleFile}
                  className="bg-white"
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Download Sample File
                </Button>
              </div>
            </div>
          </div>

          {/* File Upload Section */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Select File to Import
            </label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
              />
            </div>
            {selectedFile && (
              <p className="text-sm text-gray-600">
                Selected: <span className="font-medium">{selectedFile.name}</span>
              </p>
            )}
          </div>

          {/* Import Result */}
          {importResult && (
            <div>
              {importResult.success ? (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-900">Import Successful!</AlertTitle>
                  <AlertDescription className="text-green-700">
                    {importResult.imported} record(s) imported successfully
                    {importResult.summary && (
                      <div className="mt-2 text-sm">
                        <p>Total rows: {importResult.summary.totalRows}</p>
                        <p>Successful: {importResult.summary.successfulImports}</p>
                        <p>Failed: {importResult.summary.failedImports}</p>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Import Failed</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">{importResult.error}</p>
                    {importResult.details && importResult.details.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="font-medium">Validation Errors:</p>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {importResult.details.map((error, idx) => (
                            <div key={idx} className="text-sm bg-red-50 border border-red-200 rounded p-2">
                              <span className="font-medium">Row {error.row}</span>
                              {error.field && <span className="text-red-700"> - {error.field}</span>}
                              : {error.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => handleDialogChange(false)}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selectedFile || isImporting}
            >
              {isImporting ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
