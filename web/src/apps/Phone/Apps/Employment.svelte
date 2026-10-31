<script>
    import { onMount } from "svelte";
    import { CurrentBusiness, PlayerData } from "../phone.stores";
    import * as API from "./_employment";
    import "./Employment.css";
    import { SendEvent } from "../../../utils/Utils";

    // Components
    import AppWrapper from "../components/AppWrapper.svelte";

    let Businesses = [];
    let Loading = false;
    let ActiveTab = "overview";
    let SearchQuery = "";

    // Management State
    let ManageView = false;
    let SelectedBusiness = {};

    // Inputs
    let InputCid = "";
    let InputRole = "";
    let InputAmount = "";
    let InputComment = "";

    // Role Management
    let EditingRole = null;
    let RolePermissions = {
        Hire: false,
        Fire: false,
        ChangeRole: false,
        PayEmployee: false,
        PayExternal: false,
        ChargeExternal: false,
        PropertyKeys: false,
        StashAccess: false,
        CraftAccess: false,
        VehicleSales: false,
    };

    onMount(async () => {
        await RefreshBusinesses();
    });

    const RefreshBusinesses = async () => {
        Loading = true;
        Businesses = await API.GetBusinesses();
        if (SelectedBusiness.id) {
            // Update selected business if open
            const Updated = Businesses.find(
                (b) => b.id === SelectedBusiness.id,
            );
            if (Updated) {
                SelectedBusiness = Updated;
                CurrentBusiness.set(Updated);
            }
        }
        Loading = false;
    };

    const OpenBusiness = (Business) => {
        SelectedBusiness = Business;
        CurrentBusiness.set(Business);
        ManageView = true;
        ActiveTab = "overview";
    };

    const CloseBusiness = () => {
        ManageView = false;
        SelectedBusiness = {};
        CurrentBusiness.set({});
    };

    const GetMyRole = (Business) => {
        if (Business.business_owner == $PlayerData.Cid) return "Owner";
        const Emp = Business.business_employees.find(
            (e) => e.Cid == $PlayerData.Cid,
        );
        return Emp ? Emp.Role : "Employee";
    };

    const HasPerm = (Perm) => {
        if (!SelectedBusiness.id) return false;
        if (SelectedBusiness.business_owner == $PlayerData.Cid) return true;
        const Emp = SelectedBusiness.business_employees.find(
            (e) => e.Cid == $PlayerData.Cid,
        );
        if (!Emp) return false;
        const Role = SelectedBusiness.business_ranks.find(
            (r) => r.Name == Emp.Role,
        );
        return Role && Role.Perms && Role.Perms[Perm];
    };

    // Actions
    const Hire = async () => {
        if (!InputCid || !InputRole) return;
        const Res = await API.HireEmployee(
            SelectedBusiness.business_name,
            InputCid,
            InputRole,
        );
        if (Res.Success) {
            InputCid = "";
            RefreshBusinesses();
        }
    };

    const Fire = async (Cid) => {
        const Res = await API.FireEmployee(SelectedBusiness.business_name, Cid);
        if (Res.Success) RefreshBusinesses();
    };

    const Promote = async (Cid) => {
        // Simple prompt for now, could be better UI
        // In a real glass UI we'd have a nice selector, but for MVP of redesign:
        if (!InputRole) return;
        const Res = await API.ChangeRole(
            SelectedBusiness.business_name,
            Cid,
            InputRole,
        );
        if (Res.Success) RefreshBusinesses();
    };

    const SaveRole = async () => {
        if (!InputRole) return;
        let Res;
        if (EditingRole) {
            Res = await API.EditRole(
                SelectedBusiness.business_name,
                InputRole,
                RolePermissions,
            );
        } else {
            Res = await API.CreateRole(
                SelectedBusiness.business_name,
                InputRole,
                RolePermissions,
            );
        }
        if (Res.Success) {
            EditingRole = null;
            InputRole = "";
            RefreshBusinesses();
        }
    };

    const DeleteRole = async (Name) => {
        const Res = await API.DeleteRole(SelectedBusiness.business_name, Name);
        if (Res.Success) RefreshBusinesses();
    };

    // Computed
    $: FilteredEmployees = (SelectedBusiness.business_employees || [])
        .filter(
            (e) =>
                e.Name.toLowerCase().includes(SearchQuery.toLowerCase()) ||
                e.Role.toLowerCase().includes(SearchQuery.toLowerCase()),
        )
        .sort((a, b) => a.Role.localeCompare(b.Role));
</script>

<div class="employment-app">
    {#if !ManageView}
        <div class="employment-header">
            <div class="employment-title">My Jobs</div>
            <div class="employment-subtitle">Active Employments</div>
        </div>
        <div class="employment-content">
            {#each Businesses as Biz}
                <div class="employment-card" on:click={() => OpenBusiness(Biz)}>
                    <div class="employment-card-icon">
                        <i class="fas fa-briefcase"></i>
                    </div>
                    <div class="employment-card-info">
                        <div class="employment-card-title">
                            {Biz.business_name}
                        </div>
                        <div class="employment-card-subtitle">
                            {GetMyRole(Biz)}
                        </div>
                    </div>
                    <div class="employment-card-action">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <div class="employment-header">
            <div style="display: flex; align-items: center; gap: 1vh;">
                <i
                    class="fas fa-chevron-left"
                    style="cursor: pointer;"
                    on:click={CloseBusiness}
                ></i>
                <div>
                    <div class="employment-title">
                        {SelectedBusiness.business_name}
                    </div>
                    <div class="employment-subtitle">
                        {GetMyRole(SelectedBusiness)}
                    </div>
                </div>
            </div>
        </div>

        <div class="employment-tabs">
            <div
                class="employment-tab {ActiveTab === 'overview'
                    ? 'active'
                    : ''}"
                on:click={() => (ActiveTab = "overview")}
            >
                Overview
            </div>
            <div
                class="employment-tab {ActiveTab === 'employees'
                    ? 'active'
                    : ''}"
                on:click={() => (ActiveTab = "employees")}
            >
                Employees
            </div>
            {#if HasPerm("ChangeRole")}
                <div
                    class="employment-tab {ActiveTab === 'roles'
                        ? 'active'
                        : ''}"
                    on:click={() => (ActiveTab = "roles")}
                >
                    Roles
                </div>
            {/if}
            {#if HasPerm("PayExternal") || HasPerm("ChargeExternal")}
                <div
                    class="employment-tab {ActiveTab === 'finances'
                        ? 'active'
                        : ''}"
                    on:click={() => (ActiveTab = "finances")}
                >
                    Finances
                </div>
            {/if}
        </div>

        <div class="employment-content">
            {#if ActiveTab === "overview"}
                <div class="business-actions-grid">
                    <!-- Quick Actions -->
                    <!-- Placeholder for future functionality like Clock In/Out if server supported it properly via this UI -->
                    <div class="action-btn">
                        <i class="fas fa-clock"></i>
                        <span>Duty Status</span>
                    </div>
                </div>
            {/if}

            {#if ActiveTab === "employees"}
                <div class="search-container">
                    <input
                        class="search-input"
                        placeholder="Search employees..."
                        bind:value={SearchQuery}
                    />
                </div>

                {#if HasPerm("Hire")}
                    <div
                        class="employment-card"
                        style="margin-bottom: 2vh; flex-direction: column; align-items: stretch; gap: 1vh;"
                    >
                        <div style="font-size: 1.4vh; font-weight: 500;">
                            Hire New Employee
                        </div>
                        <div style="display: flex; gap: 1vh;">
                            <input
                                class="search-input"
                                placeholder="Citizen ID"
                                bind:value={InputCid}
                            />
                            <input
                                class="search-input"
                                placeholder="Role Name"
                                bind:value={InputRole}
                            />
                        </div>
                        <div
                            class="action-btn"
                            style="padding: 1vh;"
                            on:click={Hire}
                        >
                            Hire
                        </div>
                    </div>
                {/if}

                <div style="display: flex; flex-direction: column; gap: 1vh;">
                    {#each FilteredEmployees as Emp}
                        <div class="list-item">
                            <div class="list-item-avatar">
                                <i class="fas fa-user"></i>
                            </div>
                            <div class="list-item-content">
                                <div class="list-item-title">{Emp.Name}</div>
                                <div class="list-item-subtitle">
                                    {Emp.Role} | CID: {Emp.Cid}
                                </div>
                            </div>
                            <div class="list-item-actions">
                                {#if HasPerm("ChangeRole") && Emp.Cid !== $PlayerData.Cid}
                                    <div
                                        class="icon-btn"
                                        on:click={() => {
                                            InputCid = Emp.Cid;
                                            InputRole = Emp.Role;
                                            Promote(Emp.Cid);
                                        }}
                                        data-tooltip="Set Role (Use Input)"
                                    >
                                        <i class="fas fa-user-tag"></i>
                                    </div>
                                {/if}
                                {#if HasPerm("Fire") && Emp.Cid !== $PlayerData.Cid}
                                    <div
                                        class="icon-btn"
                                        style="color: #ef4444;"
                                        on:click={() => Fire(Emp.Cid)}
                                    >
                                        <i class="fas fa-user-slash"></i>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if ActiveTab === "roles"}
                <div
                    class="employment-card"
                    style="margin-bottom: 2vh; flex-direction: column; align-items: stretch; gap: 1vh;"
                >
                    <div style="font-size: 1.4vh; font-weight: 500;">
                        {EditingRole ? "Edit Role" : "Create Role"}
                    </div>
                    <input
                        class="search-input"
                        placeholder="Role Name"
                        bind:value={InputRole}
                        disabled={!!EditingRole}
                    />

                    <div
                        style="display: grid; grid-template-columns: 1fr 1fr; gap: 1vh;"
                    >
                        {#each Object.keys(RolePermissions) as Perm}
                            <div
                                style="display: flex; align-items: center; gap: 1vh; font-size: 1.2vh; color: rgba(255,255,255,0.7);"
                            >
                                <input
                                    type="checkbox"
                                    bind:checked={RolePermissions[Perm]}
                                />
                                {Perm}
                            </div>
                        {/each}
                    </div>

                    <div style="display: flex; gap: 1vh;">
                        <div
                            class="action-btn"
                            style="flex: 1; padding: 1vh;"
                            on:click={SaveRole}
                        >
                            Save
                        </div>
                        {#if EditingRole}
                            <div
                                class="action-btn"
                                style="flex: 1; padding: 1vh;"
                                on:click={() => {
                                    EditingRole = null;
                                    InputRole = "";
                                }}
                            >
                                Cancel
                            </div>
                        {/if}
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 1vh;">
                    {#each SelectedBusiness.business_ranks || [] as Rank}
                        <div class="list-item">
                            <div class="list-item-content">
                                <div class="list-item-title">{Rank.Name}</div>
                            </div>
                            <div class="list-item-actions">
                                <div
                                    class="icon-btn"
                                    on:click={() => {
                                        EditingRole = Rank;
                                        InputRole = Rank.Name;
                                        RolePermissions = { ...Rank.Perms };
                                    }}
                                >
                                    <i class="fas fa-edit"></i>
                                </div>
                                <div
                                    class="icon-btn"
                                    style="color: #ef4444;"
                                    on:click={() => DeleteRole(Rank.Name)}
                                >
                                    <i class="fas fa-trash"></i>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if ActiveTab === "finances"}
                <div style="display: flex; flex-direction: column; gap: 1vh;">
                    {#if HasPerm("PayExternal")}
                        <div
                            class="employment-card"
                            style="flex-direction: column; align-items: stretch; gap: 1vh;"
                        >
                            <div style="font-size: 1.4vh; font-weight: 500;">
                                Pay External
                            </div>
                            <input
                                class="search-input"
                                placeholder="CID"
                                bind:value={InputCid}
                            />
                            <input
                                class="search-input"
                                placeholder="Amount"
                                bind:value={InputAmount}
                            />
                            <input
                                class="search-input"
                                placeholder="Comment"
                                bind:value={InputComment}
                            />
                            <div
                                class="action-btn"
                                style="padding: 1vh;"
                                on:click={async () => {
                                    const Res = await API.PayExternal(
                                        SelectedBusiness.business_name,
                                        InputCid,
                                        InputAmount,
                                        InputComment,
                                    );
                                    if (Res.Success) {
                                        InputCid = "";
                                        InputAmount = "";
                                        InputComment = "";
                                    }
                                }}
                            >
                                Send Payment
                            </div>
                        </div>
                    {/if}

                    {#if HasPerm("ChargeExternal")}
                        <div
                            class="employment-card"
                            style="flex-direction: column; align-items: stretch; gap: 1vh;"
                        >
                            <div style="font-size: 1.4vh; font-weight: 500;">
                                Charge Customer
                            </div>
                            <input
                                class="search-input"
                                placeholder="CID"
                                bind:value={InputCid}
                            />
                            <input
                                class="search-input"
                                placeholder="Amount"
                                bind:value={InputAmount}
                            />
                            <input
                                class="search-input"
                                placeholder="Comment"
                                bind:value={InputComment}
                            />
                            <div
                                class="action-btn"
                                style="padding: 1vh;"
                                on:click={async () => {
                                    const Res = await API.ChargeExternal(
                                        SelectedBusiness.business_name,
                                        InputCid,
                                        InputAmount,
                                        InputComment,
                                    );
                                    if (Res.Success) {
                                        InputCid = "";
                                        InputAmount = "";
                                        InputComment = "";
                                    }
                                }}
                            >
                                Send Invoice
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</div>
