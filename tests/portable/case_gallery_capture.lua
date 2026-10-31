base('qbcore');addPlayer(1,'PHOTO');loadrel('server/sv_gallery.lua')
STARTED['screenshot-basic']=true;CONVARS.phone_media_api_key='fixture-key'
local screenshot,http,inserted,rows
resource('screenshot-basic',{requestClientScreenshot=function(_,src,options,cb)eq(src,1);eq(options.encoding,'jpg');screenshot=cb end})
PerformHttpRequest=function(url,cb,method,body,headers,options)
    http={url=url,cb=cb,method=method,body=body,headers=headers};eq(options.followLocation,false)
end
PhoneDB.one=function()return {n=rows or 0}end
PhoneDB.insert=function(_,values)inserted=values;return 7 end
local function threads()local pending=THREADS;THREADS={};for _,fn in ipairs(pending)do fn()end end
local function begin(id)Phone.Upload.busy={};return rpc('peak-phone:Server:Gallery:BeginCapture',1,id)end
local function completion()for i=#EMITTED,1,-1 do if EMITTED[i].name=='peak-phone:portable:captureComplete' then return EMITTED[i].args end end end
check(begin('one').Success);threads();screenshot(false,'data:image/jpeg;base64,/9j/');eq(http.method,'POST');check(http.headers['User-Agent']);http.cb(200,json.encode({data={url='https://r2.fivemanage.com/image.jpg'}}));threads();eq(inserted[1],'PHOTO');eq(inserted[2],'https://r2.fivemanage.com/image.jpg');eq(completion()[1],'one');eq(completion()[2],true)
check(not rpc('peak-phone:Server:Gallery:BeginCapture',1,'busy').Success)
-- Valid alternate screenshot MIME is retained in the hosted file extension.
check(begin('png').Success);threads();screenshot(false,'data:image/png;base64,iVBORw==');check(json.decode(http.body).filename:match('%.png$'));http.cb(403,'not json');eq(completion()[1],'png');eq(completion()[2],false)
check(begin('bad').Success);threads();screenshot(false,'data:text/html;base64,AAAA');eq(completion()[2],false)
check(begin('timeout').Success);threads();TIMERS[#TIMERS].fn();eq(completion()[1],'timeout');eq(completion()[2],false);local before=#EMITTED;screenshot(false,'data:image/jpeg;base64,/9j/');eq(#EMITTED,before,'Late screenshot is ignored')
CONVARS.phone_media_api_key='';check(not begin('missing').Success);CONVARS.phone_media_api_key='fixture-key'
rows=500;check(begin('full').Success);threads();screenshot(false,'data:image/jpeg;base64,/9j/');http.cb(200,json.encode({data={url='https://r2.fivemanage.com/image.jpg'}}));threads();eq(completion()[2],false);rows=0
local url='https://cdn.discordapp.com/attachments/123/456/photo.png?ex=123&is=456&hm=abcdef'
check(Phone.mediaURL(url));eq(Phone.mediaURL('https://cdn.discordapp.com.evil.invalid/attachments/123/456/p.png'),nil)
local function import(link)Phone.Upload.busy={};local result=nil;Phone.Server.Callbacks['peak-phone:portable:gallery'](1,function(ok)result=ok end,'ImportPhoto',{PhotoUrl=link});return function()return result end end
local result=import(url);eq(result(),nil);eq(http.url,url,'Signed query is retained');eq(http.method,'GET');http.cb(200,'\137PNG\13\10\26\10a');eq(http.method,'POST');eq(json.decode(http.body).base64,'data:image/png;base64,iVBORw0KGgph');http.cb(200,json.encode({data={url='https://r2.fivemanage.com/permanent.png'}}));threads();eq(result(),true);eq(inserted[2],'https://r2.fivemanage.com/permanent.png')
for _,body in ipairs({'GIF89a','GIF89aa','GIF89aaa'}) do
    result=import(url);http.cb(200,body)
    local expected=({['GIF89a']='R0lGODlh',['GIF89aa']='R0lGODlhYQ==',['GIF89aaa']='R0lGODlhYWE='})[body]
    eq(json.decode(http.body).base64,'data:image/gif;base64,'..expected);http.cb(500,'{}');eq(result(),false)
end
result=import(url);http.cb(403,'expired');eq(result(),false)
result=import(url);http.cb(200,'<html>not an image</html>');eq(result(),false)
result=import(url);TIMERS[#TIMERS].fn();eq(result(),false);before=#EMITTED;http.cb(200,'GIF89a');eq(#EMITTED,before)
eq(import('https://cdn.discordapp.com/not-attachments/p.png')(),false)
result=import(url);PLAYERS[1].PlayerData.citizenid='OTHER';http.cb(200,'GIF89a');eq(result(),false)
