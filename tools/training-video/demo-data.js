// Demo data for the training-video harness (local-test/demo.html). Runs BEFORE the app scripts,
// into the in-memory localStorage, so every screen opens with a realistic September 2026 outlet.
(function(){
  const put=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const OUT=5, ok=b=>b+'_outlet_'+OUT;
  const pad=n=>String(n).padStart(2,'0');
  const rnd=(i,k)=>{const x=Math.sin(i*12.9898+k*78.233)*43758.5453;return x-Math.floor(x);};
  put('salonos_salons',[
    {id:5,name:'Glow Sector 21 — Gurgaon',state:'Haryana',city:'Gurgaon',status:'Active',pfApplicable:true,esicApplicable:true,ptApplicable:false,type:'Owned',gstin:'06ABCDE1234F1Z5'},
    {id:6,name:'Glow DLF Phase 4 — Gurgaon',state:'Haryana',city:'Gurgaon',status:'Active',pfApplicable:true,esicApplicable:true,type:'Owned'},
    {id:7,name:'Glow Rajouri Garden — Delhi',state:'Delhi',city:'New Delhi',status:'Active',pfApplicable:true,esicApplicable:true,type:'Franchise'}]);
  put('salonos_next_salon_id',8);
  [5,6,7].forEach(id=>put('salonos_period_default_outlet_'+id,{fy:'2026-27',mi:5}));
  const emp=(id,name,desig,dept,gross,doj,off)=>({id,name,desig,dept,doj,dol:'',weeklyOff:off,status:'Active',gross,basic:Math.round(gross*0.5),hra:Math.round(gross*0.2),conv:1600,special:gross-Math.round(gross*0.5)-Math.round(gross*0.2)-1600,
    pf:gross<=30000,esic:gross<=21000,pt:false,tds:false,mobile:'98'+String(10000000+Math.floor(rnd(gross,1)*89999999)),bankName:'HDFC Bank',accountNo:'5010'+String(Math.floor(rnd(gross,2)*1e8)).padStart(8,'0'),ifsc:'HDFC0001234'});
  const staff=[emp('E1','Priya Sharma','Salon Manager','Manager',38000,'2023-04-10','Monday'),
    emp('E2','Rahul Verma','Senior Hair Stylist','Hairdresser',32000,'2023-06-01','Tuesday'),
    emp('E3','Anjali Gupta','Beautician','Beautician',22000,'2024-01-15','Wednesday'),
    emp('E4','Imran Khan','Hair Stylist','Hairdresser',26000,'2024-03-01','Tuesday'),
    emp('E5','Neha Singh','Pedicurist','Pedicurist',18000,'2024-07-20','Thursday'),
    emp('E6','Vikram Rao','Hair Stylist','Hairdresser',24000,'2025-02-01','Friday'),
    emp('E7','Sunita Devi','Helper','Helper',13000,'2025-05-12','Tuesday'),
    emp('E8','Karan Mehta','Receptionist','Helper',17000,'2025-08-01','Monday')];
  window.__DEMO_STAFF=staff;
  [5,6,7].forEach((sid,si)=>put('salonos_master_employees_outlet_'+sid,si===0?staff:staff.slice(0,5).map((e,i)=>({...e,id:'E'+(sid*10+i)}))));
  // attendance — Aug & Sep 2026
  const att={};
  staff.forEach((e,ei)=>{[[2026,7,31],[2026,8,30]].forEach(([y,m,n])=>{
    const days=Array.from({length:n},(_,d)=>{const dt=new Date(y,m,d+1);const wd=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dt.getDay()];
      if(wd===e.weeklyOff)return'off';const r=rnd(ei*31+d,m);return r<0.05?'absent':r<0.09?'half':'present';});
    att[e.id+'_'+y+'_'+m]={days};});});
  put(ok('salonos_attendance'),att);
  // sales — one generator feeds Daily Sales & Exp, Collection Reco and the bank settlements so
  // every reconciliation in the app ties out (card settles at 98.2% the next day, UPI in full).
  const sale=(sid,si,m,d)=>{const wk=new Date(2026,m,d).getDay();const f=0.6*(1-si*0.18)*((wk===0||wk===6)?1.45:1)*(0.86+m*0.025);
    return{cash:Math.round((6000+rnd(d,m*3+sid)*5000)*f/10)*10,card:Math.round((9000+rnd(d,m*5+sid)*7000)*f/10)*10,upi:Math.round((14000+rnd(d,m*7+sid)*9000)*f/10)*10,luzo:d%6===0?Math.round(2500*f/10)*10:0};};
  const dmyOf=(m,d)=>pad(d)+'/'+pad(m+1)+'/2026';
  const banks={};
  [5,6,7].forEach((sid,si)=>{
    const ds={},ex={},cr=[],bk=[];let cid=1,bid=1;
    for(let m=3;m<=9;m++){const n=m===9?1:new Date(2026,m+1,0).getDate();for(let d=1;d<=n;d++){
      const v=sale(sid,si,m,d),iso='2026-'+pad(m+1)+'-'+pad(d),dmy=dmyOf(m,d);
      cr.push({id:cid++,centerName:['Glow Sector 21','Glow DLF Phase 4','Glow Rajouri Garden'][si],invoiceDate:dmy,cash:v.cash,card:v.card,upi:v.upi,wallet:0,district:0,luzo:v.luzo,online:0,total:v.cash+v.card+v.upi+v.luzo,calculatedTotal:v.cash+v.card+v.upi+v.luzo,isValid:true});
      if(m>=7){
        ds[iso]={0:v.cash,1:v.card,2:v.upi,3:v.luzo};
        const e={0:Math.round(150+rnd(d,1)*250),7:Math.round(100+rnd(d,4)*150)};
        if(d%3===0)e[1]=120;if(d%4===0)e[2]=Math.round(200+rnd(d,5)*300);
        if(d===5)e[3]=640;if(d===15)e[4]=501;if(d===12)e[28]=3500;if(d===18)e[19]=1800;
        if(d%7===0)e[30]=Math.round(3800+rnd(d,6)*1800);
        ex[iso]=e;
        ds[iso][11]=Math.max(0,v.cash-Object.values(e).reduce((x,y)=>x+y,0)-(m===7&&d===1?5000:0));
        const nx=new Date(2026,m,d+1),ndmy=pad(nx.getDate())+'/'+pad(nx.getMonth()+1)+'/2026';
        bk.push({id:bid++,transactionDate:ndmy,description:'UPI SETTLEMENT PHONEPE '+iso.replace(/-/g,''),credit:v.upi,debit:0,nature:'UPI Settlement',cradleeDate:dmy});
        bk.push({id:bid++,transactionDate:ndmy,description:'CARD SETTL PINELABS MID 77120',credit:v.card,debit:0,nature:'Card Settlement',cradleeDate:dmy});
      }}}
    put('salonos_daily_sales_collection_data_outlet_'+sid,ds);
    put('salonos_daily_sales_data_outlet_'+sid,ex);
    put('salonos_cradlee_collection_rows_outlet_'+sid,cr);
    banks[sid]={bk,bid};
  });
  put(ok('salonos_vendors'),[
    {id:'V1',name:"L'Oréal India Pvt Ltd",status:'Active',gstin:'27AAACL1234A1Z2',category:'Salon Products',phone:'9810011223'},
    {id:'V2',name:'Kumar Traders',status:'Active',category:'Consumables',phone:'9899012345'},
    {id:'V3',name:'Sharma Properties',status:'Active',category:'Rent',phone:'9811122233'},
    {id:'V4',name:'DHBVN (Electricity)',status:'Active',category:'Electricity Expenses'},
    {id:'V5',name:'Airtel Business',status:'Active',category:'Telephone & Internet Expenses'},
    {id:'V6',name:'Salon Furniture Co',status:'Active',category:'Fixed Assets',gstin:'06AAKCS7788Q1Z3'}]);
  [[6,90000,15800,60000],[7,75000,12400,48000]].forEach(([sid,rent,elec,stock])=>{
    put('salonos_vendors_outlet_'+sid,[{id:'V1',name:'Landlord',status:'Active',category:'Rent'},{id:'V2',name:'Power utility',status:'Active',category:'Electricity Expenses'},{id:'V3',name:"L'Oréal India Pvt Ltd",status:'Active',category:'Salon Products'}]);
    put('salonos_vendor_invoices_outlet_'+sid,[
      {id:'I1',vendorId:'V1',invoiceNo:'R-SEP',invoiceDate:'2026-09-01',bookingDate:'2026-09-01',dueDate:'2026-09-07',category:'Rent',taxable:rent,cgst:0,sgst:0,amount:rent,payments:[{paidAmount:rent,paidDate:'2026-09-05'}],docNature:'Tax Invoice'},
      {id:'I2',vendorId:'V2',invoiceNo:'E-0926',invoiceDate:'2026-09-10',bookingDate:'2026-09-10',dueDate:'2026-09-25',category:'Electricity Expenses',taxable:elec,cgst:0,sgst:0,amount:elec,payments:[],docNature:'Tax Invoice'},
      {id:'I3',vendorId:'V3',invoiceNo:'LOR-'+sid+'88',invoiceDate:'2026-09-08',bookingDate:'2026-09-08',dueDate:'2026-10-08',category:'Salon Products',taxable:stock,cgst:stock*0.09,sgst:stock*0.09,amount:stock*1.18,payments:[],docNature:'Tax Invoice'}]);
  });
  put(ok('salonos_vendor_invoices'),[
    {id:'I1',vendorId:'V1',invoiceNo:'LOR/26/4471',invoiceDate:'2026-09-04',bookingDate:'2026-09-04',dueDate:'2026-10-04',category:'Salon Products',taxable:24000,cgst:2160,sgst:2160,amount:28320,payments:[{paidAmount:15000,paidDate:'2026-09-20',mode:'Bank Transfer'}],docNature:'Tax Invoice',enteredAt:'2026-09-04T11:00:00'},
    {id:'I2',vendorId:'V2',invoiceNo:'KT-1182',invoiceDate:'2026-09-12',bookingDate:'2026-09-12',dueDate:'2026-09-27',category:'Consumables',taxable:4200,cgst:378,sgst:378,amount:4956,payments:[],docNature:'Tax Invoice',enteredAt:'2026-09-12T11:00:00'},
    {id:'I3',vendorId:'V3',invoiceNo:'RENT-SEP',invoiceDate:'2026-09-01',bookingDate:'2026-09-01',dueDate:'2026-09-07',category:'Rent',taxable:85000,cgst:7650,sgst:7650,amount:100300,payments:[{paidAmount:100300,paidDate:'2026-09-06',mode:'Bank Transfer'}],docNature:'Tax Invoice',enteredAt:'2026-09-01T10:00:00'},
    {id:'I5',vendorId:'V6',invoiceNo:'SFC/112',invoiceDate:'2026-08-18',bookingDate:'2026-08-18',dueDate:'2026-09-17',category:'Fixed Assets',desc:'Styling chairs and mirror stations',taxable:96000,cgst:8640,sgst:8640,amount:113280,payments:[{paidAmount:60000,paidDate:'2026-08-25',mode:'Bank Transfer'}],docNature:'Tax Invoice',assetLines:[{id:1,name:'Hydraulic styling chairs (4)',amount:64000},{id:2,name:'Mirror stations (2)',amount:32000}]},
    {id:'I4',vendorId:'V5',invoiceNo:'AIR-88213',invoiceDate:'2026-09-08',bookingDate:'2026-09-08',dueDate:'2026-09-25',category:'Telephone & Internet Expenses',taxable:1999,cgst:180,sgst:180,amount:2359,payments:[{paidAmount:2359,paidDate:'2026-09-21',mode:'UPI'}],docNature:'Tax Invoice',enteredAt:'2026-09-08T10:00:00'}]);
  const bank=banks[5].bk;let bid=banks[5].bid;
  bank.push({id:bid++,transactionDate:'06/09/2026',description:'NEFT-SHARMA PROPERTIES-RENT SEP',debit:100300,credit:0,nature:'Vendor Payment'});
  bank.push({id:bid++,transactionDate:'20/09/2026',description:'NEFT-LOREAL INDIA PVT LTD',debit:15000,credit:0,nature:'Vendor Payment'});
  bank.push({id:bid++,transactionDate:'21/09/2026',description:'UPI-AIRTEL BUSINESS',debit:2359,credit:0,nature:'Vendor Payment'});
  bank.push({id:bid++,transactionDate:'07/09/2026',description:'SALARY AUG-2026 BULK NEFT',debit:171450,credit:0,nature:'Salary'});
  bank.sort((a,b)=>a.transactionDate.split('/').reverse().join('').localeCompare(b.transactionDate.split('/').reverse().join('')));
  put(ok('salonos_bank_statement_rows'),bank);
  [6,7].forEach(sid=>put('salonos_bank_statement_rows_outlet_'+sid,banks[sid].bk));
  put(ok('salonos_recurring_expenses'),[
    {id:'R1',expenseName:'Shop Rent',payee:'Sharma Properties',amount:100300,frequency:'Monthly',dueDay:7,status:'Active',startDate:'2026-04-01',amountType:'Fixed',category:'Rent'},
    {id:'R2',expenseName:'Electricity',payee:'DHBVN',amount:18000,frequency:'Bi-Monthly',dueDay:15,status:'Active',startDate:'2026-04-01',amountType:'Variable',category:'Electricity Expenses',billTiming:'postpaid',consumerNo:'7841 2265 90',payUrl:'https://dhbvn.org.in',
      bills:[{id:'B1',period:'2026-06',amount:16800,invoiceDate:'2026-07-12',bookingDate:'2026-07-12',periodStart:'2026-05-01',periodEnd:'2026-06-30',months:2}]},
    {id:'R3',expenseName:'Internet',payee:'Airtel Business',amount:2359,frequency:'Monthly',dueDay:25,status:'Active',startDate:'2026-04-01',amountType:'Fixed',category:'Telephone & Internet Expenses'},
    {id:'R4',expenseName:'Software subscription',payee:'SalonOS',amount:2999,frequency:'Monthly',dueDay:1,status:'Active',startDate:'2026-04-01',amountType:'Fixed',category:'Professional Fee'}]);
  // Incentive Working achieved figures + overtime hours (September 2026)
  const ia={};
  [['E1',0,0,0,9,6],['E2',265000,42000,18500,10,14],['E3',148000,21000,9200,9,8],['E4',192000,15000,7400,10,11],['E5',96000,8000,4600,9,0],['E6',171000,12000,6100,10,9],['E8',0,0,0,9,4]]
    .forEach(([id,sv,me,pr,nh,oh])=>{ia[id+'_2026_8']={svcActual:sv,memActual:me,prodActual:pr,otNormalHours:nh,otHours:oh,otApplicable:1};});
  put(ok('salonos_incentive_actuals'),ia);
  put(ok('salonos_iw_cols'),{svcTarget:true,membership:true,product:true,svcPct:true,memPct:true,prodPct:true,amounts:true,penalty:true,advAdj:true,bankDetails:false,ot:true});
  put(ok('salonos_advances'),[
    {id:'A001',emp:'Imran Khan',date:'2026-08-05',amount:10000,reason:'Family function',approvedBy:'Priya Sharma',repayment:2500,mode:'Cash',bankRef:'',deductFrom:'Salary',deductionStart:'2026-08',schedule:[{month:'2026-08',amount:2500},{month:'2026-09',amount:2500},{month:'2026-10',amount:2500},{month:'2026-11',amount:2500}],outstanding:5000,status:'Active'},
    {id:'A002',emp:'Neha Singh',date:'2026-09-10',amount:4000,reason:'Medical',approvedBy:'Priya Sharma',repayment:2000,mode:'UPI',bankRef:'UPI 6612',deductFrom:'Salary',deductionStart:'2026-09',schedule:[{month:'2026-09',amount:2000},{month:'2026-10',amount:2000}],outstanding:4000,status:'Active'}]);
  put(ok('salonos_penalties'),[
    {id:'P001',emp:'Vikram Rao',date:'2026-09-03',type:'Late arrival',amount:200,approvedBy:'Priya Sharma',recoveryMode:'Salary',month:'September 2026',remarks:'45 min late'},
    {id:'P002',emp:'Sunita Devi',date:'2026-09-17',type:'Uniform violation',amount:100,approvedBy:'Priya Sharma',recoveryMode:'Salary',month:'September 2026',remarks:''}]);
  const di=[];staff.slice(1,6).forEach((e,i)=>{[6,13,20,27].forEach(d=>di.push({date:'2026-09-'+pad(d),empId:e.id,emp:e.name,service:'Service Commission/Incentives',target:0,achieved:300+i*50,rate:100,incentive:300+i*50,mode:'Cash',status:'Computed'}));});
  put(ok('salonos_daily_incentive_entries'),di);
  put(ok('salonos_audit_log'),[
    {ts:'2026-09-30T18:42:00',user:'Priya Sharma',role:'Salon Manager',entity:'Daily Sales',entityId:'2026-09-30',action:'Edited',summary:'UPI 21,450 entered for 30 Sep'},
    {ts:'2026-09-30T17:10:00',user:'Amit (Accounts)',role:'Accountant',entity:'Vendor Invoice',entityId:'KT-1182',action:'Added',summary:'Kumar Traders — ₹4,956'},
    {ts:'2026-09-29T12:05:00',user:'Priya Sharma',role:'Salon Manager',entity:'Attendance',entityId:'E5',action:'Edited',summary:'Neha Singh — 29 Sep marked Leave'},
    {ts:'2026-09-28T10:30:00',user:'Owner',role:'Super Admin',entity:'Employee',entityId:'E8',action:'Edited',summary:'Karan Mehta — salary revised to ₹17,000'}]);
  // Billing (POS) invoices — last 3 weeks
  const svc=[['Haircut — Women',800],['Haircut — Men',400],['Global Hair Colour',3500],['Keratin Treatment',6500],['Hair Spa',1500],['Gold Facial',2200],['Pedicure — Classic',900],['Manicure — Gel',1200],['Beard Styling',300],['Threading — Eyebrow',80]];
  const cust=['Anjali Mehta','Rohan Kapoor','Sneha Iyer','Vikram Rao','Neha Gupta','Aditya Jain','Priyanka Das','Karan Malhotra','Ritu Singh','Farah Khan'];
  const stf=['Rahul Verma','Anjali Gupta','Imran Khan','Neha Singh','Vikram Rao'];
  const bills=[];
  for(let i=0;i<18;i++){const d=new Date(2026,9,1-Math.floor(i/1.5));const items=[];const n=1+Math.floor(rnd(i,21)*3);
    for(let j=0;j<n;j++){const x=svc[Math.floor(rnd(i*5+j,22)*svc.length)];items.push({name:x[0],type:'Service',qty:1,rate:x[1]});}
    bills.push({id:'INV-'+(1520-i),date:d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()),customer:cust[Math.floor(rnd(i,23)*cust.length)],phone:'98'+String(10000000+Math.floor(rnd(i,24)*89999999)),
      staff:stf[Math.floor(rnd(i,25)*stf.length)],items,discount:i%5===0?200:0,paymentMode:['UPI','Card','Cash','UPI'][i%4],status:i===3?'Unpaid':'Paid'});}
  put(ok('salonos_billing_invoices'),bills);
  // After the app scripts load (their seed helpers exist then) — clients, stock and today's appointments.
  window.__postSeed=function(){
    try{const c=seedClients(OUT);c[0]={...c[0],notes:'Prefers ammonia-free colour. Birthday month offer sent.'};localStorage.setItem(ok('salonos_clients'),JSON.stringify(c));}catch(e){}
    try{const st=seedStock(OUT);st[0]={...st[0],qty:3,supplier:"L'Oréal India"};localStorage.setItem(ok('salonos_inventory_items'),JSON.stringify(st));}catch(e){}
    try{const t=fdDateStr(new Date());const book={};book[OUT+'|'+t]=seedAppts(OUT,t);localStorage.setItem(ok('salonos_appointments_book'),JSON.stringify(book));}catch(e){}
  };
})();
