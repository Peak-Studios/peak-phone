local DroppedNotes, ShowingInteraction = {}, false

function InitDocuments()
    local Result = Peak.SendCallback("peak-phone:Server:Documents:GetDroppedNotes")
    DroppedNotes = type(Result)=="table" and Result or {}
end

RegisterNUICallback("Documents/GetDocuments", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:GetDocuments", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/GetNotesSummary", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:GetNotesSummary", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/GetNotesMetadataPage", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:GetNotesMetadataPage", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/GetNoteDetail", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:GetNoteDetail", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/SaveDocument", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:SaveDocument", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/Finalize", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:Finalize", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/GetDocumentSignatures", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:GetDocumentSignatures", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/RequestSignature", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:RequestSignature", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/SignDocument", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:SignDocument", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/ShareLocal", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:ShareLocal", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/AddSharee", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:AddSharee", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/DeleteDocument", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:DeleteDocument", Data)
    Cb(Result)
end)

RegisterNUICallback("Documents/DropQRCode", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Documents:DropQRCode", Data)
    Cb(Result)
end)

RegisterNetEvent("peak-phone:Client:Documents:ForceDocument")
AddEventHandler("peak-phone:Client:Documents:ForceDocument", function(Data)
    if not IsPhoneOpen then OpenPhone(true, false) end
    SendNUIMessage({
        Action = "Documents/SetDocument",
        Document = Data
    })
end)

RegisterNetEvent("peak-phone:Client:Documents:SetDrop")
AddEventHandler("peak-phone:Client:Documents:SetDrop", function(DropId, Data)
    DroppedNotes[DropId] = Data
end)

Citizen.CreateThread(function()
    while true do
        if #DroppedNotes == 0 then
            Citizen.Wait(1000)
        end

        local NearDistance, NearDropId = false, false
        local Coords = GetEntityCoords(PlayerPedId())

        for k, v in pairs(DroppedNotes) do
            local Distance = #(Coords - v.Coords)

            if Distance < 10.0 then
                DrawMarker(27, v.Coords.x, v.Coords.y, v.Coords.z - 0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 0.2, 2.0, 98, 0, 234, 100, 0, 0, 2, 0, 0, 0, 0)
            end
    
            if not NearDistance or Distance < NearDistance then
                NearDistance, NearDropId = Distance, k
            end
        end

        if NearDistance and NearDistance < 2.0 then
            local Note = DroppedNotes[NearDropId]
            DrawMarker(27, Note.Coords.x, Note.Coords.y, Note.Coords.z - 0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 0.3, 2.0, 98, 0, 234, 100, 0, 0, 2, 0, 0, 0, 0)

            if not ShowingInteraction then
                ShowingInteraction = true
                PhoneServices['peak-ui']:ShowInteraction("[E] Open Note / [F] Delete Note")
            end

            if IsControlJustPressed(0, 38) then
                local Result = Peak.SendCallback("peak-phone:Server:Documents:GetDocumentById", { Id = Note.Id })
                if Result then
                    if not IsPhoneOpen then OpenPhone(true, false) end
                    SendNUIMessage({
                        Action = "Documents/SetDocument",
                        Document = Result,
                        IsDrop = true,
                    })
                end
            end

            if IsControlJustPressed(0, 23) then
                TriggerServerEvent("peak-phone:Server:Documents:DeleteQRCode", NearDropId)
            end
        elseif ShowingInteraction then
            ShowingInteraction = false
            PhoneServices['peak-ui']:HideInteraction()
        end

        if not NearDropId then
            Citizen.Wait(250)
        end

        Citizen.Wait(4)
    end
end)
