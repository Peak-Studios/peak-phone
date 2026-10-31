<script>
    import { HasPDRacingUsb, HasRacingUsb } from "./phone.stores";

    import BankBusters from "./Apps/BankBusters.svelte";
    import Calculator from "./Apps/Calculator.svelte";
    import Calls from "./Apps/Calls.svelte";
    import Cars from "./Apps/Cars.svelte";
    import Contacts from "./Apps/Contacts.svelte";
    import Default from "./Apps/Default.svelte";
    import Details from "./Apps/Details.svelte";
    import Documents from "./Apps/Documents.svelte";
    import Gallery from "./Apps/Gallery.svelte";
    import Housing from "./Apps/Housing.svelte";
    import JobCenter from "./Apps/JobCenter.svelte";
    import Mails from "./Apps/Mails.svelte";
    import Messages from "./Apps/Messages.svelte";
    import News from "./Apps/News.svelte";
    import Peakify from "./Apps/Peakify.svelte";
    import Racing from "./Apps/Racing.svelte";
    import Settings from "./Apps/Settings.svelte";
    import Y from "./Apps/Y.svelte";
    import Vehicles from "./Apps/Vehicles.svelte";
    import Wenmo from "./Apps/Wenmo.svelte";
    import YellowPages from "./Apps/YellowPages.svelte";
    import Facetime from "./Apps/Facetime.svelte";
    import BusDriver from "./Apps/BusDriver.svelte";
    import Lumberjack from "./Apps/Lumberjack.svelte";
    import Guber from "./Apps/Guber.svelte";

    export let App = "details";
</script>

{#if App == "details"}
    <Details />
{:else if App == "settings"}
    <Settings />
{:else if App == "contacts"}
    <Contacts />
{:else if App == "calls"}
    <Calls />
{:else if App == "messages"}
    <Messages />
{:else if App == "mails"}
    <Mails />
{:else if App == "yellowpages"}
    <YellowPages />
{:else if App == "y"}
    <Y />
{:else if App == "vehicles"}
    <Vehicles />
{:else if App == "wenmo"}
    <Wenmo />
{:else if App == "documents"}
    <Documents />
{:else if App == "gallery"}
    <Gallery />
{:else if App == "housing"}
    <Housing />
{:else if App == "jobcenter"}
    <JobCenter />
{:else if App == "bin"}
    <News NewsNetwork="bin" />
{:else if App == "peakify"}
    <Peakify />
{:else if (App == "racing" || App == "time-trials") && ($HasRacingUsb || $HasPDRacingUsb)}
    <Racing Type={App == "time-trials" ? "Gov" : "Crime"} />
{:else if App == "calculator"}
    <Calculator />
{:else if App == "bankbusters"}
    <BankBusters />
{:else if App == "cars"}
    <Cars />
{:else if App == "facetime"}
    <Facetime />
{:else if App == "busdriver"}
    <BusDriver />
{:else if App == "lumberjack"}
    <Lumberjack />
{:else if App == "guber"}
    <Guber />
{:else}
    <Default />
{/if}
