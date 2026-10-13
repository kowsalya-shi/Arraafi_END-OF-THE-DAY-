# Test Import Functionality via HTTP requests
Write-Host "`n🧪 Testing Import Functionality" -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Gray

# Test 1: Create a simple CSV file for Tasks
Write-Host "`n📝 Creating test CSV files..." -ForegroundColor Yellow

$tasksCSV = @"
Task Name,Task Code,Status,Priority,Planned Start Date,Planned End Date,Completion %,Remarks
Import Test Task 1,IMP-001,yts,high,2026-09-08,2026-09-15,0,Created by test script
Import Test Task 2,IMP-002,wip,medium,2026-09-10,2026-09-20,50,Work in progress test
"@

$dailyWorkCSV = @"
Date,Action,Status,Completion %,Remarks
2026-09-08,Import Test - Daily Work 1,wip,50,Testing daily work import
2026-09-08,Import Test - Daily Work 2,completed,100,Completed test entry
"@

$trainingCSV = @"
Topic,Category,Trainer,Start Date,End Date,Status,Progress %,Remarks
Import Test - React Patterns,Frontend,Test Instructor,2026-09-08,,wip,60,Learning through import
Import Test - Database,Backend,Test Trainer,2026-09-01,2026-09-07,completed,100,Completed test
"@

# Save CSV files
$tasksCSV | Out-File -FilePath "test_tasks_import.csv" -Encoding UTF8
$dailyWorkCSV | Out-File -FilePath "test_daily_work_import.csv" -Encoding UTF8
$trainingCSV | Out-File -FilePath "test_training_import.csv" -Encoding UTF8

Write-Host "✅ Created: test_tasks_import.csv (2 tasks)" -ForegroundColor Green
Write-Host "✅ Created: test_daily_work_import.csv (2 entries)" -ForegroundColor Green
Write-Host "✅ Created: test_training_import.csv (2 records)" -ForegroundColor Green

Write-Host "`n" + ("=" * 80) -ForegroundColor Gray
Write-Host "🚀 Starting Import Tests..." -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Gray

# Helper function to test import
function Test-Import {
    param(
        [string]$Endpoint,
        [string]$FilePath,
        [string]$EntityName
    )
    
    Write-Host "`n📤 Testing $EntityName Import..." -ForegroundColor Yellow
    Write-Host ("-" * 80) -ForegroundColor Gray
    
    try {
        $boundary = [System.Guid]::NewGuid().ToString()
        $LF = "`r`n"
        
        $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
        $fileName = Split-Path $FilePath -Leaf
        
        $bodyLines = (
            "--$boundary",
            "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
            "Content-Type: text/csv$LF",
            [System.Text.Encoding]::UTF8.GetString($fileBytes),
            "--$boundary",
            "Content-Disposition: form-data; name=`"userId`"$LF",
            "3",
            "--$boundary",
            "Content-Disposition: form-data; name=`"teamId`"$LF",
            "1",
            "--$boundary--$LF"
        ) -join $LF
        
        $response = Invoke-WebRequest `
            -Uri "http://localhost:8080/api$Endpoint" `
            -Method POST `
            -ContentType "multipart/form-data; boundary=$boundary" `
            -Body $bodyLines `
            -UseBasicParsing
        
        $result = $response.Content | ConvertFrom-Json
        
        Write-Host "✅ SUCCESS!" -ForegroundColor Green
        Write-Host "   Imported: $($result.imported) record(s)" -ForegroundColor White
        if ($result.summary) {
            Write-Host "   Total Rows: $($result.summary.totalRows)" -ForegroundColor White
            Write-Host "   Successful: $($result.summary.successfulImports)" -ForegroundColor White
            Write-Host "   Failed: $($result.summary.failedImports)" -ForegroundColor White
        }
    }
    catch {
        Write-Host "❌ FAILED!" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "   Response: $responseBody" -ForegroundColor Red
        }
    }
}

# Run Tests
Test-Import -Endpoint "/tasks/import" -FilePath "test_tasks_import.csv" -EntityName "Tasks"
Test-Import -Endpoint "/daily-work/import" -FilePath "test_daily_work_import.csv" -EntityName "Daily Work"
Test-Import -Endpoint "/training/import" -FilePath "test_training_import.csv" -EntityName "Training"

Write-Host "`n" + ("=" * 80) -ForegroundColor Gray
Write-Host "✅ All tests completed!" -ForegroundColor Green
Write-Host ("=" * 80) -ForegroundColor Gray

Write-Host "`n📊 Test files created:" -ForegroundColor Cyan
Write-Host "  • test_tasks_import.csv" -ForegroundColor White
Write-Host "  • test_daily_work_import.csv" -ForegroundColor White
Write-Host "  • test_training_import.csv" -ForegroundColor White

Write-Host "`n💡 You can use these files to test the UI import functionality!" -ForegroundColor Yellow
Write-Host ""
