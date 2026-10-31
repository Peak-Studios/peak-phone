local tables={
 'peak_phone_social_highlights','peak_phone_social_highlight_stories',
 'peak_phone_social_profiles','peak_phone_social_posts','peak_phone_social_likes','peak_phone_social_saves','peak_phone_social_follows','peak_phone_social_comments','peak_phone_social_swipes','peak_phone_social_matches','peak_phone_social_messages','peak_phone_social_blocks','peak_phone_social_activity','peak_phone_social_reports','peak_phone_yellowpages',
 'peak_phone_characters','sim_cards','peak_phone_devices','peak_phone_device_access','peak_phone_device_sessions','peak_phone_backups','phone_contacts','peak_phone_location_shares','phone_profiles','phone_installed_apps','phone_calls',
 'peak_phone_voice_memos','phone_messages','phone_message_reactions','phone_group_message_reactions','phone_conversation_preferences','peak_phone_y_posts','peak_phone_y_reactions','peak_phone_y_notifications','peak_phone_y_reports','peak_phone_y_moderation_audit','peak_phone_media','peak_phone_media_references','phone_groups','phone_group_members','phone_group_messages','phone_group_read_status','phone_mails',
 'phone_documents','phone_newsarticles','phone_photos','phone_wenmo','phone_cash_requests','phone_cash_events','peak_phone_ledger',
 'player_twitter_profiles','player_twitter_premium','player_twitter_follows','phone_tierup','phone_peakify_tracks',
 'phone_peakify_playlists','phone_peakify_playlist_tracks','phone_peakify_playlist_collaborators','peak_phone_schema',
}
local identifiers={citizenid=true,owner_citizenid=true,from_citizenid=true,to_citizenid=true,follower_cid=true,target_cid=true,author_cid=true,owner_cid=true,owner_sim_cid=true,target_sim_cid=true}
local widths={ phone_mails={sender=150,subject=150},phone_documents={title=150},phone_newsarticles={title=150}, phone_contacts={name=100}, sim_cards={phone_number=20}, peak_phone_characters={phone_number=20}, phone_profiles={phone=20},phone_installed_apps={phone=20},phone_calls={phone=20},phone_messages={from_phone=20,to_phone=20},phone_groups={name=100} }
  local additions={
   sim_cards={inventory_issued='TINYINT NOT NULL DEFAULT 0'},
 phone_group_members={is_admin='TINYINT NOT NULL DEFAULT 0'},
 phone_calls={session_id='VARCHAR(80) NULL',status='VARCHAR(20) NULL'},
 phone_newsarticles={author_cid='VARCHAR(128) COLLATE utf8mb4_bin NULL'},
 peak_phone_devices={recovery_hash='CHAR(64) NULL',recovery_salt='VARCHAR(64) NULL',inventory_mode="VARCHAR(16) NOT NULL DEFAULT 'count'",inventory_slot='INT NULL'},
 phone_messages={client_nonce='VARCHAR(80) NULL',reply_to='INT NULL'},
 phone_group_messages={client_nonce='VARCHAR(80) NULL',reply_to='INT NULL'},
}
CreateThread(function()
    local ok,err=pcall(function()
        -- Wait for oxmysql connection before any legacy initializer runs.
        local untilAt=GetGameTimer()+30000
        while not Phone.started('oxmysql') do if GetGameTimer()>untilAt then error('oxmysql is not started') end;Wait(100) end
        -- Stock qb-phone also owns a table named phone_messages, but stores one JSON
        -- conversation blob per character instead of Duo's row-per-message schema.
        -- Preserve it under an explicit legacy name before creating Duo's table.
        local legacyMessages=PhoneDB.raw('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',{'phone_messages'})
        local legacyColumns={}
        for _,column in ipairs(legacyMessages or {}) do legacyColumns[column.COLUMN_NAME]=true end
        if legacyColumns.citizenid and legacyColumns.number and legacyColumns.messages and not legacyColumns.from_phone and not legacyColumns.to_phone then
            if not PhoneConfig.AutoMigrate then error('phone_messages belongs to qb-phone; enable AutoMigrate after a backup to preserve and rename it') end
            local existing=PhoneDB.raw('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',{'qb_phone_messages_legacy'})
            if existing and #existing>0 then error('Both qb-phone and preserved qb_phone_messages_legacy tables exist; manual review required') end
            PhoneDB.raw('RENAME TABLE `phone_messages` TO `qb_phone_messages_legacy`',{})
            print('^3[Peak Duo] Preserved the incompatible qb-phone phone_messages table as qb_phone_messages_legacy.^7')
        end
        if PhoneConfig.AutoMigrate then
            -- Both controlled files contain plain CREATE TABLE statements, without procedures.
            for _,path in ipairs({'sql/portable.sql','sql/social.sql'}) do
                local script=assert(LoadResourceFile(GetCurrentResourceName(),path),path..' missing')
                script=script:gsub('%-%-[^\n]*','')
                for statement in script:gmatch('([^;]+);') do if statement:find('%S') then PhoneDB.raw(statement,{}) end end
            end
        end
        for _,name in ipairs(tables) do
            local columns=PhoneDB.raw('SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_TYPE, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',{name})
            if not columns or #columns==0 then error('Missing table '..name..'. Import sql/portable.sql or enable AutoMigrate.') end
            local present={}
            for _,c in ipairs(columns) do
                present[c.COLUMN_NAME]=true
                if c.COLUMN_NAME=='timestamp' and (c.DATA_TYPE=='datetime' or c.DATA_TYPE=='timestamp') then
                    if not PhoneConfig.AutoMigrate then error(name..'.timestamp uses a legacy date type; enable AutoMigrate after a backup') end
                    PhoneDB.raw(('ALTER TABLE `%s` CHANGE COLUMN `timestamp` `duo_legacy_timestamp` %s NULL, ADD COLUMN `timestamp` BIGINT NOT NULL DEFAULT 0'):format(name,c.COLUMN_TYPE),{})
                    present.duo_legacy_timestamp=true
                end
                -- WebM voice notes are bounded at 80 kB; legacy TEXT is only 65,535 bytes.
                if (name=='phone_messages' or name=='phone_group_messages') and c.COLUMN_NAME=='message' and (c.DATA_TYPE=='text' or c.DATA_TYPE=='tinytext' or c.DATA_TYPE=='varchar') then
                    if not PhoneConfig.AutoMigrate then error(name..'.message must be MEDIUMTEXT for bounded voice notes') end
                    PhoneDB.raw(('ALTER TABLE `%s` MODIFY `message` MEDIUMTEXT NOT NULL'):format(name),{})
                end
                local minimum=identifiers[c.COLUMN_NAME] and 128 or (widths[name] and widths[name][c.COLUMN_NAME])
                if minimum and tonumber(c.CHARACTER_MAXIMUM_LENGTH) and tonumber(c.CHARACTER_MAXIMUM_LENGTH)<minimum then
                    if not PhoneConfig.AutoMigrate then error(name..'.'..c.COLUMN_NAME..' must be widened to VARCHAR('..minimum..')') end
                    local null=c.IS_NULLABLE=='YES' and 'NULL' or 'NOT NULL'
                    PhoneDB.raw(('ALTER TABLE `%s` MODIFY `%s` VARCHAR(%d) COLLATE utf8mb4_bin %s'):format(name,c.COLUMN_NAME,minimum,null),{})
                end
            end
            if present.duo_legacy_timestamp then
                PhoneDB.raw(('UPDATE `%s` SET `timestamp`=COALESCE(UNIX_TIMESTAMP(duo_legacy_timestamp)*1000,0) WHERE `timestamp`=0 AND duo_legacy_timestamp IS NOT NULL'):format(name),{})
            end
            for col,definition in pairs(additions[name] or {}) do
                if not present[col] then
                    if not PhoneConfig.AutoMigrate then error('Missing column '..name..'.'..col..'; enable AutoMigrate for the additive upgrade') end
                    PhoneDB.raw(('ALTER TABLE `%s` ADD COLUMN `%s` %s'):format(name,col,definition),{})
                end
            end
        end
        local function uniqueIndex(name,tableName,columns,nullable)
            local existing=PhoneDB.raw(("SHOW INDEX FROM `%s` WHERE Key_name='%s'"):format(tableName,name),{}) or {}
            if #existing>0 then
                table.sort(existing,function(a,b)return tonumber(a.Seq_in_index)<tonumber(b.Seq_in_index) end)
                if #existing~=#columns then error('Incorrect index '..tableName..'.'..name) end
                for i,column in ipairs(columns) do
                    if existing[i].Column_name~=column or tonumber(existing[i].Non_unique)~=0 then error('Incorrect index '..tableName..'.'..name) end
                end
                return
            end
            if not PhoneConfig.AutoMigrate then error('Missing unique index '..tableName..'.'..name..'; enable AutoMigrate after a backup') end
            local cols=table.concat(columns,',')
            local where=nullable and (' WHERE '..nullable..' IS NOT NULL') or ''
            local duplicates=PhoneDB.raw(('SELECT %s,COUNT(*) n FROM `%s`%s GROUP BY %s HAVING COUNT(*)>1 LIMIT 1'):format(cols,tableName,where,cols),{})
            if duplicates and #duplicates>0 then error('Duplicate rows prevent unique index '..tableName..'.'..name..'; reconcile the existing data before migration') end
            PhoneDB.raw(('ALTER TABLE `%s` ADD UNIQUE KEY `%s`(%s)'):format(tableName,name,cols),{})
        end
        uniqueIndex('idx_call_session','phone_calls',{'citizenid','session_id'},'session_id')
        uniqueIndex('idx_group_sender_nonce','phone_group_messages',{'group_id','sender_phone','client_nonce'},'client_nonce')
        uniqueIndex('uq_group_message_reaction_actor','phone_group_message_reactions',{'message_id','actor_phone'})
        uniqueIndex('uq_msg_nonce','phone_messages',{'from_phone','client_nonce'},'client_nonce')
        uniqueIndex('uq_media_operation','peak_phone_media',{'owner_cid','operation_id'})
        uniqueIndex('uq_cash_request_nonce','phone_cash_requests',{'requester_cid','client_nonce'})
        uniqueIndex('uq_cash_event_operation','phone_cash_events',{'operation_id'})
        uniqueIndex('uq_location_share_pair','peak_phone_location_shares',{'owner_cid','owner_sim_id','target_cid','target_sim_id'})
        PhoneDB.raw('INSERT IGNORE INTO peak_phone_schema (version,applied_at) VALUES (1,?)',{os.time()*1000})
    end)
    if not ok then PhoneDB.Error=tostring(err);print('^1[Peak Duo] DATABASE NOT READY: '..PhoneDB.Error..'^7');return end
    PhoneDB.Ready=true
    print('^2[Peak Duo] Phone schema ready; framework-owned tables were not changed.^7')
end)
