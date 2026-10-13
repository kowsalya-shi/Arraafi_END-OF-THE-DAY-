import * as XLSX from 'xlsx';
import fs from 'fs';

// Check if a test file exists
const testFiles = [
  'test_tasks_import.csv',
  'ARRAAFI Internal Team Tasks Plan 20260902.xlsx'
];

let fileToTest = null;
for (const file of testFiles) {
  if (fs.existsSync(file)) {
    fileToTest = file;
    break;
  }
}

if (!fileToTest) {
  console.log('No test file found. Please provide a tasks import file.');
  process.exit(1);
}

console.log(`Testing file: ${fileToTest}\n`);

// Read the file
const buffer = fs.readFileSync(fileToTest);
const workbook = XLSX.read(buffer, { type: 'buffer' });
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];

console.log('Sheet name:', firstSheetName);
console.log('\n=== Raw data (first 3 rows) ===');

const data = XLSX.utils.sheet_to_json(worksheet, { 
  raw: false,
  defval: undefined
});

console.log('Total rows:', data.length);
console.log('\nFirst row headers:', Object.keys(data[0] || {}));
console.log('\nFirst 3 rows:');
data.slice(0, 3).forEach((row, i) => {
  console.log(`\nRow ${i + 1}:`);
  console.log(JSON.stringify(row, null, 2));
});

// Test header mapping
console.log('\n=== Testing Header Mapping ===');

function normalizeFieldName(fieldName) {
  return fieldName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function mapHeaders(row, headerMapping) {
  const mapped = {};
  
  for (const [targetField, possibleHeaders] of Object.entries(headerMapping)) {
    for (const header of possibleHeaders) {
      const normalizedHeader = normalizeFieldName(header);
      
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

const headerMapping = {
  taskName: ['Task Name', 'taskName', 'task_name', 'name'],
  taskCode: ['Task Code', 'taskCode', 'task_code', 'code'],
  status: ['Status', 'status'],
  priority: ['Priority', 'priority'],
};

console.log('Header mapping config:');
console.log(JSON.stringify(headerMapping, null, 2));

console.log('\nMapped first row:');
const mapped = mapHeaders(data[0], headerMapping);
console.log(JSON.stringify(mapped, null, 2));

console.log('\n=== Field Name Normalization Test ===');
const originalHeaders = Object.keys(data[0] || {});
originalHeaders.forEach(header => {
  console.log(`"${header}" -> "${normalizeFieldName(header)}"`);
});
