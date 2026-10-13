import * as XLSX from 'xlsx';

console.log('📝 Creating Training Import Template...\n');

// Sample training data based on your file structure
const sampleData = [
  {
    'Topic': 'What is full-stack development?',
    'Category': 'Full Stack Development',
    'Trainer': 'ARRAAFI Training Team',
    'Start Date': '12/10/25',
    'End Date': '12/11/25',
    'Status': 'completed',
    'Progress %': 100,
    'Remarks': 'Completed'
  },
  {
    'Topic': 'Client-side vs Server-side',
    'Category': 'Full Stack Development',
    'Trainer': 'ARRAAFI Training Team',
    'Start Date': '12/11/25',
    'End Date': '12/11/25',
    'Status': 'completed',
    'Progress %': 100,
    'Remarks': 'Completed'
  },
  {
    'Topic': 'Core Java Programming - Data Types',
    'Category': 'Full Stack Development',
    'Trainer': 'ARRAAFI Training Team',
    'Start Date': '12/17/25',
    'End Date': '12/18/25',
    'Status': 'completed',
    'Progress %': 100,
    'Remarks': 'Completed'
  },
  {
    'Topic': 'React Framework',
    'Category': 'Frontend Development',
    'Trainer': 'ARRAAFI Training Team',
    'Start Date': '6/10/26',
    'End Date': '',
    'Status': 'wip',
    'Progress %': 70,
    'Remarks': 'In progress'
  },
  {
    'Topic': 'Spring Boot Backend',
    'Category': 'Backend Development',
    'Trainer': 'ARRAAFI Training Team',
    'Start Date': '',
    'End Date': '',
    'Status': 'yts',
    'Progress %': 0,
    'Remarks': 'Not started'
  }
];

// Create workbook
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(sampleData);

// Add some column width styling
worksheet['!cols'] = [
  { wch: 40 }, // Topic
  { wch: 25 }, // Category
  { wch: 25 }, // Trainer
  { wch: 12 }, // Start Date
  { wch: 12 }, // End Date
  { wch: 12 }, // Status
  { wch: 12 }, // Progress %
  { wch: 30 }, // Remarks
];

XLSX.utils.book_append_sheet(workbook, worksheet, 'Training');

// Write to file
const filename = 'training-import-template.xlsx';
XLSX.writeFile(workbook, filename);

console.log('✅ Template created successfully!');
console.log(`📁 File: ${filename}`);
console.log('\n📋 Instructions:');
console.log('1. Open the template file');
console.log('2. Replace the sample data with your actual training records');
console.log('3. Keep the same column headers');
console.log('4. Status values: yts, wip, or completed');
console.log('5. Save and import through the Training page\n');
