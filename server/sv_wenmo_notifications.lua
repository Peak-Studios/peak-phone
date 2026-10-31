-- Wenmo-style phone notifications when bank deposits are received via AddMoneyToAccount
-- Skips: Deposit (player at ATM), WENMO (handled in sv_wenmo.lua), IgnoreTransaction

local TypeMessages = {
    PAYCHECK = "%s paycheck deposited",
    ["TRANSFER"] = "%s bank transfer received",
    PAYMENT = "%s payment received",
    SALES = "%s from sale deposited",
    PURCHASE = "%s payment received",
    CRYPTO_SELL = "%s from crypto sale deposited",
    SELL = "%s from sale deposited",
    DEPOSIT = "%s deposited",
}

RegisterNetEvent("peak-financials:Server:OnMoneyAddedToAccount")
AddEventHandler("peak-financials:Server:OnMoneyAddedToAccount", function(AccountId, Amount, Type, Comment)
    local TypeStr = type(Type) == "string" and Type:upper() or "DEPOSIT"

    if TypeStr == "DEPOSIT" or TypeStr == "WENMO" then
        return
    end

    local Account = PhoneServices['peak-financials']:GetFinancialAccountById(AccountId)
    if Account == nil or Account.type ~= "Standard" then
        return
    end

    local Player = Peak.Functions.GetPlayerByCitizenId(Account.citizenid)
    if Player == nil then
        return
    end

    local FormattedAmount = exports['peak-businesses']:NumberWithCommas(Amount)
    local Message = TypeMessages[TypeStr]
    if Message then
        Message = Message:format(FormattedAmount)
    else
        Message = FormattedAmount .. " deposited to your account"
    end

    TriggerClientEvent("peak-phone:Client:Notification", Player.PlayerData.source, "wenmo-deposit-" .. math.random(111, 999), "fas fa-home", { "white", "rgb(38, 50, 56)" }, "Wenmo", Message)
    TriggerClientEvent("peak-phone:Client:SetAppUnread", Player.PlayerData.source, "wenmo")
end)
