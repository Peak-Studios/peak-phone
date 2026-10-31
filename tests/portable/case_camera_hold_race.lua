-- A dictionary arriving late must not replay the ordinary hold over GTA selfie.
Phone={Client={Generation=1,Ready=true},ShareDropActive=false}
IsPhoneOpen=true;InCamera=false;CallData=nil
local loaded=false;local played=0;local added=0
function RequestAnimDict()end
function HasAnimDictLoaded()return loaded end
function PlayerPedId()return 1 end
function TaskPlayAnim()played=played+1 end
function StopAnimTask()end
PhoneServices={['peak-assets']={AddProp=function()added=added+1 end,RemoveProp=function()end}}
Citizen={Wait=function()loaded=true;InCamera=true end}
loadrel('client/cl_anim.lua')
StartPhoneAnim();eq(played,0,'Late phone hold does not replace the native camera pose');eq(added,0)
StartPhoneAnim();eq(played,0,'Opening a hold during Camera is ignored')
InCamera=false;StartPhoneAnim();eq(played,1);eq(added,1)
