fx_version 'cerulean'
game 'gta5'
lua54 'yes'
name 'Peak Duo'
author 'Peak Studios'
description 'Peak Duo - open-source foldable phone for ESX, QBCore and Qbox'
repository 'https://github.com/Peak-Studios/peak-phone'
license 'GPL-3.0-only'
version '3.1.0'
ui_page 'web/public/index.html'
files { 'web/public/**/*', 'sql/*.sql', 'stream/peak_duo_live.ytyp', 'stream/peak_duo_broken.ytyp', 'stream/peak_duo_break_v2.ytyp' }
dependencies { '/onesync', 'ox_lib', 'oxmysql', 'peak-bridge', 'peak-duo-prop', 'peak-sim-assets' }

shared_scripts {
    '@ox_lib/init.lua', 'config.lua', 'shared/settings.lua', 'shared/portable.lua',
    'shared/duo_prop.lua', 'shared/kilogram-live.lua', 'shared/sh_break_timing.lua', 'jobs/settings.lua', 'jobs/validation.lua'
}
server_scripts {
    'server/turn.js', '@oxmysql/lib/MySQL.lua', 'sv_config.lua',
    'bridge/database.lua', 'bridge/server.lua', 'server/owner_config.lua', 'bridge/schema.lua', 'bridge/services.lua',
    'bridge/wallet.lua',
    'integrations/server.lua', 'server/duo_prop.lua',
    'server/_sv_main.lua', 'server/sv_simcard.lua', 'server/sv_devices.lua', 'server/sv_device_backup.lua', 'server/sv_break.lua', 'server/sv_calls.lua',
    'server/sv_webrtc.lua', 'server/sv_contacts.lua', 'server/sv_facetime.lua',
    'server/sv_crypto.lua', 'server/sv_details.lua', 'server/sv_document.lua', 'server/sv_media.lua',
    'server/sv_doj.lua', 'server/sv_sharedrop.lua', 'server/sv_gallery.lua', 'server/sv_groups.lua',
    'server/sv_mails.lua', 'server/sv_messages.lua', 'server/sv_voice_memos.lua', 'server/sv_news.lua',
    'server/sv_peakify.lua', 'server/sv_music_search.lua', 'server/sv_pinger.lua', 'server/sv_findmy.lua', 'server/sv_services.lua',
    'server/sv_vehicles.lua', 'server/sv_wenmo.lua', 'server/sv_y.lua', 'server/sv_yellowpages.lua',
    'server/sv_social.lua', 'server/sv_kilogram_live.lua',
    'server/sv_busters.lua', 'server/sv_cars.lua', 'server/sv_debt.lua',
    'server/sv_housing.lua', 'jobs/server.lua', 'server/sv_lumberjack.lua', 'server/sv_tierup.lua'
}
client_scripts {
    'bridge/client.lua', 'integrations/client.lua', 'client/*.lua'
}

data_file 'DLC_ITYP_REQUEST' 'stream/peak_duo_live.ytyp'

data_file 'DLC_ITYP_REQUEST' 'stream/peak_duo_broken.ytyp'

data_file 'DLC_ITYP_REQUEST' 'stream/peak_duo_break_v2.ytyp'
