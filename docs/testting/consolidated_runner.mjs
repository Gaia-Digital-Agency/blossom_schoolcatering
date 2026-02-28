const base=process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';
const out=[];
function add(area,name,pass,detail){out.push({area,name,pass,detail});}
async function req(path,{method='GET',token,body,expect}={}){const h={'content-type':'application/json'};if(token)h.authorization='Bearer '+token;const r=await fetch(base+path,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined});const t=await r.text();let b;try{b=t?JSON.parse(t):{}}catch{b={raw:t}};if(expect && !expect.includes(r.status)) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(b)}`);return {status:r.status,body:b};}
function nextWeekday(offset){const d=new Date();d.setUTCDate(d.getUTCDate()+offset);while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);} 

(async()=>{
try{
  const stamp=Date.now().toString().slice(-6);
  const testDate=nextWeekday(18);

  const admin=await req('/auth/login',{method:'POST',body:{username:'admin',password:'admin123',role:'ADMIN'},expect:[200,201]});
  const at=admin.body.accessToken; add('Admin','Admin login',true,'201 login success');

  const dashboard=await req('/admin/dashboard',{token:at,expect:[200]});
  add('Admin','Dashboard load',!!dashboard.body?.parentsCount,`parents=${dashboard.body?.parentsCount}`);

  const sessOff=await req('/admin/session-settings/SNACK',{method:'PATCH',token:at,body:{isActive:false},expect:[200]});
  const sessOn=await req('/admin/session-settings/SNACK',{method:'PATCH',token:at,body:{isActive:true},expect:[200]});
  add('Admin','Session toggle snack',sessOff.body?.is_active===false && sessOn.body?.is_active===true,'toggle off/on success');

  const bo=await req('/blackout-days',{method:'POST',token:at,body:{blackoutDate:'2026-03-19',type:'ORDER_BLOCK',reason:'Consolidated report test'},expect:[200,201]});
  add('Admin','Create blackout date',!!bo.body?.id,`id=${bo.body?.id||'-'}`);

  const schools=await req('/schools?active=true',{token:at,expect:[200]});
  const schoolId=(schools.body||[])[0]?.id;
  add('Menu','Schools list for menu context',!!schoolId,`schoolId=${schoolId||'none'}`);

  const ingredients=await req('/admin/ingredients',{token:at,expect:[200]});
  const ingredientIds=(ingredients.body||[]).slice(0,3).map(i=>i.id);

  let adminMenu=await req(`/admin/menus?service_date=${testDate}&session=LUNCH`,{token:at,expect:[200]});
  if(!(adminMenu.body?.items||[]).length){
    await req('/admin/menu-items',{method:'POST',token:at,body:{serviceDate:testDate,session:'LUNCH',name:`Report Item ${stamp}`,description:'Report seed item',nutritionFactsText:'Calories 410',caloriesKcal:410,price:28000,imageUrl:'/schoolcatering/assets/hero-meal.jpg',ingredientIds,isAvailable:true,displayOrder:1,cutleryRequired:true,packingRequirement:'Report box'},expect:[200,201]});
    adminMenu=await req(`/admin/menus?service_date=${testDate}&session=LUNCH`,{token:at,expect:[200]});
  }
  const menuItem=(adminMenu.body?.items||[])[0];
  add('Menu','Admin menu available for test date',!!menuItem,`testDate=${testDate}`);

  const newDish=await req('/admin/menu-items',{method:'POST',token:at,body:{serviceDate:testDate,session:'LUNCH',name:`Report Dish ${stamp}`,description:'new dish for consolidated test',nutritionFactsText:'Calories 520',caloriesKcal:520,price:33000,imageUrl:'/schoolcatering/assets/hero-meal.jpg',ingredientIds,isAvailable:true,displayOrder:99,cutleryRequired:true,packingRequirement:'Tray'},expect:[200,201]});
  add('Menu','Admin create dish',!!newDish.body?.id,`dishId=${newDish.body?.id||'-'}`);

  const pUser=`report_parent_${stamp}`;
  const preg=await req('/auth/register',{method:'POST',body:{role:'PARENT',username:pUser,password:'Parent123',firstName:'Report',lastName:'Parent',phoneNumber:`62877${stamp}01`,email:`${pUser}@mail.local`,address:'Jl Report'},expect:[200,201]});
  const pt=preg.body.accessToken;
  add('Parent','Parent register',!!pt,`username=${pUser}`);

  const plogin=await req('/auth/login',{method:'POST',body:{username:pUser,password:'Parent123',role:'PARENT'},expect:[200,201]});
  add('Parent','Parent login',!!plogin.body?.accessToken,'login success');

  const child=await req('/children/register',{method:'POST',token:pt,body:{firstName:'ReportKid',lastName:`Flow${stamp}`,phoneNumber:`62877${stamp}02`,email:`reportkid.${stamp}@mail.local`,dateOfBirth:'2015-01-05',gender:'MALE',schoolId,schoolGrade:'Grade 3',allergies:'Peanut Milk Egg'},expect:[200,201]});
  add('Parent','Parent registers youngster',!!child.body?.childId,`childId=${child.body?.childId||'-'}`);

  const menusForParent=await req(`/menus?service_date=${testDate}&session=LUNCH`,{token:pt,expect:[200]});
  add('Menu','Parent sees menu list',Array.isArray(menusForParent.body?.items) && menusForParent.body.items.length>0,`items=${(menusForParent.body?.items||[]).length}`);

  const cart=await req('/carts',{method:'POST',token:pt,body:{childId:child.body.childId,serviceDate:testDate,session:'LUNCH'},expect:[200,201]});
  await req(`/carts/${cart.body.id}/items`,{method:'PATCH',token:pt,body:{items:[{menuItemId:menuItem.id,quantity:1}]},expect:[200]});
  const order=await req(`/carts/${cart.body.id}/submit`,{method:'POST',token:pt,expect:[200,201]});
  const orderId=order.body.id;
  add('Parent','Parent place order',!!orderId,`orderId=${orderId||'-'}`);

  const parentOrders=await req('/parents/me/orders/consolidated',{token:pt,expect:[200]});
  add('Parent','Parent sees consolidated orders',Array.isArray(parentOrders.body?.orders),`orders=${(parentOrders.body?.orders||[]).length}`);

  const parentBilling=await req('/billing/parent/consolidated',{token:pt,expect:[200]});
  const pbRows=Array.isArray(parentBilling.body)?parentBilling.body:[];
  add('Billing','Parent billing list',pbRows.length>0,`rows=${pbRows.length}`);

  const billingRow=pbRows.find(r=>r.order_id===orderId) || pbRows[0];
  const adminBilling=await req('/admin/billing',{token:at,expect:[200]});
  add('Billing','Admin billing list',Array.isArray(adminBilling.body) && adminBilling.body.length>0,`rows=${(adminBilling.body||[]).length}`);

  if(billingRow?.id){
    const ver=await req(`/admin/billing/${billingRow.id}/verify`,{method:'POST',token:at,body:{decision:'VERIFIED'},expect:[200]});
    add('Billing','Admin verify billing',ver.body?.status==='VERIFIED',`billingId=${billingRow.id}`);

    const rec=await req(`/admin/billing/${billingRow.id}/receipt`,{method:'POST',token:at});
    add('Billing','Admin generate receipt PDF',rec.status===200 && !!rec.body?.pdfUrl, rec.status===200?'receipt generated':`failed: ${rec.body?.message||rec.status}`);
  } else {
    add('Billing','Admin verify billing',false,'no billing row for new order');
    add('Billing','Admin generate receipt PDF',false,'no billing row for receipt');
  }

  const ylogin=await req('/auth/login',{method:'POST',body:{username:child.body.username,password:child.body.generatedPassword,role:'YOUNGSTER'},expect:[200,201]});
  const yt=ylogin.body.accessToken;
  add('Youngster','Youngster login',!!yt,`username=${child.body.username}`);

  const yme=await req('/children/me',{token:yt,expect:[200]});
  add('Youngster','Youngster profile me',!!yme.body?.id,`childId=${yme.body?.id||'-'}`);

  const yins=await req(`/youngsters/me/insights?date=${testDate}`,{token:yt,expect:[200]});
  add('Youngster','Youngster insights',!!yins.body?.badge,`badge=${yins.body?.badge?.level||'-'}`);

  const kitchen=await req('/auth/login',{method:'POST',body:{username:'kitchen',password:'kitchen123',role:'KITCHEN'},expect:[200,201]});
  const kt=kitchen.body.accessToken;
  add('Kitchen','Kitchen login',!!kt,'login success');

  const ksum=await req(`/kitchen/daily-summary?date=${testDate}`,{token:kt,expect:[200]});
  const kOrder=(ksum.body?.orders||[]).find(o=>o.id===orderId);
  add('Kitchen','Kitchen sees order',!!kOrder,`orderId=${orderId}`);
  add('Kitchen','Kitchen sees allergen marker',kOrder?.has_allergen===true || typeof kOrder?.allergen_items==='string',`allergen_items=${kOrder?.allergen_items||'-'}`);

  const dusers=await req('/delivery/users',{token:at,expect:[200]});
  const defaultDelivery=(dusers.body||[]).find(u=>u.username==='delivery') || (dusers.body||[])[0];
  if(defaultDelivery?.id){
    await req('/delivery/assign',{method:'POST',token:at,body:{orderIds:[orderId],deliveryUserId:defaultDelivery.id},expect:[200]});
  }

  const delivery=await req('/auth/login',{method:'POST',body:{username:'delivery',password:'delivery123',role:'DELIVERY'},expect:[200,201]});
  const dt=delivery.body.accessToken;
  add('Delivery','Delivery login',!!dt,'login success');

  const dassign=await req(`/delivery/assignments?date=${testDate}`,{token:dt,expect:[200]});
  const myAs=(dassign.body||[]).find(a=>a.order_id===orderId);
  add('Delivery','Delivery sees assigned order',!!myAs,`assignmentId=${myAs?.id||'-'}`);

  if(myAs?.id){
    const conf=await req(`/delivery/assignments/${myAs.id}/confirm`,{method:'POST',token:dt,body:{note:'Consolidated report delivery confirm'},expect:[200]});
    add('Delivery','Delivery confirm delivered',conf.body?.ok===true || conf.body?.alreadyConfirmed===true,`assignmentId=${myAs.id}`);
  } else {
    add('Delivery','Delivery confirm delivered',false,'assignment not found for this delivery user');
  }

  const adminOrder=await req(`/orders/${orderId}`,{token:at,expect:[200]});
  add('Admin','Admin sees order detail',!!adminOrder.body?.id,`delivery_status=${adminOrder.body?.delivery_status||'-'}`);

  const grouped={};
  for(const r of out){if(!grouped[r.area]) grouped[r.area]=[]; grouped[r.area].push(r);} 
  console.log(JSON.stringify({generatedAt:new Date().toISOString(),testDate,results:out,grouped,summary:{total:out.length,passed:out.filter(x=>x.pass).length,failed:out.filter(x=>!x.pass).length}},null,2));
}catch(e){
  console.log(JSON.stringify({fatal:e.message,results:out,summary:{total:out.length,passed:out.filter(x=>x.pass).length,failed:out.filter(x=>!x.pass).length}},null,2));
  process.exit(1);
}
})();
