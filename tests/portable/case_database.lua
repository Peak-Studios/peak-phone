base('qbcore');loadrel('bridge/database.lua')
local q,p=PhoneDB.prepare("SELECT '@literal', `@column`, @@session.sql_mode FROM t WHERE a=@a AND b=@b -- @not\n AND c=@c /* @skip */",{['@a']="x' OR 1=1",b=2})
check(q:find("'@literal'",1,true));check(q:find('`@column`',1,true));check(q:find('@@session.sql_mode',1,true));check(q:find('c=NULL',1,true));eq(#p,2);eq(p[1],"x' OR 1=1");eq(p[2],2);check(not q:find('OR 1=1',1,true),'SQL value never interpolated')
q,p=PhoneDB.prepare('SELECT * FROM t WHERE a=? AND b=@name AND c=?',{10,20,name='named'});eq(q,'SELECT * FROM t WHERE a=? AND b=? AND c=?');eq(p[1],10);eq(p[2],'named');eq(p[3],20)
q,p=PhoneDB.prepare('SELECT * FROM t WHERE x=?',{5});eq(p[1],5)
local called;MySQL={query={await=function(sql,values)called={sql,values};return {{ok=1}}end}}
PhoneDB.Ready=true;local rows=PhoneDB.one('SELECT @v',{v=5});eq(rows.ok,1);eq(called[1],'SELECT ?');eq(called[2][1],5)
PhoneDB.Ready=false;PhoneDB.Error='fixture unavailable';local ok=pcall(PhoneDB.wait);eq(ok,false)
endDummy=nil
