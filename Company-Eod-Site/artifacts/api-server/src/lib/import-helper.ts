import * as XLSX from 'xlsx';
import { z, ZodSchema } from 'zod';

export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult<T> {
  success: boolean;
  validRecords: T[];
  errors: ImportValidationError[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

/**
 * Parse Excel or CSV file from buffer
 */
export function parseExcelFile(buffer: Buffer): any[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Planning workbooks may start with a title, reporting date, or blank rows.
  // Find the actual heading row instead of always treating worksheet row 1 as
  // the header row.
  const grid = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, raw: false, defval: '' });
  const primaryHeaderNames = new Set([
    'task', 'tasks', 'task_name', 'task_description', 'task_details', 'activity',
    'activity_name', 'action', 'actions', 'work', 'work_details', 'task_activity',
    'taskname', 'taskdescription', 'description', 'particulars', 'topic',
    'topics', 'topics_covered', 'training_topic', 'subject'
  ]);
  const knownHeaderNames = new Set([
    ...primaryHeaderNames, 'task_code', 'code', 'status', 'priority', 'how',
    'who', 'assigned_by', 'assignee', 'planned_start_date', 'planned_end_date',
    'start_date', 'end_date', 'completion', 'completion_pct', 'progress',
    'comp', 'completion_date', 'when', 'actual_start_date', 'actual_end_date',
    'category', 'module', 'sub_modules', 'trainer', 'trainer_remarks',
    'trainee_assignment_status', 'remarks', 'dependency', 'etc', 's_n', 's_no',
    'sno', 'sl_no', 'slno', 'serial_no', 'serialno'
  ]);
  const headerRowIndex = grid.slice(0, 30).findIndex((row) => {
    const names = row.map((cell) => normalizeFieldName(String(cell)));
    return names.some((name) => primaryHeaderNames.has(name)) && names.filter((name) => knownHeaderNames.has(name)).length >= 2;
  });

  if (headerRowIndex < 0) return [];

  // Some planning files use a two-row header. For example, the Training
  // workbook puts Planned/Actual date labels on the row below "Course
  // Coverage". Prefer those specific labels when they are present.
  const nextRow = grid[headerRowIndex + 1] ?? [];
  const useSecondHeaderRow = nextRow.some((cell) => knownHeaderNames.has(normalizeFieldName(String(cell))));
  const headers = grid[headerRowIndex].map((cell, index) => {
    const nextHeader = normalizeFieldName(String(nextRow[index] ?? ''));
    return useSecondHeaderRow && knownHeaderNames.has(nextHeader)
      ? String(nextRow[index])
      : String(cell);
  });
  const dataStartIndex = headerRowIndex + (useSecondHeaderRow ? 2 : 1);
  const data = grid.slice(dataStartIndex).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header.trim()) record[header] = String(row[index] ?? '');
    });
    return record;
  });
  
  // Filter out completely empty rows (all values are undefined, null, or empty string)
  const filteredData = data.filter(row => {
    const values = Object.values(row);
    // Row must have at least one non-empty value
    return values.some(val => val !== undefined && val !== null && val !== '' && val.toString().trim() !== '');
  });
  
  return filteredData;
}

/**
 * Validate and transform imported data using Zod schema
 */
export function validateImportData<T>(
  data: any[],
  schema: ZodSchema<T>
): ImportResult<T> {
  const validRecords: T[] = [];
  const errors: ImportValidationError[] = [];
  
  data.forEach((row, index) => {
    const rowNumber = index + 2; // +2 because Excel starts at 1 and we skip header
    
    try {
      const validated = schema.parse(row);
      validRecords.push(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach((err) => {
          // Get the actual value that failed validation
          const fieldPath = err.path.join('.');
          const actualValue = fieldPath ? row[err.path[0]] : undefined;
          const valueInfo = actualValue !== undefined ? ` (received: "${actualValue}")` : ' (missing or empty)';
          
          errors.push({
            row: rowNumber,
            field: fieldPath || 'unknown',
            message: `${err.message}${valueInfo}`
          });
        });
      } else {
        errors.push({
          row: rowNumber,
          field: 'unknown',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });
  
  return {
    success: errors.length === 0,
    validRecords,
    errors,
    totalRows: data.length,
    validRows: validRecords.length,
    invalidRows: errors.length
  };
}

/**
 * Convert Excel date serial number to YYYY-MM-DD string
 */
export function excelDateToString(excelDate: any): string | null {
  if (!excelDate) return null;
  
  // If already a string in YYYY-MM-DD format, return as is
  if (typeof excelDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(excelDate)) {
    return excelDate;
  }
  
  // If it's an Excel serial date number
  if (typeof excelDate === 'number') {
    const date = XLSX.SSF.parse_date_code(excelDate);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  
  // Try to parse as date
  const parsed = new Date(excelDate);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  return null;
}

/** Convert spreadsheet values such as "70%" into values accepted by numeric fields. */
export function normalizePercentage(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/%/g, '').trim() : value;
}

/**
 * Normalize field names from Excel headers to database field names
 * Handles variations like "Task Name", "task_name", "taskName"
 */
export function normalizeFieldName(fieldName: string): string {
  return fieldName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Map Excel headers to expected field names
 */
export function mapHeaders(row: any, headerMapping: Record<string, string[]>): any {
  const mapped: any = {};
  
  for (const [targetField, possibleHeaders] of Object.entries(headerMapping)) {
    for (const header of possibleHeaders) {
      const normalizedHeader = normalizeFieldName(header);
      
      // Check all keys in the row
      for (const [key, value] of Object.entries(row)) {
        if (normalizeFieldName(key) === normalizedHeader) {
          mapped[targetField] = value;
          break;
        }
      }
      
      if (mapped[targetField] !== undefined) break;
    }
  }
  
  return mapped;
}
