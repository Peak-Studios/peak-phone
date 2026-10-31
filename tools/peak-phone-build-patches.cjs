// Applied AFTER the existing immutable-bundle patch recipe. Fail closed on upstream drift.
module.exports = function patch(source) {
 const patches=[
  ['share success callback','St("Contacts/RequestAirShare",{TargetSource:e,Contact:t},(()=>{n(6,p=!1),Ht()}))','St("Contacts/RequestAirShare",{TargetSource:e,Contact:t},((ok)=>{if(ok){n(6,p=!1),Ht()}}))'],
  ['profile success callback','St("Contacts/UpdateProfile",{avatar:e.Avatar},(()=>{ct.set(!1),n(3,l.avatar=e.Avatar,l),Ht()}))','St("Contacts/UpdateProfile",{avatar:e.Avatar},((ok)=>{ct.set(!1);if(ok){n(3,l.avatar=e.Avatar,l),Ht()}}))'],
  ['number-safe contact search','t.phone.toLowerCase().includes(e)||t.name.toLowerCase().includes(e)','String(t.phone||"").toLowerCase().includes(e)||String(t.name||"").toLowerCase().includes(e)'],
 ];
 for(const [name,from,to] of patches){if(source.split(from).length!==2)throw Error('Peak Phone compatibility patch drift: '+name);source=source.replace(from,to);}
 return source.replaceAll('https://peak-phone/','https://peak-phone/').replaceAll('nui://peak-phone/','nui://peak-phone/');
};
