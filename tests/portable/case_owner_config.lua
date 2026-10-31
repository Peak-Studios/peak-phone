base('qbcore')
PhoneOwnerConfig={
 Apps={
  Labels={maps='City Map',services='<b>Services</b>'},
  Icons={maps='map',services='https://example.invalid/icon.svg'},
  Defaults={Order={'maps','maps','not-a-phone-app'},Dock={'maps','maps'}},
  JobAccess={services={'police','ambulance'},maps={'police'},settings={'police'},voicememos={'police'},weather={}},
  Hidden={'bin','mails','yellowpages','details','gallery','camera','vehicles','facetime','calls','unknown'},
 },
 Maps={Places={
  {id='hospital',name='City Hospital',area='Pillbox',category='Services',x=307.2,y=-595.3},
  {id='bad_markup',name='<svg onload=alert(1)>',x=0,y=0},
  {id='bad_coordinate',name='Bad Place',x=0/0,y=0},
 }},
 Networks={Labels={pdm='City Motors',unknown='Invalid Network'}},
 Services={Sections={emergency={Title='Emergency Response',Description='responders'}},JobLabels={police='City Police'}},
 News={Title='City News',Tagline='Reporting from town.',NetworkLabels={weazelnews='City News',unknown='Ignored'}},
 Store={FeaturedApp='peakify',FeaturedTitle='Local Radio',Apps={peakify={Description='A <script>bad</script> description',Category='Music'},maps={Description='Not in the Store'}}},
}
loadrel('server/owner_config.lua')
local public=Phone.ownerPublicConfig()
eq(public.apps.labels.maps,'City Map')
eq(public.apps.labels.services,nil,'markup labels are rejected')
eq(public.apps.icons.maps,'map')
eq(public.apps.icons.services,nil,'remote icon URLs are rejected')
eq(public.apps.defaults.order[1],'maps')
eq(public.apps.defaults.order[2],'calls','configured order entries are a prefix')
eq(#public.apps.defaults.order,38,'omitted built-in and installable apps remain in the default order')
eq(#public.apps.defaults.dock,1)
eq(#public.maps.places,1,'invalid map entries are dropped')
eq(public.maps.places[1].id,'hospital')
eq(public.networks.labels.pdm,'City Motors')
eq(public.networks.labels.unknown,nil)
eq(public.services.sections.emergency.title,'Emergency Response')
eq(public.services.sections.tow.title,'Tow','missing sections use safe defaults')
eq(public.news.title,'City News')
eq(public.news.networkLabels.weazelnews,'City News')
eq(public.news.networkLabels.unknown,nil)
eq(public.store.featuredApp,'peakify')
eq(public.store.apps.peakify.description,nil,'HTML Store descriptions are rejected')
eq(public.store.apps.peakify.category,'Music','valid Store metadata survives a bad field')
eq(public.store.apps.maps,nil,'non-Store IDs cannot be curated')
eq(public.apps.jobAccess,nil,'server job allowlists are not sent to clients')

addPlayer(1,'owner-config-allowed')
addPlayer(2,'owner-config-denied')
PLAYERS[2].PlayerData.job.name='unemployed'
eq(Phone.ownerAppAllowed(1,'services'),true)
eq(Phone.ownerAppAllowed(2,'services'),false)
eq(Phone.ownerAppAllowed(2,'bin'),false,'hidden apps are denied server-side')
eq(Phone.ownerAppAllowed(2,'maps'),false,'configured job rules deny the app server-side')
eq(Phone.ownerAppAllowed(2,'weather'),true,'empty job rules are safely ignored')
eq(Phone.ownerAppForRequest('peak-phone:Server:Services:GetEmergencyWorkers',{}),'services')
eq(Phone.ownerAppForRequest('peak-phone:Server:News:GetArticles',{}),'bin')
eq(Phone.ownerAppForRequest('peak-phone:Server:InstallApp',{}),'store')
eq(Phone.ownerAppForRequest('peak-phone:Server:GetVehicles',{}),'cars')
eq(Phone.ownerAppForRequest('peak-phone:Server:Vehicles:GetVehicles',{}),'vehicles')
eq(Phone.ownerAppForRequest('peak-phone:portable:trackVehicle',{}),'vehicles')
eq(Phone.ownerAppForRequest('peak-phone:portable:vehicleAction',{}),'vehicles')
eq(Phone.ownerAppForRequest('peak-phone:Server:GetNetworkState',{}),'settings')
eq(Phone.ownerAppForRequest('peak-phone:Server:Networks:GetNetworks',{}),'settings')
eq(Phone.ownerAppForRequest('peak-phone:Server:Networks:Connect',{}),'settings')
eq(Phone.ownerAppForRequest('peak-phone:Server:Networks:IsNearNetwork',{}),'settings')
eq(Phone.ownerAppForRequest('peak-phone:Server:GetProfilePicture',{}),'contacts')
eq(Phone.ownerAppForRequest('peak-phone:Server:Mails:GetMails',{}),'mails')
eq(Phone.ownerAppForRequest('peak-phone:Server:Mails:SendMail',{}),'mails')
eq(Phone.ownerAppForRequest('peak-phone:Server:YellowPages:PostAd',{}),'yellowpages')
eq(Phone.ownerAppForRequest('peak-phone:Server:Details:GetLicenses',{}),'details')
eq(Phone.ownerAppForRequest('peak-phone:portable:gallery',{'DeletePhoto', {}}),'gallery')
eq(Phone.ownerAppForRequest('peak-phone:portable:gallery',{'PostToTwatter', {Caption='Preview'}}),'gallery','portable Gallery social posts still require Gallery access')
eq(Phone.ownerAppForRequest('peak-phone:Server:Gallery:BeginCapture',{{}}),'camera')
eq(Phone.ownerAppForRequest('peak-phone:Server:Gallery:RequestServerScreenshot',{}),'camera','legacy Gallery screenshot trigger is owned by Camera')
eq(Phone.ownerAppForRequest('peak-phone:Server:Gallery:PostToTwatter',{{Caption='Preview'}}),'gallery','Gallery net event social posts still require Gallery access')
local portableGalleryOwners=Phone.ownerAppsForRequest('peak-phone:portable:gallery',{'PostToTwatter',{Caption='Preview'}})
eq(#portableGalleryOwners,2,'portable Gallery social posts require both owning apps')
eq(portableGalleryOwners[1],'gallery')
eq(portableGalleryOwners[2],'y')
local eventGalleryOwners=Phone.ownerAppsForRequest('peak-phone:Server:Gallery:PostToTwatter',{{Caption='Preview'}})
eq(#eventGalleryOwners,2,'Gallery net-event social posts require both owning apps')
eq(eventGalleryOwners[1],'gallery')
eq(eventGalleryOwners[2],'y')
eq(Phone.ownerAppForRequest('peak-phone:portable:videoDial',{{Phone='5550000000'}}),'facetime')
eq(Phone.ownerAppForRequest('peak-phone:Server:Contacts:DeclineCall',{{CallId='call'}}),nil,'call decline remains an app-independent cleanup route')
eq(Phone.ownerAppForRequest('peak-phone:Server:Messages:DeclineLocation',{{RequestId='request'}}),nil,'location decline remains an app-independent cleanup route')
eq(Phone.ownerAppForRequest('peak-phone:Server:Pinger:DeclinePing',{{PingId='ping'}}),nil,'ping decline remains an app-independent cleanup route')

Phone.Calls={member=function(src,id)
 if id=='video-call' then return {kind='video'} end
 if id=='voice-call' then return {kind='voice'} end
end}
eq(Phone.ownerAppForRequest('peak-phone:portable:answer',{'video-call'},1),'facetime','video answers follow the live server call kind')
eq(Phone.ownerAppForRequest('peak-phone:portable:answer',{'voice-call'},1),'calls','voice answers follow the live server call kind')
eq(Phone.ownerAppForRequest('peak-phone:Server:Contacts:AnswerContact',{{CallId='video-call'}},1),'facetime','shared contact answer route follows the live server call kind')
eq(Phone.ownerAppForRequest('peak-phone:Server:GetWebRTCCredentials',{'voice-call'},1),'calls','shared credential route follows the live server call kind')

Phone.hasPhone=function() return true end
Phone.Devices={active=function(src)return {DeviceId='device-'..src,Status='active',Locked=false,SimId='sim-'..src,PhoneNumber='5550000'..src,Generation=1}end}
local allowed=Phone.authorized(1,'peak-phone:Server:Services:GetEmergencyWorkers',{})
local denied,reason=Phone.authorized(2,'peak-phone:Server:Services:GetEmergencyWorkers',{})
eq(allowed,true,'authorized jobs can reach app callbacks')
eq(denied,false,'job access is checked by the server request guard')
eq(reason,'Your current job does not have access to this app.')
for _,route in ipairs({
 {'peak-phone:Server:Mails:GetMails',{}},
 {'peak-phone:Server:Mails:SendMail',{{}}},
 {'peak-phone:Server:YellowPages:PostAd',{{}}},
 {'peak-phone:Server:Details:GetLicenses',{}},
 {'peak-phone:portable:gallery',{'DeletePhoto',{}}},
 {'peak-phone:Server:Gallery:BeginCapture',{{}}},
 {'peak-phone:portable:videoDial',{{Phone='5550000000'}}},
 {'peak-phone:portable:trackVehicle',{'ABC123'}},
 {'peak-phone:portable:vehicleAction',{'sell', {Plate='ABC123'}}},
 {'peak-phone:Server:Networks:GetNetworks',{}},
}) do
 local routeAllowed=Phone.authorized(2,route[1],route[2])
 eq(routeAllowed,false,'hidden/job-restricted app route is denied: '..route[1])
end
local appGate=Phone.ownerAppAllowed
Phone.ownerAppAllowed=function(_,appId) return appId~='camera' end
eq(Phone.authorized(2,'peak-phone:Server:Gallery:RequestServerScreenshot',{}),false,'Camera restrictions cover the legacy screenshot alias while Gallery stays allowed')
eq(Phone.authorized(2,'peak-phone:Server:Gallery:BeginCapture',{{}}),false,'Camera restrictions cover the current Gallery capture route')
Phone.ownerAppAllowed=function() return true end
eq(Phone.authorized(2,'peak-phone:portable:gallery',{'PostToTwatter',{Caption='Preview'}}),true,'Gallery social post succeeds only when Gallery and Y are allowed')
eq(Phone.authorized(2,'peak-phone:Server:Gallery:PostToTwatter',{{Caption='Preview'}}),true,'Gallery net-event social post succeeds only when Gallery and Y are allowed')
Phone.ownerAppAllowed=function(_,appId) return appId~='y' end
eq(Phone.authorized(2,'peak-phone:portable:gallery',{'PostToTwatter',{Caption='Preview'}}),false,'Y restrictions cover the portable Gallery social-post alias while Gallery stays allowed')
eq(Phone.authorized(2,'peak-phone:Server:Gallery:PostToTwatter',{{Caption='Preview'}}),false,'Y restrictions cover the Gallery net-event social-post alias')
Phone.ownerAppAllowed=function(_,appId) return appId~='gallery' end
eq(Phone.authorized(2,'peak-phone:portable:gallery',{'PostToTwatter',{Caption='Preview'}}),false,'Gallery restrictions cover the portable social-post alias while Y stays allowed')
eq(Phone.authorized(2,'peak-phone:Server:Gallery:PostToTwatter',{{Caption='Preview'}}),false,'Gallery restrictions cover the net-event social-post alias while Y stays allowed')
Phone.ownerAppAllowed=appGate
local deniedVideoAnswer=Phone.authorized(2,'peak-phone:portable:answer',{'video-call'})
local deniedVoiceAnswer=Phone.authorized(2,'peak-phone:portable:answer',{'voice-call'})
eq(deniedVideoAnswer,false,'FaceTime access applies to an active video answer route')
eq(deniedVoiceAnswer,false,'Calls access applies to an active voice answer route')
Phone.Calls=nil
PhoneConfig.Jobs=PhoneConfig.Jobs or {Enabled=false}
eq(Phone.capabilities(2).maps.ownerAccess,false,'job rules reach the UI even for apps outside Phone.AppIds')
Phone.Devices=nil
local deniedWithoutDevice,deviceReason=Phone.authorized(2,'peak-phone:Server:GetNetworkState',{})
eq(deniedWithoutDevice,false,'app job access still applies when device support is unavailable')
eq(deviceReason,'Your current job does not have access to this app.')
local ownerAppAllowed=Phone.ownerAppAllowed
Phone.ownerAppAllowed=function(_,appId) return appId~='maps' end
local deniedFindMy,findMyReason=Phone.authorized(1,'peak-phone:Server:FindMy:GetState',{})
eq(deniedFindMy,false,'the new app job gate runs before Find My device recovery')
eq(findMyReason,'Your current job does not have access to this app.')
Phone.ownerAppAllowed=ownerAppAllowed
eq(Phone.authorized(1,'peak-phone:Server:FindMy:GetState',{}),true,'Find My state keeps its legacy active-device early return')
local deniedListener,listenerReason=Phone.authorized(2,'peak-phone:Server:VoiceMemos:Describe',{})
eq(deniedListener,false,'app job access also applies to the no-phone nearby listener exception')
eq(listenerReason,'Your current job does not have access to this app.')
Phone.Devices={active=function(src)return {DeviceId='device-'..src,Status='active',Locked=false,SimId='sim-'..src,PhoneNumber='5550000'..src,Generation=1}end}

local getVehicles=function() return {} end
EXPORTED.RegisterPhoneAdapter({GetVehicles=getVehicles})
eq(PhoneIntegration.GetVehicles,getVehicles)
eq(Phone.AdapterOwners.GetVehicles,'test-integration')
local callback=function() end
EXPORTED.RegisterPhoneCallback('peak-phone:Server:Example:GetData',callback,'services')
eq(Phone.ownerAppForRequest('peak-phone:Server:Example:GetData',{}),'services')
EXPORTED.RegisterPhoneCallback('my-resource:Server:Phone:GetData',callback)
eq(Phone.IntegrationOwners['my-resource:Server:Phone:GetData'],'test-integration','legacy callback namespaces remain supported')
event('onResourceStop',0,'test-integration')
eq(PhoneIntegration.GetVehicles,nil,'external adapters are removed when their resource stops')
eq(PhoneIntegration.Callbacks['peak-phone:Server:Example:GetData'],nil)
eq(PhoneIntegration.Callbacks['my-resource:Server:Phone:GetData'],nil,'legacy callback namespaces clean up with their provider')
eq(Phone.IntegrationApps['peak-phone:Server:Example:GetData'],nil)
