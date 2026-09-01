$Api = "http://localhost:8000"

Write-Host "Health"
Invoke-RestMethod "$Api/health" | ConvertTo-Json

Write-Host "Creating call session"
$session = Invoke-RestMethod -Method Post -Uri "$Api/api/sessions" -ContentType "application/json" -Body '{"flow_id":"demo-commerce"}'
$session | Select-Object id,status,pending_input_prompt | Format-List

Write-Host "Sending customer utterance"
$body = @{ value = "quero cancelar minha compra" } | ConvertTo-Json
$result = Invoke-RestMethod -Method Post -Uri "$Api/api/sessions/$($session.id)/input" -ContentType "application/json" -Body $body
$result.variables | ConvertTo-Json
$result.trace | Select-Object seq,type,message | Format-Table -AutoSize
