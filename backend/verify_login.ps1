$start = Get-Date

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth-simple/login" -Method Post -Body (@{
        email = "admin@demo.com"
        password = "demo123"
    } | ConvertTo-Json) -ContentType "application/json"
    
    $end = Get-Date
    $duration = ($end - $start).TotalSeconds
    
    Write-Host "Login Successful!"
    Write-Host "Response Time: $duration seconds"
    Write-Host "Token received: $($response.access_token.Substring(0, 20))..."
} catch {
    Write-Host "Login Failed: $_"
    $end = Get-Date
    $duration = ($end - $start).TotalSeconds
    Write-Host "Time taken until fail: $duration seconds"
}
