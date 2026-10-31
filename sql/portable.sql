-- Peak Duo portable schema. MySQL 8 / MariaDB 10.6+, InnoDB, utf8mb4.
-- No framework-owned table is created, truncated or dropped by this file.
CREATE TABLE IF NOT EXISTS peak_phone_backups (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 device_id VARCHAR(32) NOT NULL, contacts LONGTEXT NOT NULL,
 preferences LONGTEXT NOT NULL, created_at BIGINT NOT NULL,
 INDEX idx_phone_backup_owner(citizenid,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_characters (
 citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
 phone_number VARCHAR(20) NOT NULL UNIQUE,
 charinfo LONGTEXT NOT NULL, metadata LONGTEXT NOT NULL, crypto LONGTEXT NOT NULL,
 created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS sim_cards (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, sim_id VARCHAR(20) NOT NULL UNIQUE,
 phone_number VARCHAR(20) NOT NULL UNIQUE, owner_citizenid VARCHAR(128) COLLATE utf8mb4_bin,
 created_at BIGINT NOT NULL DEFAULT 0, inventory_issued TINYINT NOT NULL DEFAULT 0,
 INDEX idx_sim_owner (owner_citizenid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_devices (
 device_id VARCHAR(32) NOT NULL PRIMARY KEY,
 owner_citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 label VARCHAR(60) NOT NULL DEFAULT 'Peak Duo',
 sim_id VARCHAR(20) NULL UNIQUE,
 pin_hash CHAR(64) NULL, pin_salt VARCHAR(64) NULL,
 recovery_hash CHAR(64) NULL, recovery_salt VARCHAR(64) NULL,
 failed_unlocks INT NOT NULL DEFAULT 0, locked_until BIGINT NOT NULL DEFAULT 0,
 status VARCHAR(16) NOT NULL DEFAULT 'active', inventory_mode VARCHAR(16) NOT NULL DEFAULT 'count', inventory_slot INT,
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 INDEX idx_device_owner (owner_citizenid), INDEX idx_device_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_device_access (
 device_id VARCHAR(32) NOT NULL,
 citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 access_type VARCHAR(16) NOT NULL DEFAULT 'borrowed',
 granted_by VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 expires_at BIGINT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(device_id,citizenid), INDEX idx_device_access_cid (citizenid,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_device_sessions (
 citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
 device_id VARCHAR(32) NOT NULL, generation BIGINT NOT NULL DEFAULT 1,
 unlocked TINYINT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL,
 INDEX idx_device_session_device (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_contacts (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 name VARCHAR(100) NOT NULL, phone VARCHAR(20) NOT NULL, INDEX idx_contacts_cid (citizenid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Find My stores consent and identity bindings only. Coordinates are sampled
-- from the online server ped and are never written to this table.
CREATE TABLE IF NOT EXISTS peak_phone_location_shares (
 share_id VARCHAR(48) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
 owner_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 owner_sim_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 owner_sim_id VARCHAR(20) COLLATE utf8mb4_bin NOT NULL,
 owner_phone VARCHAR(20) NOT NULL,
 owner_device_id VARCHAR(32) COLLATE utf8mb4_bin NOT NULL,
 owner_name VARCHAR(100) NOT NULL,
 target_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 target_sim_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 target_sim_id VARCHAR(20) COLLATE utf8mb4_bin NOT NULL,
 target_phone VARCHAR(20) NOT NULL,
 contact_name VARCHAR(100) NOT NULL,
 target_name VARCHAR(100) NOT NULL,
 duration VARCHAR(16) NOT NULL,
 created_at BIGINT NOT NULL,
 expires_at BIGINT NULL,
 UNIQUE KEY uq_location_share_pair (owner_cid,owner_sim_id,target_cid,target_sim_id),
 INDEX idx_location_share_owner (owner_cid,created_at),
 INDEX idx_location_share_target (target_cid,target_sim_id,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_profiles (
 phone VARCHAR(50) NOT NULL PRIMARY KEY, avatar LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_installed_apps (
 phone VARCHAR(50) NOT NULL, app_id VARCHAR(50) NOT NULL, PRIMARY KEY(phone,app_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_calls (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 phone VARCHAR(20) NOT NULL, contact VARCHAR(100) NOT NULL, incoming TINYINT NOT NULL DEFAULT 0,
 timestamp BIGINT NOT NULL, session_id VARCHAR(80), status VARCHAR(20),
 INDEX idx_calls_cid (citizenid), UNIQUE KEY idx_call_session (citizenid,session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_messages (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, from_phone VARCHAR(20) NOT NULL, to_phone VARCHAR(20) NOT NULL,
 message MEDIUMTEXT NOT NULL, attachments LONGTEXT NOT NULL, unread TINYINT NOT NULL DEFAULT 1,
 timestamp BIGINT NOT NULL DEFAULT 0, client_nonce VARCHAR(80), reply_to INT,
 UNIQUE KEY uq_msg_nonce (from_phone,client_nonce), INDEX idx_msg_from (from_phone,timestamp,id),
 INDEX idx_msg_to (to_phone,timestamp,id), INDEX idx_msg_pair (from_phone,to_phone,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_message_reactions (
 message_id INT NOT NULL, actor_phone VARCHAR(20) NOT NULL, reaction VARCHAR(24) NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY (message_id,actor_phone), INDEX idx_message_reactions_actor (actor_phone,message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_group_message_reactions (
 message_id INT NOT NULL, actor_phone VARCHAR(20) NOT NULL, reaction VARCHAR(24) NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY (message_id,actor_phone), INDEX idx_group_reaction_message(message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_conversation_preferences (
 owner_phone VARCHAR(20) NOT NULL, peer_phone VARCHAR(20) NOT NULL, muted TINYINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL, PRIMARY KEY (owner_phone,peer_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_y_posts (
 id BIGINT NOT NULL PRIMARY KEY, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL, name VARCHAR(100) NOT NULL,
 sender VARCHAR(100) NOT NULL, avatar VARCHAR(2048) NOT NULL DEFAULT '', message VARCHAR(1000) NOT NULL DEFAULT '',
 images LONGTEXT NOT NULL, kind VARCHAR(16) NOT NULL, reply_to BIGINT, quote_id BIGINT, repost_of BIGINT,
 created_at BIGINT NOT NULL, deleted_at BIGINT, INDEX idx_y_feed (deleted_at,id), INDEX idx_y_profile (citizenid,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_y_reactions (
 post_id BIGINT NOT NULL, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL, kind VARCHAR(16) NOT NULL,
 created_at BIGINT NOT NULL, PRIMARY KEY (post_id,citizenid,kind), INDEX idx_y_reaction_actor (citizenid,post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_y_notifications (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 actor_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL, kind VARCHAR(24) NOT NULL, post_id BIGINT,
 sender VARCHAR(100) NOT NULL, text VARCHAR(1000) NOT NULL DEFAULT '', created_at BIGINT NOT NULL, read_at BIGINT,
 INDEX idx_y_notice_owner (citizenid,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_y_reports (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, post_id BIGINT NOT NULL, reporter_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 reason VARCHAR(40) NOT NULL DEFAULT 'reported', detail VARCHAR(500) NOT NULL DEFAULT '', status VARCHAR(16) NOT NULL DEFAULT 'open',
 created_at BIGINT NOT NULL, resolved_at BIGINT, resolved_by VARCHAR(128) COLLATE utf8mb4_bin,
 UNIQUE KEY uq_y_reporter (post_id,reporter_cid), INDEX idx_y_report_status (status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_y_moderation_audit (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, actor_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 action VARCHAR(40) NOT NULL, target_type VARCHAR(30) NOT NULL, target_id VARCHAR(80) NOT NULL,
 detail VARCHAR(500) NOT NULL DEFAULT '', created_at BIGINT NOT NULL, INDEX idx_y_audit_time(created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_media (
 id VARCHAR(64) NOT NULL PRIMARY KEY, owner_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL, operation_id VARCHAR(80) NOT NULL,
 provider VARCHAR(32) NOT NULL, object_key VARCHAR(255), public_url VARCHAR(2048), thumbnail_url VARCHAR(2048),
 mime VARCHAR(100) NOT NULL, media_type VARCHAR(16) NOT NULL, size_bytes BIGINT NOT NULL, duration_ms INT,
 width INT, height INT, checksum CHAR(64), visibility VARCHAR(16) NOT NULL DEFAULT 'private', status VARCHAR(24) NOT NULL,
 upload_token_hash CHAR(64), upload_expires_at BIGINT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, deleted_at BIGINT,
 UNIQUE KEY uq_media_operation (owner_cid,operation_id), INDEX idx_media_owner (owner_cid,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_media_references (
 media_id VARCHAR(64) NOT NULL, owner_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL, destination_type VARCHAR(24) NOT NULL,
 destination_id VARCHAR(128) NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY (media_id,destination_type,destination_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_groups (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, group_id VARCHAR(50) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL, creator_phone VARCHAR(20) NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_group_members (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, group_id VARCHAR(50) NOT NULL, phone VARCHAR(20) NOT NULL,
 joined_at BIGINT NOT NULL, is_admin TINYINT NOT NULL DEFAULT 0, UNIQUE KEY idx_group_phone (group_id,phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_group_messages (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, group_id VARCHAR(50) NOT NULL, sender_phone VARCHAR(20) NOT NULL,
 message MEDIUMTEXT NOT NULL, attachments LONGTEXT, client_nonce VARCHAR(80), timestamp BIGINT NOT NULL,
 reply_to INT NULL,
 UNIQUE KEY idx_group_sender_nonce (group_id,sender_phone,client_nonce), INDEX idx_group_time (group_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_group_read_status (
 group_id VARCHAR(50) NOT NULL, phone VARCHAR(20) NOT NULL, last_read_timestamp BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(group_id,phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_mails (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 sender VARCHAR(150), subject VARCHAR(150), message MEDIUMTEXT, `read` TINYINT NOT NULL DEFAULT 0,
 timestamp BIGINT NOT NULL DEFAULT 0, button TEXT, INDEX idx_mail_cid (citizenid,timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_documents (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 type INT NOT NULL, title VARCHAR(150) NOT NULL, content MEDIUMTEXT NOT NULL,
 signatures LONGTEXT, sharees LONGTEXT, finalized TINYINT NOT NULL DEFAULT 0,
 INDEX idx_docs_cid (citizenid,type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_newsarticles (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, network VARCHAR(80) NOT NULL, title VARCHAR(150) NOT NULL,
 content MEDIUMTEXT NOT NULL, images LONGTEXT, author VARCHAR(150),
 author_cid VARCHAR(128) COLLATE utf8mb4_bin, timestamp BIGINT NOT NULL DEFAULT 0,
 INDEX idx_news_network (network,timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_photos (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 photo_url LONGTEXT NOT NULL, timestamp BIGINT NOT NULL DEFAULT 0,
 INDEX idx_photos_cid (citizenid,timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_wenmo (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, from_citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 to_citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL, amount BIGINT NOT NULL,
 comment VARCHAR(255), timestamp BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_cash_requests (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 requester_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 requester_phone VARCHAR(20) NOT NULL,
 payer_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 payer_phone VARCHAR(20) NOT NULL,
 group_id VARCHAR(50) NULL,
 amount BIGINT NOT NULL,
 comment VARCHAR(255) NOT NULL DEFAULT '',
 client_nonce VARCHAR(80) NOT NULL,
 operation_id VARCHAR(80) NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending',
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 UNIQUE KEY uq_cash_request_nonce (requester_cid,client_nonce),
 INDEX idx_cash_request_payer (payer_cid,status,created_at),
 INDEX idx_cash_request_requester (requester_cid,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_cash_events (
 operation_id VARCHAR(80) NOT NULL PRIMARY KEY,
 from_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 to_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 from_phone VARCHAR(20) NOT NULL,
 to_phone VARCHAR(20) NOT NULL,
 group_id VARCHAR(50) NULL,
 amount BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 INDEX idx_cash_event_from (from_phone,created_at),
 INDEX idx_cash_event_to (to_phone,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_ledger (
 operation_id VARCHAR(80) NOT NULL PRIMARY KEY, from_citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 to_citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL, amount BIGINT NOT NULL, comment VARCHAR(255),
 status VARCHAR(32) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 INDEX idx_ledger_from (from_citizenid,created_at), INDEX idx_ledger_to (to_citizenid,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS player_twitter_profiles (
 citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
 name VARCHAR(100), username VARCHAR(100), bio VARCHAR(1000), avatar TEXT, banner TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS player_twitter_premium (
 citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY, expiration BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS player_twitter_follows (
 follower_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL, target_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 PRIMARY KEY(follower_cid,target_cid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_tierup (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, members LONGTEXT NOT NULL, experience INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_peakify_tracks (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 url VARCHAR(1024) NOT NULL, title VARCHAR(255) NOT NULL, provider VARCHAR(32) NOT NULL,
 created_at BIGINT NOT NULL, INDEX idx_peakify_tracks_cid (citizenid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_peakify_playlists (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 name VARCHAR(100) NOT NULL, description VARCHAR(255), created_at BIGINT NOT NULL,
 INDEX idx_peakify_playlists_cid (citizenid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_peakify_playlist_tracks (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, playlist_id INT NOT NULL, track_id INT NOT NULL,
 position INT NOT NULL DEFAULT 0, INDEX idx_peakify_playlist_tracks (playlist_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS phone_peakify_playlist_collaborators (
 playlist_id INT NOT NULL, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL, PRIMARY KEY(playlist_id,citizenid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_schema (
 version INT NOT NULL PRIMARY KEY, applied_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS peak_phone_voice_memos (
 id CHAR(37) NOT NULL PRIMARY KEY,
 owner_cid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 operation_id VARCHAR(80) NOT NULL,
 name VARCHAR(100) NOT NULL,
 mime VARCHAR(32) NOT NULL,
 size_bytes INT UNSIGNED NOT NULL,
 duration_ms INT UNSIGNED NOT NULL,
 data_base64 LONGTEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at BIGINT NOT NULL,
 UNIQUE KEY memo_operation (owner_cid,operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
