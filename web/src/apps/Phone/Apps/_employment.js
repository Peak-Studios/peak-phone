import { AsyncSendEvent } from "../../../utils/Utils";

export const GetBusinesses = async () => {
    const [Success, Data] = await AsyncSendEvent("Employment/GetBusinesses", {});
    if (!Success) return [];
    return Data;
}

export const HireEmployee = async (Business, Employee, Role) => {
    const [Success, Data] = await AsyncSendEvent("Employment/HireEmployee", { Business, Employee, Role });
    return { Success: Success && Data.Success, Msg: Data?.Msg, Employees: Data?.Employees };
};

export const FireEmployee = async (Business, Employee) => {
    const [Success, Data] = await AsyncSendEvent("Employment/RemoveEmployee", { Business, Employee });
    return { Success: Success && Data.Success, Msg: Data?.Msg, Employees: Data?.Employees };
};

export const ChangeRole = async (Business, Employee, Role) => {
    const [Success, Data] = await AsyncSendEvent("Employment/ChangeRole", { Business, Employee, Role });
    return { Success: Success && Data.Success, Msg: Data?.Msg, Employees: Data?.Employees };
};

export const CreateRole = async (Business, Name, Permissions) => {
    const [Success, Data] = await AsyncSendEvent("Employment/CreateRole", { Business, Name, Permissions });
    return { Success: Success && Data.Success, Msg: Data?.Msg, Ranks: Data?.Ranks };
};

export const EditRole = async (Business, Name, Permissions) => {
    const [Success, Data] = await AsyncSendEvent("Employment/EditRole", { Business, Name, Permissions });
    return { Success: Success && Data.Success, Msg: Data?.Msg, Ranks: Data?.Ranks };
};

export const DeleteRole = async (Business, Name) => {
    const [Success, Data] = await AsyncSendEvent("Employment/DeleteRole", { Business, Name });
    return { Success: Success && Data.Success, Msg: Data?.Msg, Ranks: Data?.Ranks };
};

export const PayExternal = async (Business, Cid, Amount, Comment) => {
    const [Success, Data] = await AsyncSendEvent("Employment/PayExternal", { Business, Cid, Amount, Comment });
    return { Success: Success && Data.Success, Msg: Data?.Msg };
};

export const ChargeExternal = async (Business, Cid, Amount, Comment) => {
    const [Success, Data] = await AsyncSendEvent("Employment/ChargeCustomer", { Business, Cid, Amount, Comment });
    return { Success: Success && Data.Success, Msg: Data?.Msg };
};

export const GetFinancialAccess = async (Business, Employee, AccountId) => {
    const [Success, Data] = await AsyncSendEvent("Employment/GetFinancialAccess", { Employee, AccountId });
    if (!Success) return {};
    return Data;
};

export const SetFinancialAccess = async (Business, Employee, Permissions, AccountId) => {
    const [Success, Data] = await AsyncSendEvent("Employment/SetFinancialAccess", { Employee, Permissions, AccountId });
    return { Success: Success && Data.Success, Msg: Data?.Msg };
};

export const Flightschool = {
    GivePilotLicense: async (Cid) => {
        const [Success, Data] = await AsyncSendEvent("Employment/GivePilotLicense", { Cid, Give: true });
        return { Success: Success && Data.Success, Msg: Data?.Msg };
    },
    RevokePilotLicense: async (Cid) => { // Assuming revocation might be needed, though original only showed "Give" with hardcoded true
        const [Success, Data] = await AsyncSendEvent("Employment/GivePilotLicense", { Cid, Give: false });
        return { Success: Success && Data.Success, Msg: Data?.Msg };
    }
}