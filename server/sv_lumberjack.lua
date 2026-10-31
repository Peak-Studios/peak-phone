if not Phone.legacyAvailable('lumberjack') then return end
Peak.Functions.CreateCallback("Lumberjack/GetData", function(source, cb)
    local Player = Peak.Functions.GetPlayer(source)
    if not Player then return cb(nil) end

    if GetResourceState('peak-lumberjack') ~= 'started' then
        return cb(nil)
    end

    local data = exports['peak-lumberjack']:GetRepProgress(source)
    if not data then return cb(nil) end
    local repRange = data.nextLevelRep - data.currentLevelRep
    local progress = repRange > 0 and ((data.reputation - data.currentLevelRep) / repRange * 100) or 100

    -- Format data for the phone UI (Lumberjack.svelte)
    local stats = {
        Level = data.level,
        Experience = data.reputation,
        TotalExperience = data.reputation,
        -- TotalEarnings and DailyExperience could be added if peak-lumberjack tracked them
        TotalEarnings = 0, 
        DailyExperience = 0,
        Progress = {
            Current = data.level,
            Next = data.level + 1,
            Progress = math.max(0, math.min(100, progress))
        }
    }

    cb({ data = stats })
end)
