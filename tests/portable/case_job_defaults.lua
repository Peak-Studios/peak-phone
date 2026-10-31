base('qbcore');loadrel('jobs/settings.lua');loadrel('jobs/validation.lua')
local ids={};eq(#JOB_DEFAULTS,6)
for _,d in ipairs(JOB_DEFAULTS) do
 local valid,why=Phone.JobSchema.validate(d);check(valid,why);check(not ids[d.id],'Unique default ID');ids[d.id]=true
 check(#valid.steps>1);check(valid.enabled==true)
end
