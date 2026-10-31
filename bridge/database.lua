-- A single SQL dialect/driver for the phone. Framework tables are NOT rewritten.
PhoneDB = { Ready = false, Error = nil }
local function waitReady()
    local deadline=GetGameTimer()+30000
    while not PhoneDB.Ready do
        if PhoneDB.Error then error('Phone database unavailable: '..PhoneDB.Error) end
        if GetGameTimer()>deadline then error('Phone database initialization timed out. Run phone_doctor in the server console.') end
        Wait(50)
    end
end
-- Convert legacy @named placeholders to positional binds. Unknown/missing values bind SQL NULL.
-- Static SQL literals and comments are preserved; no player-controlled SQL identifiers are accepted.
function PhoneDB.prepare(sql, params)
    assert(type(sql)=='string','SQL must be a string')
    params=params or {}; local out, binds={},{}; local i,pos=1,0; local quote,comment
    local function bind(value)
        if value==nil then out[#out+1]='NULL' else binds[#binds+1]=value;out[#out+1]='?' end
    end
    while i<=#sql do
        local c=sql:sub(i,i);local nx=sql:sub(i+1,i+1)
        if comment then
            out[#out+1]=c
            if comment=='line' and c=='\n' then comment=nil
            elseif comment=='block' and c=='*' and nx=='/' then out[#out+1]=nx;i=i+1;comment=nil end
        elseif quote then
            out[#out+1]=c
            if c=='\\' and quote~='`' then i=i+1;out[#out+1]=sql:sub(i,i)
            elseif c==quote then if nx==quote then i=i+1;out[#out+1]=nx else quote=nil end end
        elseif c=="'" or c=='"' or c=='`' then quote=c;out[#out+1]=c
        elseif (c=='-' and nx=='-' and sql:sub(i+2,i+2):match('%s')) or c=='#' then comment='line';out[#out+1]=c
        elseif c=='/' and nx=='*' then comment='block';out[#out+1]=c
        elseif c=='@' and nx=='@' then out[#out+1]='@@';i=i+1
        elseif c=='@' then
            local key=sql:sub(i):match('^@([%w_]+)')
            if key then
                local value=params['@'..key];if value==nil then value=params[key] end
                bind(value);i=i+#key
            else out[#out+1]=c end
        elseif c=='?' then pos=pos+1;bind(params[pos])
        else out[#out+1]=c end
        i=i+1
    end
    -- Always return a dense bind array. Lua's length operator is undefined for
    -- tables with positional nil holes, so leaving the original params intact
    -- can silently drop values after an optional SQL NULL.
    return table.concat(out),binds
end

function PhoneDB.raw(sql,params)
    local q,p=PhoneDB.prepare(sql,params)
    return MySQL.query.await(q,p)
end
function PhoneDB.query(sql,params) waitReady();return PhoneDB.raw(sql,params) end
function PhoneDB.execute(sql,params,cb)
    if type(params)=='function' then cb=params;params={} end
    -- Preserve ghmattimysql's result shape (SELECT array; writes have affectedRows/insertId).
    if cb then
        CreateThread(function()
            local ok,result=pcall(PhoneDB.query,sql,params)
            if ok then cb(result or {}) else print('[Peak Duo] SQL callback failed: '..tostring(result));cb({affectedRows=0,error=true}) end
        end)
    else return PhoneDB.query(sql,params) end
end
function PhoneDB.insert(sql,params)
    waitReady();local q,p=PhoneDB.prepare(sql,params);return MySQL.insert.await(q,p)
end
function PhoneDB.update(sql,params)
    waitReady();local q,p=PhoneDB.prepare(sql,params);return MySQL.update.await(q,p)
end
function PhoneDB.transaction(queries)
    waitReady();local q={};for _,row in ipairs(queries) do local sql,p=PhoneDB.prepare(row.query,row.values);q[#q+1]={query=sql,values=p} end
    return MySQL.transaction.await(q)
end
function PhoneDB.one(sql,params) local r=PhoneDB.query(sql,params);return r and r[1] end
function PhoneDB.wait() waitReady() end
