$DiscordWebhook = "https://discordapp.com/api/webhooks/1467793197647528141/fhTQQ6KvTVLv9UutC8jq4tza54d9eO3qz29sucV9YM8RmzB3Xl9nbwlOk1pNk_0mUaap"

function Send-DiscordAlert {
    param(
        [string]$Title,
        [string]$Message,
        [string]$Url
    )

    $payload = @{
        embeds = @(
            @{
                title = $Title
                description = $Message
                url = $Url
                color = 5814783
            }
        )
    } | ConvertTo-Json -Depth 5

    Invoke-RestMethod `
        -Uri $DiscordWebhook `
        -Method Post `
        -ContentType "application/json" `
        -Body $payload
}
