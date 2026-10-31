<script>
    import { onMount } from "svelte";
    import { SendEvent } from "../../../utils/Utils";
    import { PlayerData } from "../phone.stores";
    
    import TextField from "../../../components/TextField/TextField.svelte";

    import AppWrapper from "../components/AppWrapper.svelte";
    import PaperList from "../components/PaperList.svelte";

    let IsDOJ = false;
    let Users = [];
    let MyState = 'Busy';

    let Judges = [];
    let Mayors = [];
    let Lawyers = [];
    let Clerks = [];

    const FilterUsers = (Search) =>{
        let Query = Search.toLowerCase();
        let _Users = Users.filter(Val => Val.CharName.toLowerCase().includes(Query))

        Judges = _Users.filter(Val => Val.Job == 'judge');
        Mayors = _Users.filter(Val => Val.Job == 'mayor');
        Lawyers = _Users.filter(Val => Val.Job == 'lawyer');
        Clerks = _Users.filter(Val => Val.Job == 'clerk');
    };

    const CallUser = (Phone) => {
        SendEvent("Contacts/Call", {Phone})
    }


    const Statuses = [
        { Text: "Busy" },
        { Text: "In Court" },
        { Text: "Available" }
    ];

    onMount(() => {
        SendEvent("DOJ/GetUsers", {}, (Success, Data) => {
            if (!Success) return;
            IsDOJ = Data.IsDOJ;
            Users = Data.Users;
            FilterUsers("");

            if (!IsDOJ) return;

            const MyUser = Users.find(Val => Val.Cid == $PlayerData.Cid);
            MyState = MyUser.Status;
        })
    })
</script>

<AppWrapper>
    <TextField
        Title='Search'
        Icon='search'
        class="phone-misc-input"
        SubSet={FilterUsers}
    />

    {#if IsDOJ}
        <TextField
            Title='Status'
            Select={Statuses}
            bind:Value={MyState}
            class="phone-misc-input"
            style="margin-top: .3vh;"
            SubSet={(Value) => {
                SendEvent("DOJ/SetStatus", { Status: Value })

                SendEvent("DOJ/GetUsers", {}, (Success, Data) => {
                    if (!Success) return;
                    IsDOJ = Data.IsDOJ;
                    Users = Data.Users;
                    FilterUsers("");

                    if (!IsDOJ) return;

                    const MyUser = Users.find(Val => Val.Cid == $PlayerData.Cid);
                    MyState = MyUser.Status;
                })
            }}
        />
    {/if}
    
    <PaperList style="top: 14vh; height: 42.4vh">
        {#if Mayors.length > 0}
            <p>Mayor</p>
            {#each Mayors as Data, Id}
                <div class="phone-doj-item">
                    <p class="name">{Data.CharName}</p>
                    <p class="status">{Data.Status}</p>
                    <p data-tooltip="Call" class="call">
                        {#if Data.Status == 'Available'}
                            <i on:keyup on:click={() => CallUser(Data.Number)} class="fas fa-phone"></i>
                        {:else}
                            <i class="fas fa-phone-slash"></i>
                        {/if}
                    </p>
                </div>
            {/each}
            <div class="phone-doj-seperator"></div>
        {/if}

        {#if Judges.length > 0}
            <p>Judge(s)</p>
            {#each Judges as Data, Id}
                <div class="phone-doj-item">
                    <p class="name">{Data.CharName}</p>
                    <p class="status">{Data.Status}</p>
                    <p data-tooltip="Call" class="call">
                        {#if Data.Status == 'Available'}
                            <i on:keyup on:click={() => CallUser(Data.Number)} class="fas fa-phone"></i>
                        {:else}
                            <i class="fas fa-phone-slash"></i>
                        {/if}
                    </p>
                </div>
            {/each}
            <div class="phone-doj-seperator"></div>
        {/if}

        {#if Lawyers.length > 0}
            <p>Lawyers</p>
            {#each Lawyers as Data, Id}
                <div class="phone-doj-item">
                    <p class="name">{Data.CharName}</p>
                    <p class="status">{Data.Status}</p>
                    <p data-tooltip="Call" class="call">
                        {#if Data.Status == 'Available'}
                            <i on:keyup on:click={() => CallUser(Data.Number)} class="fas fa-phone"></i>
                        {:else}
                            <i class="fas fa-phone-slash"></i>
                        {/if}
                    </p>
                </div>
            {/each}
            <div class="phone-doj-seperator"></div>
        {/if}

        {#if Clerks.length > 0}
            <p>Clerk(s)</p>
            {#each Clerks as Data, Id}
                <div class="phone-doj-item">
                    <p class="name">{Data.CharName}</p>
                    <p class="status">{Data.Status}</p>
                    <p data-tooltip="Call" class="call">
                        {#if Data.Status == 'Available'}
                            <i on:keyup on:click={() => CallUser(Data.Number)} class="fas fa-phone"></i>
                        {:else}
                            <i class="fas fa-phone-slash"></i>
                        {/if}
                    </p>
                </div>
            {/each}
            <div class="phone-doj-seperator"></div>
        {/if}
    </PaperList>
</AppWrapper>

<style>
    .phone-doj-item {
        display: flex;
        flex-direction: row;
        margin: 1.1vh 0;
        height: 2vh;
        font-size: 1.3vh;
        width: 100%
    }

    .phone-doj-item > p {
        margin: 0
    }

    .phone-doj-item > .status {
        margin-left: auto;
        margin-right: auto
    }

    .phone-doj-item > .call {
        margin-left: auto;
        font-size: 2vh;
        width: 2.6vh;
        line-height: 2vh
    }

    .phone-doj-seperator {
        width: 100%;
        height: 0.1vh;
        background-color: white;
        margin: 1vh 0
    }

    p {
        font-size: 1.5vh;
    }
</style>