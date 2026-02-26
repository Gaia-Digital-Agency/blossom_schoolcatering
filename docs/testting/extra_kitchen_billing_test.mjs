const base='http://127.0.0.1/schoolcatering/api/v1';
const out=[];
function add(area,name,pass,detail){out.push({area,name,pass,detail});}
async function req(path,{method='GET',token,body}={}){const h={'content-type':'application/json'};if(token)h.authorization='Bearer '+token;const r=await fetch(base+path,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined});const t=await r.text();let b;try{b=t?JSON.parse(t):{}}catch{b={raw:t}};return {status:r.status,body:b};}
function nextWeekday(offset){const d=new Date();d.setUTCDate(d.getUTCDate()+offset);while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);} 

(async()=>{
 const stamp=Date.now().toString().slice(-6);
 const d=nextWeekday(16);
 const admin=await req('/auth/login',{method:'POST',body:{username:'admin',password:'admin123',role:'ADMIN'}});
 const at=admin.body.accessToken;
 const schools=await req('/schools?active=true',{token:at});
 const schoolId=(schools.body||[])[0]?.id;
 const ingredients=await req('/admin/ingredients',{token:at});
 const ingredientIds=(ingredients.body||[]).slice(0,3).map(i=>i.id);
 let menus=await req(`/admin/menus?service_date=${d}&session=LUNCH`,{token:at});
 if(!(menus.body?.items||[]).length){await req('/admin/menu-items',{method:'POST',token:at,body:{serviceDate:d,session:'LUNCH',name:`KB Dish ${stamp}`,description:'kb',nutritionFactsText:'n',caloriesKcal:300,price:12000,imageUrl:'/schoolcatering/assets/hero-meal.jpg',ingredientIds,isAvailable:true,displayOrder:1,cutleryRequired:true,packingRequirement:'p'}});menus=await req(`/admin/menus?service_date=${d}&session=LUNCH`,{token:at});}
 const item=(menus.body.items||[])[0];

 const p=await req('/auth/register',{method:'POST',body:{role:'PARENT',username:`kb_parent_${stamp}`,password:'Parent123',firstName:'KB',lastName:'Parent',phoneNumber:`62855${stamp}01`,email:`kb_parent_${stamp}@mail.local`,address:'Jl KB'}});
 const pt=p.body.accessToken;
 const child=await req('/children/register',{method:'POST',token:pt,body:{firstName:'KBKid',lastName:'Flow',phoneNumber:`62855${stamp}02`,email:`kb_kid_${stamp}@mail.local`,dateOfBirth:'2015-01-01',gender:'MALE',schoolId,schoolGrade:'Grade 3',allergies:'Peanut'}});
 const cart=await req('/carts',{method:'POST',token:pt,body:{childId:child.body.childId,serviceDate:d,session:'LUNCH'}});
 await req(`/carts/${cart.body.id}/items`,{method:'PATCH',token:pt,body:{items:[{menuItemId:item.id,quantity:1}]}});
 const order=await req(`/carts/${cart.body.id}/submit`,{method:'POST',token:pt});
 const orderId=order.body.id;

 const kitchen=await req('/auth/login',{method:'POST',body:{username:'kitchen',password:'kitchen123',role:'KITCHEN'}});
 const kt=kitchen.body.accessToken;
 const ksum=await req(`/kitchen/daily-summary?date=${d}`,{token:kt});
 const krow=(ksum.body.orders||[]).find(x=>x.id===orderId);
 add('Kitchen','Kitchen daily summary load',ksum.status===200,`status=${ksum.status}`);
 add('Kitchen','Kitchen sees created order',!!krow,`orderId=${orderId}`);
 add('Kitchen','Kitchen sees allergen fields',!!krow && ('has_allergen' in krow),`has_allergen=${krow?.has_allergen}`);

 const pb=await req('/billing/parent/consolidated',{token:pt});
 const brow=(pb.body||[]).find(x=>x.order_id===orderId);
 add('Billing','Parent billing contains order',!!brow,`billingId=${brow?.id||'-'}`);

 const ab=await req('/admin/billing',{token:at});
 const abrow=(ab.body||[]).find(x=>x.order_id===orderId);
 add('Billing','Admin billing contains order',!!abrow,`billingId=${abrow?.id||'-'}`);

 if(abrow?.id){
   const ver=await req(`/admin/billing/${abrow.id}/verify`,{method:'POST',token:at,body:{decision:'VERIFIED'}});
   add('Billing','Admin verify billing',ver.status===200 || ver.status===201,`status=${ver.status}`);
   const rec=await req(`/admin/billing/${abrow.id}/receipt`,{method:'POST',token:at});
   add('Billing','Admin generate receipt',rec.status===200,rec.status===200?'generated':`failed: ${rec.body?.message||rec.status}`);
 }

 console.log(JSON.stringify({generatedAt:new Date().toISOString(),results:out,summary:{total:out.length,passed:out.filter(x=>x.pass).length,failed:out.filter(x=>!x.pass).length}},null,2));
})();
