# =====================================================
# POKÉMON TCG — DISCORD ALERT SCRIPT
# ZIP: 94080 | Radius: ~150mi (Store locator logic)
# Stores: Target, Walmart, BestBuy, Barnes, Costco
# =====================================================

$DISCORD_WEBHOOK = "https://discordapp.com/api/webhooks/1467793197647528141/fhTQQ6KvTVLv9UutC8jq4tza54d9eO3qz29sucV9YM8RmzB3Xl9nbwlOk1pNk_0mUaap"
$ZIP = "94080"
$CHECK_INTERVAL = 300  # seconds (5 min)

$KEYWORDS = @(
  "pokemon",
  "booster",
  "elite trainer",
  "etb",
  "ultra premium",
  "upc",
  "collection",
  "bundle",
  "display"
)

function Send-DiscordAlert {
    param (
        [string]$Title,
        [string]$Message,
        [string]$Url
    )

    $payload = @{
        embeds = @(
            @{
                title = $Title
                description = "$Message`n`n$Url"
                color = 3447003
            }
        )
    } | ConvertTo-Json -Depth 4

    Invoke-RestMethod `
        -Uri $DISCORD_WEBHOOK `
        -Method Post `
        -Body $payload `
        -ContentType "application/json"
}

function Keyword-Match($text) {
    foreach ($k in $KEYWORDS) {
        if ($text.ToLower().Contains($k)) { return $true }
    }
    return $false
}

Write-Host "Pokemon Discord alert started..."

while ($true) {

    # ---------- TARGET ----------
    try {
        $html = Invoke-WebRequest `
            -Uri "https://www.target.com/s?searchTerm=pokemon+trading+cards" `
            -TimeoutSec 15

        if (Keyword-Match $html.Content) {
            Send-DiscordAlert `
                -Title "Pokemon TCG - Target" `
                -Message "Possible stock detected near ZIP 94080. Manual checkout recommended." `
                -Url "https://www.target.com/s?searchTerm=pokemon+trading+cards"
        }
    } catch {
        Write-Host "Target error ignored"
    }

    # ---------- WALMART ----------
    try {
        $html = Invoke-WebRequest `
            -Uri "https://www.walmart.com/search?q=pokemon+trading+cards" `
            -TimeoutSec 15

        if (Keyword-Match $html.Content) {
            Send-DiscordAlert `
                -Title "Pokemon TCG - Walmart" `
                -Message "Possible stock detected near ZIP 94080. Manual checkout recommended." `
                -Url "https://www.walmart.com/search?q=pokemon+trading+cards"
        }
    } catch {
        Write-Host "Walmart error ignored"
    }

    # ---------- BEST BUY ----------
    try {
        $html = Invoke-WebRequest `
            -Uri "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+trading+cards" `
            -TimeoutSec 15

        if (Keyword-Match $html.Content) {
            Send-DiscordAlert `
                -Title "Pokemon TCG - Best Buy" `
                -Message "Search results detected. Check availability near ZIP 94080." `
                -Url "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+trading+cards"
        }
    } catch {
        Write-Host "BestBuy error ignored"
    }

    # ---------- BARNES & NOBLE ----------
    try {
        $html = Invoke-WebRequest `
            -Uri "https://www.barnesandnoble.com/s/pokemon+trading+card+game" `
            -TimeoutSec 15

        if (Keyword-Match $html.Content) {
            Send-DiscordAlert `
                -Title "Pokemon TCG - Barnes & Noble" `
                -Message "Pokemon listings found. Check local store inventory." `
                -Url "https://www.barnesandnoble.com/s/pokemon+trading+card+game"
        }
    } catch {
        Write-Host "Barnes error ignored"
    }

    # ---------- COSTCO ----------
    try {
        $html = Invoke-WebRequest `
            -Uri "https://www.costco.com/CatalogSearch?keyword=pokemon" `
            -TimeoutSec 15

        if (Keyword-Match $html.Content) {
            Send-DiscordAlert `
                -Title "Pokemon TCG - Costco" `
                -Message "Pokemon product detected. Costco stock is usually limited." `
                -Url "https://www.costco.com/CatalogSearch?keyword=pokemon"
        }
    } catch {
        Write-Host "Costco error ignored"
    }

    Start-Sleep -Seconds $CHECK_INTERVAL
}
