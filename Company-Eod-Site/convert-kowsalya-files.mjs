import * as XLSX from 'xlsx';
import fs from 'fs';

console.log('🔄 Kowsalya Files Converter\n');

/**
 * Convert Daily Work file to import-ready format
 */
function convertDailyWork(inputFile, outputFile) {
  console.log(`📄 Processing: ${inputFile}`);
  
  const workbook = XLSX.read(fs.readFileSync(inputFile));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);
  
  console.log(`   Found ${data.length} rows`);
  
  // Map columns to expected format
  const converted = data.map(row => {
    // Handle status normalization
    let status = 'yts';
    if (row['Status']) {
      const statusLower = row['Status'].toString().toLowerCase().trim();
      if (statusLower === 'wip' || statusLower === 'work in progress') status = 'wip';
      else if (statusLower === 'completed' || statusLower === 'complete') status = 'completed';
    }
    
    // Extract completion percentage
    let completionPct = 0;
    if (row['Comp %']) {
      const pctStr = row['Comp %'].toString().replace('%', '').trim();
      completionPct = parseInt(pctStr) || 0;
    }
    
    return {
      'Action': row['Actions'] || '',
      'Date': row['When'] || row['Start Date'] || '',
      'How': row['How'] || '',
      'Who': row['Who'] || '',
      'Start Date': row['Start Date'] || '',
      'Completion Date': row['Completion\n Date'] || row['Completion Date'] || '',
      'Status': status,
      'Completion %': completionPct,
      'Remarks': row['Remarks'] || '',
    };
  }).filter(row => row.Action && row.Action.trim() !== ''); // Remove empty rows
  
  console.log(`   Converted ${converted.length} valid rows`);
  
  // Create new workbook
  const newWorkbook = XLSX.utils.book_new();
  const newSheet = XLSX.utils.json_to_sheet(converted);
  XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Daily Work');
  
  // Write to file
  XLSX.writeFile(newWorkbook, outputFile);
  console.log(`   ✅ Saved to: ${outputFile}\n`);
  
  return converted.length;
}

/**
 * Convert Training file to import-ready format
 */
function convertTraining(inputFile, outputFile) {
  console.log(`📄 Processing: ${inputFile}`);
  
  const workbook = XLSX.read(fs.readFileSync(inputFile));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Get all rows as arrays (to handle complex structure)
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rows = [];
  
  for (let row = range.s.r; row <= range.e.r; row++) {
    const rowData = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      rowData.push(cell ? cell.v : '');
    }
    rows.push(rowData);
  }
  
  console.log(`   Found ${rows.length} rows`);
  
  // Find the header row (look for "Topics Covered" or "Status")
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const rowStr = rows[i].join('|').toLowerCase();
    if (rowStr.includes('topics covered') || rowStr.includes('status')) {
      headerRowIndex = i;
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    console.log('   ❌ Could not find header row');
    return 0;
  }
  
  console.log(`   Header row found at index ${headerRowIndex}`);
  
  // Find column indices
  const headers = rows[headerRowIndex];
  const topicCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('topic'));
  const plannedStartCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('planned start'));
  const plannedEndCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('planned end'));
  const actualStartCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('actual start'));
  const actualEndCol = headers.findIndex(h => h && h.toString().toLowerCase().includes('actual end'));
  const statusCol = headers.findIndex(h => h && h.toString() === 'Status');
  
  console.log(`   Column indices - Topic: ${topicCol}, Status: ${statusCol}`);
  
  // Extract data rows
  const converted = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip empty rows or rows without topic
    if (!row[topicCol] || row[topicCol].toString().trim() === '') continue;
    
    const topic = row[topicCol].toString().trim();
    
    // Skip module header rows (they usually don't have dates)
    if (!row[plannedStartCol] && !row[actualStartCol]) continue;
    
    // Handle status
    let status = 'yts';
    if (row[statusCol]) {
      const statusLower = row[statusCol].toString().toLowerCase().trim();
      if (statusLower === 'wip' || statusLower.includes('progress')) status = 'wip';
      else if (statusLower === 'completed' || statusLower === 'complete') status = 'completed';
    }
    
    converted.push({
      'Topic': topic,
      'Category': 'Full Stack Development',
      'Trainer': 'ARRAAFI Training Team',
      'Start Date': row[actualStartCol] || row[plannedStartCol] || '',
      'End Date': row[actualEndCol] || row[plannedEndCol] || '',
      'Status': status,
      'Progress %': status === 'completed' ? 100 : (status === 'wip' ? 50 : 0),
      'Remarks': status === 'completed' ? 'Completed' : 'In progress',
    });
  }
  
  console.log(`   Converted ${converted.length} valid training records`);
  
  if (converted.length === 0) {
    console.log('   ⚠️  No valid training records found\n');
    return 0;
  }
  
  // Create new workbook
  const newWorkbook = XLSX.utils.book_new();
  const newSheet = XLSX.utils.json_to_sheet(converted);
  XLSX.utils.book_append_sheet(newWorkbook, newSheet, 'Training');
  
  // Write to file
  XLSX.writeFile(newWorkbook, outputFile);
  console.log(`   ✅ Saved to: ${outputFile}\n`);
  
  return converted.length;
}

// Main execution
try {
  let totalConverted = 0;
  
  // Convert Daily Work if file exists
  const dailyWorkFile = 'Arraafi-Kowsalya-Daily-Work-Plan-Status-Tracker-20260905-V120.xlsx';
  if (fs.existsSync(dailyWorkFile)) {
    totalConverted += convertDailyWork(
      dailyWorkFile,
      'import-ready-daily-work.xlsx'
    );
  } else {
    console.log(`⚠️  Daily Work file not found: ${dailyWorkFile}\n`);
  }
  
  // Convert Training if file exists
  const trainingFile = 'Arraafi-kowsalya-Daily-Training-Status-260710-V110.xlsx';
  if (fs.existsSync(trainingFile)) {
    totalConverted += convertTraining(
      trainingFile,
      'import-ready-training.xlsx'
    );
  } else {
    console.log(`⚠️  Training file not found: ${trainingFile}\n`);
  }
  
  console.log('═══════════════════════════════════════');
  console.log(`✅ Conversion complete!`);
  console.log(`   Total records converted: ${totalConverted}`);
  console.log(`   Output files:`);
  if (fs.existsSync(dailyWorkFile)) console.log(`   - import-ready-daily-work.xlsx`);
  if (fs.existsSync(trainingFile)) console.log(`   - import-ready-training.xlsx`);
  console.log('═══════════════════════════════════════\n');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
