# FIFA World Cup 2026 Hackathon - Stadium AI Copilot Launcher
# Double-click or run this script to boot all services.

# Prepend newly installed Node path to ensure it is in scope
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# Start Express Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd server; `$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; npm run dev" -WindowStyle Normal

# Start Fan React App (Vite)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd fan-app; `$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; npm run dev" -WindowStyle Normal

# Start Staff Dashboard React App (Vite)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd staff-dashboard; `$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host ">>> StadeX LAUNCH SYSTEM ACTIVATED <<<" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "Spawned services in separate terminal windows:"
Write-Host "  [OK] Backend Server  -> http://localhost:3001" -ForegroundColor Green
Write-Host "  [OK] Fan Web App     -> http://localhost:5173" -ForegroundColor Green
Write-Host "  [OK] Staff Dashboard -> http://localhost:5174" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "You can now open the browser and demo the application!" -ForegroundColor Cyan
Write-Host ""
