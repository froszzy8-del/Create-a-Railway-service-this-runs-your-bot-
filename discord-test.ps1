$WebhookUrl = "https://discordapp.com/api/webhooks/1467793197647528141/fhTQQ6KvTVLv9UutC8jq4tza54d9eO3qz29sucV9YM8RmzB3Xl9nbwlOk1pNk_0mUaap"

$Body = @{
    content = "PowerShell to Discord connection confirmed"
} | ConvertTo-Json -Depth 2

Invoke-RestMethod `
    -Uri $WebhookUrl `
    -Method Post `
    -Body $Body `
    -ContentType "application/json"
