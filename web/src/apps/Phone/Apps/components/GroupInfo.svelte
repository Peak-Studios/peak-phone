<script>
    import { fade } from "svelte/transition";
    import { CurrentGroup, ShowGroupInfo, PlayerData, LoaderModal } from "../../phone.stores";
    import { SendEvent, ShowSuccessModal, GetTimeLabel } from "../../../../utils/Utils";
    import * as GRP from "../_groups";

    let groupInfo = null;
    let loading = true;

    $: if ($ShowGroupInfo && $CurrentGroup) {
        loadGroupInfo();
    }

    const loadGroupInfo = async () => {
        loading = true;
        SendEvent("Groups/GetInfo", { GroupId: $CurrentGroup.group_id }, (Success, Data) => {
            loading = false;
            if (Success && Data.group_id) {
                groupInfo = Data;
            }
        });
    };

    const close = () => {
        ShowGroupInfo.set(false);
        groupInfo = null;
    };

    const handleAddMember = () => {
        GRP.AddMemberModal($CurrentGroup.group_id);
    };

    const handleRemoveMember = (phone) => {
        GRP.RemoveMember($CurrentGroup.group_id, phone, (success) => {
            if (success) {
                loadGroupInfo();
                ShowSuccessModal();
            }
        });
    };

    const handleLeaveGroup = () => {
        GRP.LeaveGroup($CurrentGroup.group_id, (success) => {
            if (success) {
                CurrentGroup.set(false);
                ShowGroupInfo.set(false);
            }
        });
    };

    const handleToggleAdmin = (phone, currentState) => {
        GRP.ToggleAdmin($CurrentGroup.group_id, phone, !currentState, (success) => {
            if (success) {
                loadGroupInfo();
                ShowSuccessModal();
            }
        });
    };

    const isGroupAdmin = (phone) => {
        if (!groupInfo || !groupInfo.members) return false;
        const member = groupInfo.members.find(m => m.phone === phone);
        return member && (member.is_admin || member.is_creator);
    };

    const GetMemberInitials = (name) => {
        if (!name) return "?";
        return name.split(' ').map(x => x[0]).join('').substring(0,2).toUpperCase();
    };
</script>

{#if $ShowGroupInfo}
    <div class="group-info-overlay" in:fade={{ duration: 200 }} on:click={close}>
        <div class="group-info-panel" on:click|stopPropagation>
            <div class="group-info-header">
                <button class="close-btn" on:click={close}>
                    <i class="fas fa-times"></i>
                </button>
                <h2>Group Info</h2>
            </div>

            {#if loading}
                <div class="group-info-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
            {:else if groupInfo}
                <div class="group-info-content">
                    <div class="group-info-name">
                        <div class="group-avatar-large">
                            {GRP.GetGroupInitials(groupInfo.name)}
                        </div>
                        <h3>{groupInfo.name}</h3>
                        <p class="member-count">{groupInfo.members?.length || 0} members</p>
                    </div>

                    <div class="group-info-section">
                        <div class="section-header">
                            <span>Members</span>
                            {#if (groupInfo.is_creator || isGroupAdmin($PlayerData.PhoneNumber)) && groupInfo.members?.length < 15}
                                <button class="add-member-btn" on:click={handleAddMember}>
                                    <i class="fas fa-user-plus"></i>
                                </button>
                            {/if}
                        </div>

                        <div class="members-list">
                            {#each groupInfo.members || [] as member}
                                <div class="member-item">
                                    <div class="member-avatar">
                                        {GetMemberInitials(member.name)}
                                    </div>
                                    <div class="member-info">
                                        <span class="member-name">
                                            {member.name}
                                            {#if member.is_creator}
                                                <span class="creator-badge">Creator</span>
                                            {:else if member.is_admin}
                                                <span class="admin-badge">Admin</span>
                                            {/if}
                                            {#if member.phone === $PlayerData.PhoneNumber}
                                                <span class="you-badge">You</span>
                                            {/if}
                                        </span>
                                        <span class="member-phone">{member.phone}</span>
                                    </div>
                                    {#if (groupInfo.is_creator || (isGroupAdmin($PlayerData.PhoneNumber) && !member.is_creator && !member.is_admin)) && member.phone !== $PlayerData.PhoneNumber}
                                        <div class="member-actions">
                                            {#if groupInfo.is_creator && !member.is_creator}
                                                <button class="admin-btn" class:isActive={member.is_admin} on:click={() => handleToggleAdmin(member.phone, member.is_admin)} title={member.is_admin ? "Remove Admin" : "Make Admin"}>
                                                    <i class="fas fa-shield-alt"></i>
                                                </button>
                                            {/if}
                                            <button class="remove-member-btn" on:click={() => handleRemoveMember(member.phone)}>
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>

                    <div class="group-info-actions">
                        <button class="leave-group-btn" on:click={handleLeaveGroup}>
                            <i class="fas fa-sign-out-alt"></i>
                            {groupInfo.is_creator ? "Delete Group" : "Leave Group"}
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .group-info-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.82);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .group-info-panel {
        width: 90%;
        max-height: 80%;
        background: linear-gradient(145deg, rgba(10, 15, 25, 0.98) 0%, rgba(20, 30, 45, 0.95) 100%);
        border: 1px solid rgba(74, 222, 128, 0.2);
        border-radius: 2vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 30px rgba(74, 222, 128, 0.1);
    }

    .group-info-header {
        display: flex;
        align-items: center;
        gap: 1.5vh;
        padding: 2vh;
        border-bottom: 1px solid rgba(74, 222, 128, 0.1);
    }

    .group-info-header h2 {
        margin: 0;
        font-size: 1.6vh;
        color: #e2e8f0;
        font-weight: 600;
    }

    .close-btn {
        width: 3.5vh;
        height: 3.5vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
    }

    .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    .group-info-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4vh;
        color: #4ade80;
        font-size: 2.5vh;
    }

    .group-info-content {
        flex: 1;
        overflow-y: auto;
        padding: 2vh;
    }

    .group-info-content::-webkit-scrollbar {
        width: 0;
    }

    .group-info-name {
        text-align: center;
        margin-bottom: 2.5vh;
    }

    .group-avatar-large {
        width: 8vh;
        height: 8vh;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(74, 222, 128, 0.25) 0%, rgba(34, 197, 94, 0.2) 100%);
        border: 2px solid rgba(74, 222, 128, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.5vh;
        font-weight: 700;
        color: #4ade80;
        margin: 0 auto 1.5vh;
        box-shadow: 0 0 25px rgba(74, 222, 128, 0.2);
    }

    .group-info-name h3 {
        margin: 0 0 0.5vh;
        font-size: 1.8vh;
        color: #e2e8f0;
        font-weight: 600;
    }

    .member-count {
        margin: 0;
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.4);
    }

    .group-info-section {
        margin-bottom: 2vh;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5vh;
        padding-bottom: 0.8vh;
        border-bottom: 1px solid rgba(74, 222, 128, 0.1);
    }

    .section-header span {
        font-size: 1.3vh;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .add-member-btn {
        width: 3vh;
        height: 3vh;
        border-radius: 50%;
        background: rgba(74, 222, 128, 0.15);
        border: 1px solid rgba(74, 222, 128, 0.3);
        color: #4ade80;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 1.2vh;
    }

    .add-member-btn:hover {
        background: rgba(74, 222, 128, 0.25);
        transform: scale(1.1);
    }

    .members-list {
        display: flex;
        flex-direction: column;
        gap: 1vh;
    }

    .member-item {
        display: flex;
        align-items: center;
        gap: 1.2vh;
        padding: 1vh;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 1.2vh;
        transition: all 0.2s;
    }

    .member-item:hover {
        background: rgba(255, 255, 255, 0.06);
    }

    .member-avatar {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(74, 222, 128, 0.15) 0%, rgba(34, 197, 94, 0.1) 100%);
        border: 1px solid rgba(74, 222, 128, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4vh;
        font-weight: 600;
        color: #4ade80;
        flex-shrink: 0;
    }

    .member-info {
        flex: 1;
        overflow: hidden;
    }

    .member-name {
        display: flex;
        align-items: center;
        gap: 0.8vh;
        font-size: 1.3vh;
        font-weight: 500;
        color: #e2e8f0;
    }

    .creator-badge, .you-badge {
        padding: 0.2vh 0.6vh;
        border-radius: 0.5vh;
        font-size: 0.9vh;
        font-weight: 600;
    }

    .creator-badge {
        background: rgba(74, 222, 128, 0.15);
        color: #4ade80;
    }

    .you-badge {
        background: rgba(102, 126, 234, 0.15);
        color: #667eea;
    }

    .admin-badge {
        background: rgba(250, 204, 21, 0.15);
        color: #facc15;
    }

    .member-phone {
        display: block;
        font-size: 1.1vh;
        color: rgba(255, 255, 255, 0.4);
        margin-top: 0.2vh;
    }

    .member-actions {
        display: flex;
        gap: 0.5vh;
        opacity: 0;
        transition: all 0.2s;
    }

    .member-item:hover .member-actions {
        opacity: 1;
    }

    .remove-member-btn, .admin-btn {
        width: 2.8vh;
        height: 2.8vh;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 1vh;
        border: 1px solid transparent;
    }

    .remove-member-btn {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.2);
        color: #ef4444;
    }

    .remove-member-btn:hover {
        background: rgba(239, 68, 68, 0.2);
        transform: scale(1.1);
    }

    .admin-btn {
        background: rgba(250, 204, 21, 0.1);
        border-color: rgba(250, 204, 21, 0.2);
        color: #facc15; /* Yellow */
    }

    .admin-btn.isActive {
        background: rgba(250, 204, 21, 0.2);
        color: #facc15;
        border-color: #facc15;
    }

    .admin-btn:hover {
        background: rgba(250, 204, 21, 0.2);
        transform: scale(1.1);
    }

    .group-info-actions {
        padding-top: 2vh;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .leave-group-btn {
        width: 100%;
        padding: 1.4vh;
        border-radius: 1.2vh;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #ef4444;
        font-size: 1.3vh;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.8vh;
    }

    .leave-group-btn:hover {
        background: rgba(239, 68, 68, 0.2);
    }
</style>
