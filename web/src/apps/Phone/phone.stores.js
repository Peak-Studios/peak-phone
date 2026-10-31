import { writable } from "svelte/store";

// Global
export const Brand = writable('Android') // Android | iOS
export const HasVpn = writable(false); // false | true
export const HasRacingUsb = writable(true); // false | true
export const HasPDRacingUsb = writable(false); // false | true
export const RacingAlias = writable("");
export const PlayerData = writable({
    Id: 0,
    Cid: '2001',
    Job: 'police'
});

// Modals
export const LoaderModal = writable(false);
export const SuccessModal = writable(false);
export const InputModal = writable({ Visible: false });

// Preferences
export const PhoneBackground = writable("images/defaultwallpaperphone.png");
export const ProfilePicture = writable(null); // Added ProfilePicture store
export const EmbedsEnabled = writable(true);
export const CurrentNetwork = writable("");

// Apps
export const CurrentArticle = writable({})
export const CurrentBusiness = writable({});
export const JobManager = writable({});
export const CurrentDocument = writable({});
export const DocumentIsDrop = writable(false);
export const CurrentChat = writable(false);
export const CurrentGroup = writable(false);
export const ShowGroupInfo = writable(false);
export const InstalledApps = writable({}); // Key-value pair of installed app IDs
