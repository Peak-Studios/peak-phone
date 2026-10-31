-- Executes the actual Audius search/resolve callbacks with deterministic HTTP,
-- clock and RPC doubles. No live provider requests are made.
local callbacks, requests, timers, dropped, convars, responses, active, now, throwHTTP
TEST_COUNT = 0
local function check(value, message) assert(value, message); TEST_COUNT = TEST_COUNT + 1 end
local function setup(options)
    callbacks, requests, timers, responses, dropped = {}, {}, {}, {}, {}
    convars = options or {}; active = true; now = 1720000000; throwHTTP = false
    os.time = function() return now end
    GetConvar = function(name, default)
        if convars[name] ~= nil then return tostring(convars[name]) end
        return default
    end
    Peak = { Functions = {
        GetPlayer = function(src) return active and {PlayerData={citizenid='CID'..src}} or nil end,
        CreateCallback = function(name, fn)
            check(name=='peak-phone:Server:Peakify:Search' or name=='peak-phone:Server:Peakify:ResolveCatalog','callback name '..name)
            callbacks[name]=fn
        end
    } }
    SetTimeout = function(ms, fn) check(ms==15000,'bounded total timeout'); timers[#timers+1]=fn end
    AddEventHandler = function(name, fn) check(name=='playerDropped','drop cleanup'); dropped[#dropped+1]=fn end
    PerformHttpRequest = function(url, fn, method, body, headers, options)
        if throwHTTP then error('transport failure') end
        check(method=='GET' and body=='' and headers.Accept=='application/json'
            and headers['User-Agent']=='PeakMusic/1.0' and options.followLocation==false,
            'fixed GET, explicit user agent and no redirects')
        requests[#requests+1]={url=url,reply=fn}
    end
    json = {decode=function(body) if body=='BROKEN' then error('bad json') end return responses[body] end}
    dofile('server/sv_music_search.lua')
end
local function search(query, src)
    local output={}; callbacks['peak-phone:Server:Peakify:Search'](src or 1,function(result) output[#output+1]=result end,{Query=query}); return output
end
local function resolve(id, src)
    local output={}; callbacks['peak-phone:Server:Peakify:ResolveCatalog'](src or 1,function(result) output[#output+1]=result end,{Id=id}); return output
end
local function respond(index, data, status)
    local key='response'..index; responses[key]={data=data}; requests[index].reply(status or 200,key)
end
local function track(id, changes)
    local value={id=id,title='Artist - Song',user={name='Artist',is_verified=true,is_available=true,is_deactivated=false},
        is_streamable=true,is_stream_gated=false,is_available=true,is_unlisted=false,is_delete=false,
        duration=191,artwork={['480x480']='https://creatornode.audius.co/artwork/song.jpg'}}
    for key,v in pairs(changes or {}) do value[key]=v end
    return value
end
local a,b='track000001','track000002'

setup();active=false;check(search('fein')[1].Code=='not_ready','search requires current character')
setup();for _,query in ipairs({'f',string.rep('x',121),'has\ncontrol',string.char(255),'  '}) do check(search(query)[1].Code=='invalid_query','invalid query') end
check(#requests==0,'validation before HTTP')
setup()
local first=search("L'Morphine & 17");local second=search("L'Morphine & 17",2)
check(#requests==1,'coalesced search')
check(requests[1].url:find('https://api.audius.co/v1/tracks/search?query=L%27Morphine%20%26%2017',1,true)~=nil,'query encoded to fixed Audius host')
check(not requests[1].url:find('key=',1,true),'no provider key in request')
respond(1,{track(a),track(a),track(b),track('bad-id!',{}),track('unverified',{user={name='Artist',is_verified=false}}),
    track('gated',{is_stream_gated=true}),track('unavailable',{is_available=false}),track('private',{is_unlisted=true})})
check(#first==1 and #second==1 and first[1].Success,'both coalesced waiters resolved once')
check(#first[1].Tracks==2 and first[1].Tracks[1].id==a and first[1].Tracks[2].id==b,'invalid/unavailable tracks excluded and IDs deduplicated')
check(first[1].Provider=='audius' and first[1].Tracks[1].url=='https://api.audius.co/v1/tracks/'..a..'/stream?app_name=PeakMusic','search emits canonical Audius DTO')
local cached=search("L'Morphine & 17",3);check(cached[1].Cached and #requests==1,'shared cache')
for _,timer in ipairs(timers) do timer() end;check(#first==1,'late timeout does not double reply')
now=now+3601;local expired=search("L'Morphine & 17");check(#requests==2 and #expired==0,'TTL expiry refreshes')

setup();local capped=search('many results');local rows={};for i=1,30 do rows[i]=track('id'..i) end
respond(1,rows);check(#capped[1].Tracks==25,'catalog result count is capped')
setup();local timeout=search('fein');timers[1]();check(#timeout==1 and timeout[1].Code=='timeout','timeout settles')
respond(1,{track(a)});check(#requests==1 and #timeout==1,'late provider result ignored')
local retry=search('fein');check(#requests==2 and #retry==0,'timed-out coalescing entry cleared')
setup();local unavailable=search('fein');requests[1].reply(403,'BROKEN');check(unavailable[1].Code=='provider_error','provider error settles safely')
check(search('other song')[1].Code=='provider_busy' and resolve(b)[1].Code=='provider_busy' and #requests==1,'provider circuit breaker is shared by search and resolve')
setup();local malformed=search('fein');requests[1].reply(200,'BROKEN');check(malformed[1].Code=='provider_error','malformed JSON rejected')
setup();throwHTTP=true;local transport=search('fein');check(transport[1].Code=='provider_error','transport exception settles')
setup({peak_music_search_player_per_minute=1});search('one');check(search('two')[1].Code=='rate_limited','player limit')
_G.source=1;for _,fn in ipairs(dropped) do fn() end;check(#search('three')==0 and #requests==2,'disconnect clears player buckets')
setup({peak_music_search_per_minute=1});search('one');check(search('two',2)[1].Code=='quota_guard','global minute limit')
setup({peak_music_search_per_day=1});search('one');now=now+120;check(search('two',2)[1].Code=='quota_guard','global day limit survives minute rollover')
setup({peak_music_search_per_minute=1});local resolveMinute=resolve(a);respond(1,track(a));check(resolveMinute[1].Success and search('another track')[1].Code=='quota_guard','resolve consumes the shared global minute allowance')
setup({peak_music_search_per_day=1});local resolveDay=resolve(a);respond(1,track(a));now=now+120;check(resolveDay[1].Success and search('another day track')[1].Code=='quota_guard','resolve consumes the shared global daily allowance')
for _,status in ipairs({403,429}) do
    setup();local blocked=resolve(a);requests[1].reply(status,'BROKEN')
    check(blocked[1].Code=='unavailable' and search('after resolve')[1].Code=='provider_busy' and resolve(b)[1].Code=='provider_busy' and #requests==1,'resolve provider status '..status..' activates shared backoff')
end
setup();local empty=search('nothing');respond(1,{});check(empty[1].Success and #empty[1].Tracks==0 and #requests==1,'empty search has no second request')
setup();local international=search('international');respond(1,{track(a,{title=string.rep('é',260),user={name='موسيقى',is_verified=true}})})
check(utf8.len(international[1].Tracks[1].title)==255,'provider titles truncate on codepoint boundaries')
check(international[1].Tracks[1].channel=='موسيقى','non-Latin artist retained')

setup();check(resolve('bad-id!')[1].Code=='invalid_track' and #requests==0,'resolve rejects invalid IDs before HTTP')
local resolved=resolve(a);check(#requests==1 and requests[1].url=='https://api.audius.co/v1/tracks/'..a..'?app_name=PeakMusic','resolve uses fixed track endpoint')
respond(1,track(a));check(resolved[1].Success and resolved[1].Track.id==a,'resolve revalidates an available verified track')
setup();local missing=resolve(a);respond(1,track(a,{is_streamable=false}));check(missing[1].Code=='unavailable','resolve rejects unavailable streams')
setup();local changed=resolve(a);active=false;respond(1,track(a));check(changed[1].Code=='not_ready','resolve never replies to a changed character')

local nui={}
RegisterNUICallback=function(name,fn)
    check(name=='Peakify/Search' or name=='Peakify/ResolveCatalog','NUI route '..name);nui[name]=fn
end
Peak.SendCallback=function(name,data)
    check(name=='peak-phone:Server:Peakify:Search' and data.Query=='fein','search NUI forwards only the query')
    return {Success=true,Tracks={}}
end
dofile('client/cl_music_search.lua')
local got;nui['Peakify/Search']({Query='fein'},function(v)got=v end);check(got.Success,'search NUI responds')
nui['Peakify/Search']({Query={}},function(v)got=v end);check(got.Success==false,'search NUI invalid input settles')
Peak.SendCallback=function(name,data)
    check(name=='peak-phone:Server:Peakify:ResolveCatalog' and data.Id==a,'resolve NUI forwards only the ID')
    return {Success=true,Track=track(a)}
end
nui['Peakify/ResolveCatalog']({Id=a},function(v)got=v end);check(got.Success,'resolve NUI responds')
nui['Peakify/ResolveCatalog']({Id='bad-id!'},function(v)got=v end);check(got.Success==false,'resolve NUI invalid input settles')
print('PASS Audius catalog contracts: '..TEST_COUNT..' checks (mocked HTTP, actual Lua modules).')
