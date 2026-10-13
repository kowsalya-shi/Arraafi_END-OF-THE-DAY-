import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { readFileSync } from 'fs';

console.log('🧪 Testing Import Functionality\n');
console.log('=' .repeat(80) + '\n');

// Create test Excel files
function createTestFiles() {
  console.log('📝 Creating test Excel files...\n');

  // 1. Tasks Import Test File
  const tasksData = [
    {
      'Task Name': 'Import Test Task 1',
      'Task Code': 'IMP-001',
      'Status': 'yts',
      'Priority': 'high',
      'How': 'Test via automated import',
      'Who': 'Test User',
      'Assigned By': 'System Test',
      'Planned Start Date': '2026-09-08',
      'Planned End Date': '2026-09-15',
      'Actual Start Date': '',
      'Actual End Date': '',
      'Completion %': '0',
      'Dependency': '',
      'Remarks': 'Created by import test script',
      'ETC': '5 days'
    },
    {
      'Task Name': 'Import Test Task 2',
      'Task Code': 'IMP-002',
      'Status': 'wip',
      'Priority': 'medium',
      'How': 'Testing bulk import',
      'Who': 'Test User',
      'Assigned By': 'System Test',
      'Planned Start Date': '2026-09-10',
      'Planned End Date': '2026-09-20',
      'Actual Start Date': '2026-09-10',
      'Actual End Date': '',
      'Completion %': '50',
      'Dependency': 'IMP-001',
      'Remarks': 'Work in progress test',
      'ETC': '3 days'
    }
  ];

  const tasksWS = XLSX.utils.json_to_sheet(tasksData);
  const tasksWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(tasksWB, tasksWS, 'Tasks');
  XLSX.writeFile(tasksWB, 'test_tasks_import.xlsx');
  console.log('✅ Created: test_tasks_import.xlsx (2 tasks)');

  // 2. Daily Work Import Test File
  const dailyWorkData = [
    {
      'Date': '2026-09-08',
      'Action': 'Import Test - Daily Work 1',
      'How': 'Automated testing via script',
      'Who': 'Test User',
      'Assigned By': 'System Test',
      'Start Date': '2026-09-08',
      'Completion Date': '',
      'Status': 'wip',
      'Completion %': '50',
      'Remarks': 'Testing daily work import'
    },
    {
      'Date': '2026-09-08',
      'Action': 'Import Test - Daily Work 2',
      'How': 'Bulk import validation',
      'Who': 'Test User',
      'Assigned By': 'System Test',
      'Start Date': '2026-09-08',
      'Completion Date': '2026-09-08',
      'Status': 'completed',
      'Completion %': '100',
      'Remarks': 'Completed test entry'
    }
  ];

  const dailyWorkWS = XLSX.utils.json_to_sheet(dailyWorkData);
  const dailyWorkWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(dailyWorkWB, dailyWorkWS, 'DailyWork');
  XLSX.writeFile(dailyWorkWB, 'test_daily_work_import.xlsx');
  console.log('✅ Created: test_daily_work_import.xlsx (2 entries)');

  // 3. Training Import Test File
  const trainingData = [
    {
      'Topic': 'Import Test - React Advanced Patterns',
      'Category': 'Frontend Development',
      'Trainer': 'Test Instructor',
      'Start Date': '2026-09-08',
      'End Date': '',
      'Status': 'wip',
      'Progress %': '60',
      'Remarks': 'Learning through import test'
    },
    {
      'Topic': 'Import Test - Database Optimization',
      'Category': 'Backend Development',
      'Trainer': 'Test Trainer',
      'Start Date': '2026-09-01',
      'End Date': '2026-09-07',
      'Status': 'completed',
      'Progress %': '100',
      'Remarks': 'Completed test training'
    }
  ];

  const trainingWS = XLSX.utils.json_to_sheet(trainingData);
  const trainingWB = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(trainingWB, trainingWS, 'Training');
  XLSX.writeFile(trainingWB, 'test_training_import.xlsx');
  console.log('✅ Created: test_training_import.xlsx (2 records)\n');
}

// Test import endpoint
async function testImport(endpoint, filePath, entityName) {
  console.log(`\n📤 Testing ${entityName} Import...`);
  console.log('-'.repeat(80));

  try {
    const form = new FormData();
    form.append('file', readFileSync(filePath), {
      filename: filePath,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    form.append('userId', '3'); // Kowsalya's ID
    form.append('teamId', '1'); // Test team

    const response = await fetch(`http://localhost:8080/api${endpoint}`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`✅ SUCCESS!`);
      console.log(`   Imported: ${result.imported} record(s)`);
      if (result.summary) {
        console.log(`   Total Rows: ${result.summary.totalRows}`);
        console.log(`   Successful: ${result.summary.successfulImports}`);
        console.log(`   Failed: ${result.summary.failedImports}`);
      }
    } else {
      console.log(`❌ FAILED!`);
      console.log(`   Error: ${result.error}`);
      if (result.details && result.details.length > 0) {
        console.log(`   Validation Errors:`);
        result.details.forEach((err, idx) => {
          console.log(`     ${idx + 1}. Row ${err.row}, Field: ${err.field} - ${err.message}`);
        });
      }
    }
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
  }
}

// Create test file with validation errors
function createInvalidTestFile() {
  console.log('\n\n📝 Creating invalid test file for error validation...\n');

  const invalidData = [
    {
      'Task Name': '', // Missing required field
      'Status': 'invalid_status', // Invalid enum value
      'Completion %': '150', // Out of range
    },
    {
      'Task Name': 'Valid Task',
      'Status': 'yts',
      'Completion %': '50',
    }
  ];

  const ws = XLSX.utils.json_to_sheet(invalidData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
  XLSX.writeFile(wb, 'test_tasks_invalid.xlsx');
  console.log('✅ Created: test_tasks_invalid.xlsx (with validation errors)');
}

// Main test execution
async function runTests() {
  try {
    // Create test files
    createTestFiles();
    createInvalidTestFile();

    console.log('\n' + '='.repeat(80));
    console.log('🚀 Starting Import Tests...');
    console.log('='.repeat(80));

    // Test 1: Tasks Import
    await testImport('/tasks/import', 'test_tasks_import.xlsx', 'Tasks');

    // Test 2: Daily Work Import
    await testImport('/daily-work/import', 'test_daily_work_import.xlsx', 'Daily Work');

    // Test 3: Training Import
    await testImport('/training/import', 'test_training_import.xlsx', 'Training');

    // Test 4: Invalid Data Import (should fail with validation errors)
    await testImport('/tasks/import', 'test_tasks_invalid.xlsx', 'Tasks (Invalid Data)');

    console.log('\n' + '='.repeat(80));
    console.log('✅ All tests completed!');
    console.log('='.repeat(80) + '\n');

    console.log('📊 Test Summary:');
    console.log('  • Valid imports: Should show success messages');
    console.log('  • Invalid import: Should show validation errors');
    console.log('\n📁 Test files created:');
    console.log('  • test_tasks_import.xlsx');
    console.log('  • test_daily_work_import.xlsx');
    console.log('  • test_training_import.xlsx');
    console.log('  • test_tasks_invalid.xlsx');
    console.log('\n💡 You can use these files to test the UI import functionality!');

  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runTests();
