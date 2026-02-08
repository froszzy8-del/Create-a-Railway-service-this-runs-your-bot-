# =====================================================
# 🟦 TCG DISCORD ALERT SCRIPT (CLEAN VERSION)
# Target + Walmart + eBay Demand Boost
# No BestBuy API • HTML Detection Only
# =====================================================

# ---------------- CONFIG ----------------
$DISCORD_WEBHOOK = "PASTE_YOUR_DISCORD_WEBHOOK_HERE"

$PRODUCT_KEYWORDS = @(
    "pokemon", "booster", "elite trainer", "etb", "display",
    "one piece", "op-", "bandai", "starter deck"
)

$STORES = @(
    @{
        Name = "Target"
        Url  = "https://www.target.com/s?searchTerm=pokemon+trading+cards"
        Match = "Add to cart|Ship it|Pickup today"
    },
    @{
        Name = "Walmart"
        Url  = "https://www.walmart.com/search?q=pokemon+trading+cards"
        Match = "Add to cart|In stock|Pickup today"
    }
)

$EBAY_QUERY = "pokemon tcg booster"

$CHECK_INTERVAL_MIN = 5

# ---------------- HELPERS ----------------
function Send-DiscordAlert {
    param (
        [string]$Title,
        [string]$Message,
        [string]$Url
    )

    $payload = @{
        username = "TCG Monitor"
        embeds = @(
            @{
                title = $Title
                description = $Message
                url = $Url
                color = 5793266
                timestamp = (Get-Date).ToString("o")
            }
        )
    } | ConvertTo-Json -Depth 6

    Invoke-RestMethod -Uri $DISCORD_WEBHOOK `
        -Method POST `
        -ContentType "application/json" `
        -Body $payload
}

# ---------------- EBAY DEMAND BOOST ----------------
function Get-EbayDemand {
    try {
        $html = Invoke-WebRequest `
            -Uri "https://www.ebay.com/sch/i.html?_nkw=$($EBAY_QUERY -replace ' ','+')&LH_Sold=1" `
            -TimeoutSec 10

        $count = ([regex]::Matches($html.Content, "s-item__title")).Count

        if ($count -ge 20) { return "🔥 VERY HIGH" }
        elseif ($count -ge 10) { return "📈 HIGH" }
        elseif ($count -ge 5)  { return "⬆️ MEDIUM" }
        else { return "LOW" }
    }
    catch {
        return "UNKNOWN"
    }
}

# ---------------- STORE POLLING ----------------
foreach ($store in $STORES) {

    try {
        Write-Host "Checking $($store.Name)..."

        $html = Invoke-WebRequest `
            -Uri $store.Url `
            -TimeoutSec 15 `
            -Headers @{ "User-Agent" = "Mozilla/5.0" }

        if ($html.Content -match $store.Match) {

            $demand = Get-EbayDemand

            Send-DiscordAlert `
                -Title "🔥 TCG STOCK DETECTED — $($store.Name)" `
                -Message "Product appears IN STOCK`n`n📊 eBay Demand: $demand" `
                -Url $store.Url
        }
    }
    catch {
        Write-Host "Error polling $($store.Name) (ignored)"
    }
}

# ---------------- HEARTBEAT ----------------
Write-Host "Scan completed at $(Get-Date)"
