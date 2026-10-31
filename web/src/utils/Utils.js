// NUI Functions
import { get, writable } from "svelte/store";
import { SuccessModal } from "../apps/Phone/phone.stores";
import { DropdownData } from "../stores";
import { FetchNui } from "./FetchNui";
import { UseNuiEvent } from "./UseNuiEvent";

export const SendEvent = (Event, Data, Cb) => {
    if (!Cb) Cb = () => {};

    FetchNui(null, Event, Data || {}).then((ReturnData) => {
        Cb(true, ReturnData);
    }).catch((e) => {
        Cb(false, e);
    });
}

export const AsyncSendEvent = (Event, Data) => {
    return new Promise((Res) => {
        SendEvent(Event, Data, (Success, Result) => {
            Res([Success, Result])
        })
    })
}

export const OnEvent = (Event, Cb) => {
    UseNuiEvent(Event, Cb);
}

export const Debug = (Message) => {
    // Disabled for PROD.
    // console.log(`[PHONE-UI]: ${Message}`);
}

export const SetExitHandler = (Event, NuiEvent, IsActive, Data) => {
    // Event = NUI Event, so you can reset data or smth
    // NuiEvent = NUI Callback in LUA
    // IsActive = Function Callback if the UI is focused (or active)
    // Data = Data to be sent to the Event & NUIEvent

    window.addEventListener("keyup", (e) => {
        if (e.key != 'Escape') return;
        if (!IsActive()) return;

        SendEvent(NuiEvent, Data)
        window.dispatchEvent(
            new MessageEvent("message", {
                data: {
                    Action: Event,
                    Data: Data || {},
                },
            })
        );
    });
};

export const SetDropdown = (Show, Options, Positioning) => {
    if (!Positioning) Positioning = {};
    Positioning.Width = Positioning?.Width || 'max-content';

    DropdownData.set({
        Show: Show,
        Options: Options,
        Positioning: Positioning
    })
}

// JS Functions
export const IsEnvBrowser = () => !(window).invokeNative;
export const Delay = Sec => new Promise( Res => setTimeout(Res, Sec * 1000) );

export const AddSpaces = Value => {
    return Value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")
};

export const FormatCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

export const CalculateTimeLeftExact = (Time) => {
    var NowTime = new Date();
    var ItemTime = new Date(Time);
    var DifferenceMS = (ItemTime - NowTime);
    var DifferenceHours = Math.floor((DifferenceMS % 86400000) / 3600000);
    var DifferenceMins = Math.round(((DifferenceMS % 86400000) % 3600000) / 60000);

    return {Hours: DifferenceHours, Minutes: DifferenceMins}
}

export const GetTimeLabel = (date, nowDate = Date.now(), rft = new Intl.RelativeTimeFormat('en', { numeric: "auto" })) => {
    const SECOND = 1000;
    const MINUTE = 60 * SECOND;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    const YEAR = 365 * DAY;
    const intervals = [
        { ge: YEAR, divisor: YEAR, unit: 'year' },
        { ge: MONTH, divisor: MONTH, unit: 'month' },
        { ge: WEEK, divisor: WEEK, unit: 'week' },
        { ge: DAY, divisor: DAY, unit: 'day' },
        { ge: HOUR, divisor: HOUR, unit: 'hour' },
        { ge: MINUTE, divisor: MINUTE, unit: 'minute' },
        { ge: 30 * SECOND, divisor: SECOND, unit: 'seconds' },
        { ge: 0, divisor: 1, text: 'just now' },
    ];
    const now = typeof nowDate === 'object' ? nowDate.getTime() : new Date(nowDate).getTime();
    const diff = now - (typeof date === 'object' ? date : new Date(date)).getTime();
    const diffAbs = Math.abs(diff);
    for (const interval of intervals) {
        if (diffAbs >= interval.ge) {
            const x = Math.round(Math.abs(diff) / interval.divisor);
            const isFuture = diff < 0;
            return interval.unit ? rft.format(isFuture ? x : -x, interval.unit) : interval.text;
        };
    };
};

export const GetLongTimeLabel = (timestamp) => new Date(timestamp).toLocaleString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

export const CopyToClipboard = (text) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
};

// Phone Functions
export const FormatPhone = (PhoneNumber) => {
    const Cleaned = ('' + PhoneNumber).replace(/\D/g, ''); // Remove any non-numberic characters.
    const Match = Cleaned.match(/^(\d{2})(\d{1,8})$/); // Create a format that matches the number.
    if (Match) return Match[1] + ' ' + Match[2]; // If it matches return the formatted version.
    return PhoneNumber; // In case if the match failed (ex. not 10 digits) return the unformatted number.
};

const IMGUR_IMAGE_EXT_REGEX = /\.(?:jpe?g|gif|png|webp|avif)$/i;
const TRAILING_PUNCTUATION_REGEX = /[.,!?;:)\]]+$/g;

export const NormalizeImageUrl = (Url) => {
    if (!Url || typeof Url !== "string") return Url;

    const CleanUrl = Url.trim();
    if (!CleanUrl || CleanUrl.startsWith("data:image/")) return CleanUrl;

    let ParsedUrl;
    try {
        ParsedUrl = new URL(CleanUrl);
    } catch (e) {
        return CleanUrl;
    }

    const Hostname = (ParsedUrl.hostname || "").toLowerCase();
    if (Hostname === "images.weserv.nl" || Hostname === "wsrv.nl") {
        const NestedRaw = ParsedUrl.searchParams.get("url");
        if (!NestedRaw) return CleanUrl;

        const NestedUrl = /^https?:\/\//i.test(NestedRaw)
            ? NestedRaw
            : `https://${NestedRaw}`;
        const NormalizedNested = NormalizeImageUrl(NestedUrl);

        // Only replace when nested URL was normalized to a concrete image URL.
        if (NormalizedNested && NormalizedNested !== NestedUrl) {
            return NormalizedNested;
        }

        return CleanUrl;
    }

    const IsImgurHost =
        Hostname === "imgur.com" ||
        Hostname === "www.imgur.com" ||
        Hostname === "i.imgur.com";

    if (!IsImgurHost) return CleanUrl;

    // Convert page URLs (imgur.com/<id>) to direct image host first.
    if (Hostname !== "i.imgur.com") {
        const PathParts = ParsedUrl.pathname.split("/").filter(Boolean);
        const FirstPart = PathParts[0] || "";
        if (!FirstPart || FirstPart === "a" || FirstPart === "gallery") {
            return CleanUrl;
        }

        ParsedUrl = new URL(`https://i.imgur.com/${FirstPart}`);
    }

    let FileName = ParsedUrl.pathname.split("/").filter(Boolean)[0] || "";
    FileName = FileName.replace(TRAILING_PUNCTUATION_REGEX, "");
    if (!FileName) return CleanUrl;

    if (!IMGUR_IMAGE_EXT_REGEX.test(FileName)) {
        FileName = `${FileName}.png`;
    }
    ParsedUrl.pathname = `/${FileName}`;

    const Target = `${ParsedUrl.host}${ParsedUrl.pathname}${ParsedUrl.search}`;
    return `https://images.weserv.nl/?url=${encodeURIComponent(Target)}`;
};

export const ExtractImageUrls = (Str) => {
    if (!Str) return [[], ""];
    
    // Support query parameters (for Discord) and new formats (webp, avif)
    // Also capture Imgur links even if they don't have an extension
    const Regex = /(https?:\/\/[^\s]+?\.(?:jpe?g|gif|png|webp|avif)(?:\?[^\s]*)?|https?:\/\/(?:www\.)?imgur\.com\/[a-zA-Z0-9]+(?!\/))/gi;
    let Urls = Str.match(Regex) || [];
    
    Urls = Urls.map((url) => NormalizeImageUrl(url));

    const ModifiedStr = Str.replace(Regex, "");
    return [Urls, ModifiedStr];
}

export const ShowSuccessModal = () => {
    SuccessModal.set(true)
    setTimeout(() => {
        SuccessModal.set(false);
    }, 2000);
};

export let Notifications = writable([]);

export const AddNotification = (Data) => {
    const NotifIndex = get(Notifications).findIndex(Val => Val.Id == Data.Id);
    if (NotifIndex > -1) return UpdateNotification(Data);
    
    Debug("[ADD]: " + Data.Id);

    Data.State = "in";

    let NewNotifications = [...get(Notifications), Data];
    Notifications.set(NewNotifications)
};

export const UpdateNotification = (Data) => {
    const NotifIndex = get(Notifications).findIndex(Val => Val.Id == Data.Id);
    if (NotifIndex == -1) return;

    Debug("[UPDATE]: " + Data.Id);

    let NewNotifications = get(Notifications);

    if (Data.RemoveTimer) {
        NewNotifications[NotifIndex].ShowTimer = false;
    };

    if (Data.RemoveCountdown) {
        NewNotifications[NotifIndex].ShowCountdown = false;
    };

    if (Data.Title) {
        NewNotifications[NotifIndex].Title = Data.Title;
    };

    if (Data.Text) {
        NewNotifications[NotifIndex].Text = Data.Text;
    };

    if (Data.RemoveActions) {
        NewNotifications[NotifIndex].HasAccept = false
        NewNotifications[NotifIndex].HasReject = false

        if (!Data.HideImmediately) {
            setTimeout(() => {
                RemoveNotification({...Data, Fade: true});
            }, 3500);
        }
    };

    if (Data.HasSpeaker !== undefined) {
        NewNotifications[NotifIndex].HasSpeaker = Data.HasSpeaker;
    }

    if (Data.SpeakerEnabled !== undefined) {
        NewNotifications[NotifIndex].SpeakerEnabled = Data.SpeakerEnabled;
    }

    Notifications.set(NewNotifications);

    if (Data.HideImmediately) RemoveNotification({...Data, Fade: true});;
};

export const RemoveNotification = (Data) => {
    const NotifIndex = get(Notifications).findIndex(Val => Val.Id == Data.Id);
    if (NotifIndex == -1) return;

    Debug("[REMOVE]: " + Data.Id);

    if (Data.Fade) {
        let NewNotifications = get(Notifications);
        NewNotifications[NotifIndex].State = "out";
        Notifications.set(NewNotifications);
    }

    setTimeout(() => {
        let FilteredNotifications = get(Notifications).filter(Val => Val.Id != Data.Id);
        Notifications.set(FilteredNotifications);
    }, Data.Fade ? 500 : 0);
};

export const GetContactsSelect = async () => {
    let Retval = [];

    let [Success, Result] = await AsyncSendEvent("Contacts/GetContacts", {})
    if (!Success) return [];

    for (let i = 0; i < Result.length; i++) {
        const Contact = Result[i];
        Retval.push({ Value: Contact.phone, Text: Contact.name, ValueIsReal: true });
    };

    return Retval;
}
