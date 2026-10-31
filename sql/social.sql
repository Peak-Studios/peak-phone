-- Peak Phone 2.2: additive social tables. Back up first. Safe to import repeatedly.
-- All times are server-generated Unix milliseconds. No framework-owned tables change.
CREATE TABLE IF NOT EXISTS peak_phone_social_profiles (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT,
 app VARCHAR(16) NOT NULL,
 citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 handle VARCHAR(24) NOT NULL,
 display_name VARCHAR(60) NOT NULL,
 bio VARCHAR(500) NOT NULL DEFAULT '',
 avatar VARCHAR(2048) NOT NULL DEFAULT '',
 photos TEXT NOT NULL,
 prompts TEXT NOT NULL,
 interests TEXT NOT NULL,
 hidden TINYINT NOT NULL DEFAULT 0,
 suspended TINYINT NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY social_character(app,citizenid), UNIQUE KEY social_handle(app,handle),
 KEY social_discover(app,suspended,hidden,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS peak_phone_social_posts (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT,
 profile_id INT UNSIGNED NOT NULL,
 kind VARCHAR(12) NOT NULL,
 caption VARCHAR(2200) NOT NULL DEFAULT '',
 media TEXT NOT NULL,
 client_nonce VARCHAR(64) NOT NULL,
 expires_at BIGINT NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY social_post_nonce(profile_id,client_nonce),
 KEY social_feed(kind,id), KEY social_profile_posts(profile_id,id), KEY social_expiry(expires_at),
 CONSTRAINT social_post_owner FOREIGN KEY(profile_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS peak_phone_social_highlights (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT,
 profile_id INT UNSIGNED NOT NULL,
 title VARCHAR(48) NOT NULL,
 created_at BIGINT NOT NULL,
 PRIMARY KEY(id), KEY social_highlight_profile(profile_id,id),
 CONSTRAINT social_highlight_owner FOREIGN KEY(profile_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS peak_phone_social_highlight_stories (
 highlight_id INT UNSIGNED NOT NULL, post_id INT UNSIGNED NOT NULL, position INT UNSIGNED NOT NULL,
 PRIMARY KEY(highlight_id,post_id),
 CONSTRAINT social_highlight_collection FOREIGN KEY(highlight_id) REFERENCES peak_phone_social_highlights(id) ON DELETE CASCADE,
 CONSTRAINT social_highlight_story FOREIGN KEY(post_id) REFERENCES peak_phone_social_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS peak_phone_social_likes (
 profile_id INT UNSIGNED NOT NULL, post_id INT UNSIGNED NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(profile_id,post_id), KEY social_likes_post(post_id),
 CONSTRAINT social_like_owner FOREIGN KEY(profile_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_like_post FOREIGN KEY(post_id) REFERENCES peak_phone_social_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_social_saves (
 profile_id INT UNSIGNED NOT NULL, post_id INT UNSIGNED NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(profile_id,post_id), KEY social_saves_post(post_id),
 CONSTRAINT social_save_owner FOREIGN KEY(profile_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_save_post FOREIGN KEY(post_id) REFERENCES peak_phone_social_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_social_follows (
 profile_id INT UNSIGNED NOT NULL, target_id INT UNSIGNED NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(profile_id,target_id), KEY social_follow_target(target_id),
 CONSTRAINT social_follow_owner FOREIGN KEY(profile_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_follow_target_fk FOREIGN KEY(target_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_social_comments (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT, profile_id INT UNSIGNED NOT NULL, post_id INT UNSIGNED NOT NULL,
 body VARCHAR(1000) NOT NULL, client_nonce VARCHAR(64) NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY social_comment_nonce(profile_id,client_nonce), KEY social_comment_post(post_id,id),
 CONSTRAINT social_comment_owner FOREIGN KEY(profile_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_comment_post_fk FOREIGN KEY(post_id) REFERENCES peak_phone_social_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS peak_phone_social_swipes (
 profile_id INT UNSIGNED NOT NULL, target_id INT UNSIGNED NOT NULL, decision VARCHAR(8) NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(profile_id,target_id), KEY social_swipe_target(target_id,profile_id,decision),
 CONSTRAINT social_swipe_owner FOREIGN KEY(profile_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_swipe_target_fk FOREIGN KEY(target_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_social_matches (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT, low_id INT UNSIGNED NOT NULL, high_id INT UNSIGNED NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY social_match_pair(low_id,high_id), KEY social_match_high(high_id,id),
 CONSTRAINT social_match_low FOREIGN KEY(low_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_match_high_fk FOREIGN KEY(high_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_social_messages (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT, sender_id INT UNSIGNED NOT NULL, recipient_id INT UNSIGNED NOT NULL,
 match_id INT UNSIGNED NULL, body VARCHAR(2000) NOT NULL, client_nonce VARCHAR(64) NOT NULL,
 created_at BIGINT NOT NULL, read_at BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(id), UNIQUE KEY social_message_nonce(sender_id,client_nonce),
 KEY social_message_out(sender_id,recipient_id,id), KEY social_message_in(recipient_id,sender_id,id),
 CONSTRAINT social_msg_sender FOREIGN KEY(sender_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_msg_recipient FOREIGN KEY(recipient_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_msg_match FOREIGN KEY(match_id) REFERENCES peak_phone_social_matches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS peak_phone_social_blocks (
 profile_id INT UNSIGNED NOT NULL, target_id INT UNSIGNED NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(profile_id,target_id), KEY social_block_target(target_id),
 CONSTRAINT social_block_owner FOREIGN KEY(profile_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_block_target_fk FOREIGN KEY(target_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_social_activity (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT, profile_id INT UNSIGNED NOT NULL, actor_id INT UNSIGNED NOT NULL,
 kind VARCHAR(16) NOT NULL, post_id INT UNSIGNED NULL, created_at BIGINT NOT NULL, read_at BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(id), KEY social_activity_inbox(profile_id,id),
 CONSTRAINT social_activity_owner FOREIGN KEY(profile_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_activity_actor FOREIGN KEY(actor_id) REFERENCES peak_phone_social_profiles(id) ON DELETE CASCADE,
 CONSTRAINT social_activity_post FOREIGN KEY(post_id) REFERENCES peak_phone_social_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS peak_phone_social_reports (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT, app VARCHAR(16) NOT NULL, reporter_id INT UNSIGNED NOT NULL,
 target_id INT UNSIGNED NOT NULL, post_id INT UNSIGNED NULL, reason VARCHAR(32) NOT NULL,
 detail VARCHAR(500) NOT NULL DEFAULT '', status VARCHAR(12) NOT NULL DEFAULT 'open', created_at BIGINT NOT NULL,
 PRIMARY KEY(id), KEY social_reports_status(status,id), KEY social_reporter(reporter_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS peak_phone_yellowpages (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT, citizenid VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
 sender VARCHAR(100) NOT NULL, phone VARCHAR(20) NOT NULL, title VARCHAR(80) NOT NULL,
 category VARCHAR(20) NOT NULL DEFAULT 'Other', message VARCHAR(2000) NOT NULL,
 image VARCHAR(2048) NOT NULL DEFAULT '', client_nonce VARCHAR(64) NOT NULL,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY yp_nonce(citizenid,client_nonce), KEY yp_owner(citizenid,id), KEY yp_expiry(expires_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
