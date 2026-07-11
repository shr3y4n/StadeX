# FIFA World Cup 2026 Hackathon - StadeX Production Builder
# Prepend newly installed Node path
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "🚧 INITIATING PRODUCTION BUILD SEQUENCE 🚧" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Magenta

# 1. Build Fan App
Write-Host "Step 1/2: Compiling Fan App..." -ForegroundColor Cyan
cd fan-app
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
& "C:\Program Files\nodejs\npm.cmd" run build

# 2. Build Staff Dashboard
Write-Host ""
Write-Host "Step 2/2: Compiling Staff Dashboard..." -ForegroundColor Cyan
cd ../staff-dashboard
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
& "C:\Program Files\nodejs\npm.cmd" run build

cd ..
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "🎉 PRODUCTION BUILD COMPLETED SUCCESSFULLY! 🎉" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "All assets are now bundled inside the Express backend."
Write-Host "To run the single-container production server:"
Write-Host "  1. Run: cd server; node server.js" -ForegroundColor Yellow
Write-Host "  2. Access the Fan App at: http://localhost:3001/" -ForegroundColor Cyan
Write-Host "  3. Access the Staff Dashboard at: http://localhost:3001/staff/" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host ""
