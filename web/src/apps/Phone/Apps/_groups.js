import { get } from "svelte/store";
import { ExtractImageUrls, GetContactsSelect, SendEvent, ShowSuccessModal } from "../../../utils/Utils";
import { CurrentGroup, InputModal, LoaderModal, PlayerData } from "../phone.stores";

// Check if current player sent the message
export const IsGroupMessageSender = Msg => {
    return Msg.Sender == get(PlayerData).PhoneNumber;
};

// Get initials for group avatar
export const GetGroupInitials = (Name) => {
    if (!Name) return "GRP";
    const words = Name.split(' ');
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return Name.substring(0, 2).toUpperCase();
};

// Get last message preview for group list
export const GetGroupLastMessage = Data => {
    if (!Data.last_message) return "No messages yet";

    let Text = Data.last_message.Message;
    if (Text == '' && Data.last_message.Attachments && Data.last_message.Attachments[0]) {
        Text = "📷 Photo";
    }

    const SenderName = Data.last_message.SenderName || Data.last_message.Sender;
    const ShortName = SenderName.split(' ')[0];

    if (IsGroupMessageSender(Data.last_message)) {
        return '<i class="fas fa-share"></i> ' + Text;
    }

    return ShortName + ": " + Text;
};

// Show create group modal
export const CreateGroupModal = async () => {
    const contacts = await GetContactsSelect();

    InputModal.set({
        Visible: true,
        Inputs: [
            {
                Id: "Name",
                Type: "TextField",
                Data: {
                    Title: "Group Name",
                    Icon: "users",
                },
            },
            {
                Id: "Members",
                Type: "MultiSelect",
                Data: {
                    Title: "Select Members",
                    Icon: "user-plus",
                    Options: contacts,
                    MaxSelections: 14, // +1 for creator = 15 max
                },
            },
        ],
        OnSubmit: (Result) => {
            if (!Result.Name || Result.Name.length <= 0) return;
            if (!Result.Members || Result.Members.length <= 0) return;

            LoaderModal.set(true);
            SendEvent("Groups/CreateGroup", {
                Name: Result.Name,
                Members: Result.Members
            }, (Success, Data) => {
                LoaderModal.set(false);
                if (!Success || !Data.Success) {
                    // Could show error here
                    return;
                }
                ShowSuccessModal();
            });
        },
    });
};

// Show add member modal
export const AddMemberModal = async (GroupId) => {
    const contacts = await GetContactsSelect();

    InputModal.set({
        Visible: true,
        Inputs: [
            {
                Id: "Phone",
                Type: "TextField",
                IsPhone: true,
                ContactPicker: true,
                Data: {
                    Title: "Phone Number",
                    Icon: "user-plus",
                    Select: contacts,
                    SearchSelect: true,
                },
            },
        ],
        OnSubmit: (Result) => {
            if (!Result.Phone || Result.Phone.length <= 0) return;

            LoaderModal.set(true);
            SendEvent("Groups/AddMember", {
                GroupId: GroupId,
                Phone: Result.Phone
            }, (Success, Data) => {
                LoaderModal.set(false);
                if (!Success || !Data.Success) {
                    return;
                }
                ShowSuccessModal();
            });
        },
    });
};

// Send message to current group
export const SendGroupMessage = (Text) => {
    if (Text.length <= 0) return;
    const Group = get(CurrentGroup);
    if (!Group || !Group.group_id) return;

    let [Attachments, Message] = ExtractImageUrls(Text);

    SendEvent("Groups/SendMessage", {
        GroupId: Group.group_id,
        Attachments,
        Message
    });
};

// Leave current group
export const LeaveGroup = (GroupId, Cb) => {
    LoaderModal.set(true);
    SendEvent("Groups/LeaveGroup", { GroupId }, (Success, Data) => {
        LoaderModal.set(false);
        if (Cb) Cb(Success && Data.Success);
    });
};

// Remove member from group
export const RemoveMember = (GroupId, Phone, Cb) => {
    LoaderModal.set(true);
    SendEvent("Groups/RemoveMember", { GroupId, Phone }, (Success, Data) => {
        LoaderModal.set(false);
        if (Cb) Cb(Success && Data.Success);
    });
};

// Toggle Admin Status
export const ToggleAdmin = (GroupId, Phone, State, Cb) => {
    LoaderModal.set(true);
    SendEvent("Groups/ToggleAdmin", { GroupId, Phone, State }, (Success, Data) => {
        LoaderModal.set(false);
        if (Cb) Cb(Success && Data.Success);
    });
};
