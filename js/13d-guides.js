// ── 🎬 Video guides — short animated walkthroughs for staff, in English and Hindi (Help & Guide → Video
// guides). Each plays in the same GuideModal as the Bank / Tally guides (moving picture of the screen with
// the part to press highlighted, caption, spoken voice where the browser has one), and "⬇ Save as video"
// records it to a video file (captions on screen, no voice) to send to staff on WhatsApp.
// Scene pictures are described as rows of chips: [label, hot?] — hot = the part to press (pulses).
// Loaded before js/14 (which starts the app).

const STAFF_GUIDES=[
  {id:'login',icon:'🔐',who:{en:'Everyone',hi:'सभी के लिए'},
   title:{en:'Signing in to SalonOS',hi:'SalonOS में लॉगिन कैसे करें'},
   scenes:[
    {icon:'🌐',mock:[[['digitalca.co.in']],[['Email address'],['you@yourcompany.com']],[['Password'],['••••••••']],[['Sign In',1]]],
     en:{t:'1. Open SalonOS and sign in',s:'Open digitalca.co.in in Chrome. Type the email address and password your Super Admin gave you, and press Sign In.'},
     hi:{t:'1. SalonOS खोलें और लॉगिन करें',s:'Chrome में digitalca.co.in खोलें। Super Admin ने जो ईमेल और पासवर्ड दिया है वह लिखें और Sign In दबाएँ।'}},
    {icon:'📱',mock:[[['Two-step login is on for this account']],[['Authenticator code'],['1 2 3 4 5 6',1]],[['Verify & Sign In',1]]],
     en:{t:'2. Enter the code from your phone',s:'If two-step login is on for you, open Google Authenticator or Microsoft Authenticator on your phone, type the 6-digit code shown for SalonOS, and press Verify and Sign In.'},
     hi:{t:'2. फ़ोन से कोड डालें',s:'अगर आपके खाते में two-step login चालू है, तो फ़ोन में Google Authenticator या Microsoft Authenticator खोलें, SalonOS का 6 अंकों का कोड लिखें और Verify & Sign In दबाएँ।'}},
    {icon:'🏪',mock:[[['Outlets']],[['💈 Your outlet',1]],[['Period'],['September 2026',1],['Change period']]],
     en:{t:'3. Choose your outlet and month',s:'On the left, under Outlets, click your outlet. Pick the month you are working on. You only see the outlets and sheets your Super Admin has given you.'},
     hi:{t:'3. अपना आउटलेट और महीना चुनें',s:'बाईं तरफ़ Outlets में अपने आउटलेट पर क्लिक करें। जिस महीने का काम करना है वह चुनें। आपको सिर्फ़ वही आउटलेट और शीट दिखेंगी जो Super Admin ने दी हैं।'}},
    {icon:'🚪',mock:[[['⏱ 30 min idle → signed out']],[['Sign Out',1]],[['Forgot password?']]],
     en:{t:'4. Sign out on shared computers',s:'SalonOS signs you out by itself after 30 minutes without use. On a shared computer press Sign Out when you finish. Forgot your password? Use Forgot password on the sign-in screen to get a reset email.'},
     hi:{t:'4. साझा कंप्यूटर पर Sign Out करें',s:'30 मिनट तक इस्तेमाल न करने पर SalonOS अपने-आप लॉगआउट कर देता है। साझा कंप्यूटर पर काम ख़त्म होते ही Sign Out दबाएँ। पासवर्ड भूल गए? लॉगिन स्क्रीन पर Forgot password से ईमेल पर नया पासवर्ड लिंक पाएँ।'}}]},

  {id:'daily-sales',icon:'💰',who:{en:'Salon Manager · Data entry',hi:'सैलून मैनेजर · डेटा एंट्री'},
   title:{en:'Daily sales & expenses',hi:'रोज़ की सेल और खर्च'},
   scenes:[
    {icon:'📅',mock:[[['‹'],['Tue, 30 Sep 2026 · Today',1],['›']],[['Sales & collection']],[['Expenses']]],
     en:{t:'1. Open Daily Sales & Exp.',s:'Open your outlet and the Daily Sales and Expenses tab. On a phone you see one day at a time — use the arrows to go to the previous day.'},
     hi:{t:'1. Daily Sales & Exp. खोलें',s:'अपना आउटलेट खोलें और Daily Sales & Exp. टैब चुनें। फ़ोन पर एक बार में एक दिन दिखता है — पिछले दिन के लिए तीर दबाएँ।'}},
    {icon:'💳',mock:[[['Cash Sale'],['4,500',1]],[['Card Sale'],['6,200',1]],[['UPI Sale'],['8,100',1]],[['Total Daily Sale'],['₹18,800']]],
     en:{t:'2. Enter the day’s sales',s:'Type Cash Sale, Card Sale, UPI Sale and Luzo Sale from the day’s bills. Sale on credit goes in Outstanding Sale, and money received later for it in Outstanding Recovery, with the customer’s name.'},
     hi:{t:'2. दिन की सेल लिखें',s:'दिन के बिलों से Cash Sale, Card Sale, UPI Sale और Luzo Sale लिखें। उधार की सेल Outstanding Sale में, और बाद में मिला पैसा Outstanding Recovery में ग्राहक के नाम के साथ लिखें।'}},
    {icon:'💵',mock:[[['Opening Cash Balance'],['₹2,000']],[['Bank Deposit'],['3,000',1]],[['Closing Cash Balance'],['₹3,500',1]]],
     en:{t:'3. Cash in the drawer',s:'Enter Cash Packet, Cash Handover, Bank Deposit or Cash Received when cash leaves or comes in. SalonOS works out the Closing Cash Balance itself, and blocks any entry that would take it below zero.'},
     hi:{t:'3. गल्ले का कैश',s:'कैश बाहर जाए या आए तो Cash Packet, Cash Handover, Bank Deposit या Cash Received लिखें। Closing Cash Balance SalonOS खुद निकालता है, और जो एंट्री उसे शून्य से नीचे ले जाए उसे रोक देता है।'}},
    {icon:'🧾',mock:[[['Tea & Refreshment'],['+ Add',1]],[['What for'],['Milk & tea'],['₹240',1]],[['✓ Save Entries',1]]],
     en:{t:'4. Add the day’s expenses',s:'For each expense tap Add on its row, write what it was for and the amount, then Save Entries. Rows linked to a supplier bill ask you to pick or create that bill.'},
     hi:{t:'4. दिन के खर्च जोड़ें',s:'हर खर्च के लिए उसकी लाइन पर Add दबाएँ, किस चीज़ का खर्च है और रकम लिखें, फिर Save Entries दबाएँ। जिन लाइनों का बिल होता है, वहाँ बिल चुनना या नया बनाना होता है।'}},
    {icon:'☁️',mock:[[['Saved to cloud',1]],[['🔔 9 PM check: sales entered?']]],
     en:{t:'5. It saves by itself — enter every day',s:'Everything saves to the cloud as you type. Enter the day before closing: at 9 PM SalonOS checks, and missing days show up as alerts for the owner.'},
     hi:{t:'5. अपने-आप सेव — रोज़ भरें',s:'लिखते ही सब कुछ क्लाउड में सेव हो जाता है। दुकान बंद करने से पहले उस दिन की एंट्री ज़रूर करें: रात 9 बजे SalonOS जाँचता है, और छूटे दिन मालिक को अलर्ट में दिखते हैं।'}}]},

  {id:'attendance',icon:'🗓',who:{en:'Salon Manager',hi:'सैलून मैनेजर'},
   title:{en:'Marking attendance',hi:'हाज़िरी कैसे लगाएँ'},
   scenes:[
    {icon:'🗓',mock:[[['Employee Attendance']],[['September'],['2026',1],['Individual'],['Full Register']]],
     en:{t:'1. Open Attendance',s:'Open your outlet and the Attendance tab. Choose the month and year at the top.'},
     hi:{t:'1. Attendance खोलें',s:'अपना आउटलेट खोलें और Attendance टैब चुनें। ऊपर महीना और साल चुनें।'}},
    {icon:'👆',mock:[[['Riya'],['P'],['P'],['A',1],['HD']],[['P = Present · WO = Week off · H = Holiday']],[['HD = Half day · A = Absent']]],
     en:{t:'2. Click a day to mark it',s:'Click an employee’s box for the day. Each click changes it: P present, WO week off, H holiday, HD half day, A absent. Keep clicking until the right letter shows.'},
     hi:{t:'2. दिन पर क्लिक करके हाज़िरी लगाएँ',s:'कर्मचारी के उस दिन के खाने पर क्लिक करें। हर क्लिक पर बदलता है: P हाज़िर, WO साप्ताहिक छुट्टी, H त्योहार की छुट्टी, HD आधा दिन, A ग़ैरहाज़िर। सही अक्षर आने तक क्लिक करें।'}},
    {icon:'➡️',mock:[[['1'],['2'],['3',1],['4']],[['⚠ Mark the previous day first']]],
     en:{t:'3. Mark days in order, every day',s:'A day can only be marked after the day before it. Mark attendance every day — the 9 PM check reminds the owner about staff not marked.'},
     hi:{t:'3. क्रम से, रोज़ हाज़िरी लगाएँ',s:'कोई दिन तभी लग सकता है जब उससे पिछला दिन लग चुका हो। रोज़ हाज़िरी लगाएँ — रात 9 बजे की जाँच में बिना हाज़िरी वाले स्टाफ़ का अलर्ट मालिक को जाता है।'}},
    {icon:'📤',mock:[[['⬇ Template',1],['⬆ Bulk Upload',1]]],
     en:{t:'4. Many days at once from Excel',s:'To fill a whole month from a register or machine, press Template, fill the Excel file, and upload it with Bulk Upload.'},
     hi:{t:'4. Excel से एक साथ कई दिन',s:'रजिस्टर या मशीन से पूरा महीना भरना हो तो Template दबाएँ, Excel फ़ाइल भरें और Bulk Upload से अपलोड करें।'}},
    {icon:'🔒',mock:[[['Mark Month Final',1]],[['→ Salary Working uses these days']]],
     en:{t:'5. Close the month',s:'When the month is complete, tick Mark Month Final. It locks the month for managers, and salary is worked out from these days.'},
     hi:{t:'5. महीना बंद करें',s:'महीना पूरा होने पर Mark Month Final पर टिक करें। इससे मैनेजर के लिए महीना लॉक हो जाता है, और तनख़्वाह इन्हीं दिनों से बनती है।'}}]},

  {id:'vendor-bill',icon:'🧾',who:{en:'Accounts · Salon Manager',hi:'अकाउंट्स · सैलून मैनेजर'},
   title:{en:'Adding a supplier bill',hi:'सप्लायर का बिल कैसे जोड़ें'},
   scenes:[
    {icon:'➕',mock:[[['Vendors']],[['+ Add Invoice',1],['📥 WhatsApp bills (2)']]],
     en:{t:'1. Vendors → Add Invoice',s:'Open your outlet, then the Vendors tab, and press Add Invoice.'},
     hi:{t:'1. Vendors → Add Invoice',s:'अपना आउटलेट खोलें, फिर Vendors टैब, और Add Invoice दबाएँ।'}},
    {icon:'📄',mock:[[['📄 Drop the vendor bill here',1]],[['PDF · photo (JPG, PNG)']],[['⏳ Reading the bill with AI']]],
     en:{t:'2. Attach the bill',s:'Drop the bill’s PDF or photo in the box, or click to choose it. The AI reads it in a few seconds.'},
     hi:{t:'2. बिल लगाएँ',s:'बिल की PDF या फ़ोटो बॉक्स में डालें, या क्लिक करके चुनें। AI कुछ सेकंड में बिल पढ़ लेता है।'}},
    {icon:'🔎',mock:[[['Matched by GSTIN'],['Sharma Traders',1]],[['Invoice no.'],['ST-221']],[['Amount'],['₹18,450']],[['Category *'],['Purchase of Cosmetic',1]]],
     en:{t:'3. Check what was read',s:'Check the supplier, invoice number, dates, amounts and category against the paper bill, and correct anything wrong. A new supplier can be added to the vendor list in the same step.'},
     hi:{t:'3. पढ़ी गई जानकारी जाँचें',s:'सप्लायर, बिल नंबर, तारीख़, रकम और कैटेगरी को असली बिल से मिलाएँ, और जो ग़लत हो ठीक करें। नया सप्लायर इसी में वेंडर लिस्ट में जुड़ जाता है।'}},
    {icon:'💾',mock:[[['Use these details',1]],[['Add Invoice / Voucher'],['📎 bill attached']],[['Save',1]]],
     en:{t:'4. Save the invoice',s:'Press Use these details. The invoice form opens filled in, with the bill attached. Check the due date and press Save.'},
     hi:{t:'4. इनवॉइस सेव करें',s:'Use these details दबाएँ। इनवॉइस फ़ॉर्म भरा हुआ खुलेगा और बिल साथ लगा होगा। ड्यू डेट देखें और Save दबाएँ।'}},
    {icon:'📥',mock:[[['📥 WhatsApp bills']],[['Sharma Traders · ₹18,450'],['Review & add',1],['Discard']]],
     en:{t:'5. Bills that came on WhatsApp',s:'Bills staff send on WhatsApp wait under WhatsApp bills, already read. Press Review and add for each one, or Discard if it is a duplicate.'},
     hi:{t:'5. WhatsApp से आए बिल',s:'स्टाफ़ जो बिल WhatsApp पर भेजता है, वे पढ़े हुए WhatsApp bills में रहते हैं। हर बिल के लिए Review & add दबाएँ, या दोहराया हुआ हो तो Discard।'}}]},

  {id:'bank-statement',icon:'🏦',who:{en:'Accounts · Super Admin',hi:'अकाउंट्स · सुपर एडमिन'},
   title:{en:'Importing a bank statement',hi:'बैंक स्टेटमेंट इम्पोर्ट करना'},
   scenes:[
    {icon:'🏦',mock:[[['Your outlet']],[['Bank Statement',1]]],
     en:{t:'1. Open Bank Statement',s:'Open your outlet and the Bank Statement tab. At the top is the card Get statement from your bank’s website.'},
     hi:{t:'1. Bank Statement खोलें',s:'अपना आउटलेट खोलें और Bank Statement टैब चुनें। सबसे ऊपर Get statement from your bank’s website वाला कार्ड है।'}},
    {icon:'➕',mock:[[['➕ Add a bank account',1]],[['Bank'],['HDFC Bank'],['Current'],['Business']],[['Last 4'],['8628'],['Save account',1]]],
     en:{t:'2. Add the bank account — once',s:'Press Add a bank account. Choose the bank, the account type and the login type, type the last four digits and a name, then press Save account. You do this only once for each account.'},
     hi:{t:'2. बैंक खाता जोड़ें — सिर्फ़ एक बार',s:'Add a bank account दबाएँ। बैंक, खाते का प्रकार और लॉगिन का प्रकार चुनें, खाते के आख़िरी चार अंक और एक नाम लिखें, फिर Save account दबाएँ। हर खाते के लिए यह सिर्फ़ एक बार करना है।'}},
    {icon:'📅',mock:[[['◉ HDFC Bank Current',1]],[['Yesterday'],['Last 7 days'],['This month'],['Last month',1],['This FY']],[['From 01-09-2026'],['To 30-09-2026']]],
     en:{t:'3. Pick the account and the period',s:'Select the account, then the period: Yesterday, Last 7 days, This month, Last month, This financial year, or your own From and To dates.'},
     hi:{t:'3. खाता और अवधि चुनें',s:'खाता चुनें, फिर अवधि: Yesterday, Last 7 days, This month, Last month, This FY, या अपनी From और To तारीख।'}},
    {icon:'🔐',mock:[[['🔗 Open bank website',1]],[['🔒 now.hdfc.bank.in'],['Login']]],
     en:{t:'4. Open the bank website and log in there',s:'Press Open bank website. The bank’s own site opens in a new tab. Log in there as you always do — your bank password never goes into SalonOS.'},
     hi:{t:'4. बैंक की वेबसाइट खोलें और वहीं लॉगिन करें',s:'Open bank website दबाएँ। बैंक की अपनी वेबसाइट नए टैब में खुलेगी। वहीं हमेशा की तरह लॉगिन करें — आपका बैंक पासवर्ड SalonOS में कभी नहीं जाता।'}},
    {icon:'⬇️',mock:[[['Account Statement']],[['01/09/2026 – 30/09/2026']],[['XLS'],['CSV'],['PDF'],['⬇ Download',1]]],
     en:{t:'5. Download the statement',s:'On the bank’s site open Account Statement, choose the same dates, and download it as Excel, CSV or PDF. HDFC gives a file like Acct_Statement_…xls. It is saved in your Downloads folder.'},
     hi:{t:'5. स्टेटमेंट डाउनलोड करें',s:'बैंक की साइट पर Account Statement खोलें, वही तारीखें चुनें और Excel, CSV या PDF में डाउनलोड करें। HDFC से Acct_Statement_…xls जैसी फ़ाइल मिलती है। वह आपके Downloads फ़ोल्डर में सेव होती है।'}},
    {icon:'📄',mock:[[['📄 Choose file',1]],[['Downloads'],['Acct_Statement_…8628_30092026.xls',1]],[['Open',1]]],
     en:{t:'6. Back in SalonOS: Choose file',s:'Come back to the SalonOS tab and press Choose file. It opens straight in Downloads — pick the statement you just downloaded and press Open.'},
     hi:{t:'6. SalonOS में वापस: Choose file',s:'SalonOS वाले टैब पर वापस आएँ और Choose file दबाएँ। यह सीधे Downloads में खुलता है — अभी डाउनलोड किया हुआ स्टेटमेंट चुनें और Open दबाएँ।'}},
    {icon:'✅',mock:[[['Appended 42 new transactions',1]],[['16 non-transaction lines ignored']],[['3 already there — skipped']]],
     en:{t:'7. Read the result',s:'SalonOS keeps only the period you chose, ignores headings, address and totals, and skips transactions that are already there — so importing the same file twice is safe.'},
     hi:{t:'7. नतीजा पढ़ें',s:'SalonOS सिर्फ़ चुनी हुई अवधि रखता है, हेडिंग, पता और टोटल छोड़ देता है, और जो एंट्री पहले से हैं उन्हें दोबारा नहीं जोड़ता — इसलिए वही फ़ाइल दो बार इम्पोर्ट करना सुरक्षित है।'}},
    {icon:'🏷️',mock:[[['UPI SETTLEMENT'],['UPI Settlement',1]],[['🔗 Auto-Link Payments',1],['🤖 AI: tag untagged rows']]],
     en:{t:'8. Check the tags and link payments',s:'Most rows are tagged by themselves, such as UPI or card settlements and salary. Press Auto-Link Payments to match payments with supplier bills and salaries, and set the Nature by hand for any row left blank.'},
     hi:{t:'8. टैग जाँचें और पेमेंट जोड़ें',s:'ज़्यादातर एंट्री अपने-आप टैग हो जाती हैं, जैसे UPI या कार्ड सेटलमेंट और सैलरी। Auto-Link Payments दबाकर पेमेंट को सप्लायर बिल और सैलरी से जोड़ें, और जो एंट्री खाली रह जाए उसका Nature ख़ुद चुनें।'}},
    {icon:'⚡',mock:[[['📂 Connect a folder inside Downloads',1]],[['Downloads › New folder › Bank Statements']]],
     en:{t:'9. Optional: import by itself',s:'Want it automatic? Connect a folder inside Downloads, named Bank Statements, and save statements there. SalonOS then imports each new one by itself. Chrome doesn’t allow the whole Downloads folder.'},
     hi:{t:'9. वैकल्पिक: अपने-आप इम्पोर्ट',s:'अपने-आप चाहिए? Downloads के अंदर Bank Statements नाम का फ़ोल्डर जोड़ें और स्टेटमेंट वहीं सेव करें। फिर SalonOS हर नया स्टेटमेंट अपने-आप इम्पोर्ट करेगा। Chrome पूरे Downloads फ़ोल्डर की अनुमति नहीं देता।'}}]},

  {id:'cradlee',icon:'📥',who:{en:'Accounts · Salon Manager',hi:'अकाउंट्स · सैलून मैनेजर'},
   title:{en:'Importing collections from Cradlee',hi:'Cradlee से कलेक्शन इम्पोर्ट करना'},
   scenes:[
    {icon:'📥',mock:[[['Your outlet']],[['📥 Collection Summary',1]],[['Import Collection Data']]],
     en:{t:'1. Open Collection Summary',s:'Open your outlet and the Collection Summary tab. At the top is the card Get the Collection Report from Cradlee.'},
     hi:{t:'1. Collection Summary खोलें',s:'अपना आउटलेट खोलें और Collection Summary टैब चुनें। सबसे ऊपर Get the Collection Report from Cradlee वाला कार्ड है।'}},
    {icon:'📅',mock:[[['Yesterday'],['Last 7 days'],['This month'],['Last month',1],['This FY']],[['From 01-09-2026'],['To 30-09-2026']]],
     en:{t:'2. Pick the period',s:'Choose the dates you want: Yesterday, Last 7 days, This month, Last month, This financial year, or your own From and To dates.'},
     hi:{t:'2. अवधि चुनें',s:'जो तारीखें चाहिए वे चुनें: Yesterday, Last 7 days, This month, Last month, This FY, या अपनी From और To तारीख।'}},
    {icon:'🔐',mock:[[['🔗 Open Cradlee',1]],[['🔒 app.cradleesoft.com'],['Login']]],
     en:{t:'3. Open Cradlee and log in there',s:'Press Open Cradlee. Cradlee opens in a new tab — log in there as usual. Your Cradlee password is only ever typed on Cradlee’s own site.'},
     hi:{t:'3. Cradlee खोलें और वहीं लॉगिन करें',s:'Open Cradlee दबाएँ। Cradlee नए टैब में खुलेगा — वहीं हमेशा की तरह लॉगिन करें। आपका Cradlee पासवर्ड सिर्फ़ Cradlee की अपनी साइट पर लिखा जाता है।'}},
    {icon:'⬇️',mock:[[['Reports'],['Collection Report',1]],[['01/09/2026 – 30/09/2026']],[['Export Excel',1]]],
     en:{t:'4. Export the Collection Report',s:'In Cradlee open Reports, then Collection Report, choose the same dates and export it as Excel or CSV. It is saved in your Downloads folder.'},
     hi:{t:'4. Collection Report एक्सपोर्ट करें',s:'Cradlee में Reports, फिर Collection Report खोलें, वही तारीखें चुनें और Excel या CSV में एक्सपोर्ट करें। फ़ाइल आपके Downloads फ़ोल्डर में सेव होती है।'}},
    {icon:'📄',mock:[[['📄 Choose file',1]],[['Downloads'],['…_Collection_report.xlsx',1]],[['Open',1]]],
     en:{t:'5. Back in SalonOS: Choose file',s:'Come back to SalonOS and press Choose file. It opens straight in Downloads — pick the report you just exported and press Open.'},
     hi:{t:'5. SalonOS में वापस: Choose file',s:'SalonOS पर वापस आएँ और Choose file दबाएँ। यह सीधे Downloads में खुलता है — अभी एक्सपोर्ट की हुई रिपोर्ट चुनें और Open दबाएँ।'}},
    {icon:'✅',mock:[[['Imported 30 rows · All totals are correct',1]],[['31 rows outside the period left out']],[['already imported — skipped']]],
     en:{t:'6. Read the result',s:'SalonOS keeps only the period you chose, ignores total lines, checks every day’s total, and skips days already imported — so importing the same report again is safe.'},
     hi:{t:'6. नतीजा पढ़ें',s:'SalonOS सिर्फ़ चुनी हुई अवधि रखता है, टोटल वाली लाइनें छोड़ देता है, हर दिन का टोटल जाँचता है, और पहले से इम्पोर्ट हुए दिन दोबारा नहीं जोड़ता — इसलिए वही रिपोर्ट दोबारा इम्पोर्ट करना सुरक्षित है।'}},
    {icon:'⚡',mock:[[['📂 Connect a folder inside Downloads',1]],[['Downloads › New folder › Cradlee Exports']]],
     en:{t:'7. Optional: import by itself',s:'Want it automatic? Connect a folder inside Downloads named Cradlee Exports and save the report there — after you press Open Cradlee, SalonOS imports the new export by itself.'},
     hi:{t:'7. वैकल्पिक: अपने-आप इम्पोर्ट',s:'अपने-आप चाहिए? Downloads के अंदर Cradlee Exports नाम का फ़ोल्डर जोड़ें और रिपोर्ट वहीं सेव करें — Open Cradlee दबाने के बाद SalonOS नई रिपोर्ट अपने-आप इम्पोर्ट कर लेगा।'}}]},

  {id:'staff-report',icon:'👥',who:{en:'Accounts · Salon Manager',hi:'अकाउंट्स · सैलून मैनेजर'},
   title:{en:'Importing the Staff Work Report from Cradlee',hi:'Cradlee से स्टाफ़ वर्क रिपोर्ट इम्पोर्ट करना'},
   scenes:[
    {icon:'👥',mock:[[['Your outlet']],[['Staff Work Report',1]],[['Month'],['August 2026',1]]],
     en:{t:'1. Open Staff Work Report and choose the month',s:'Open your outlet and the Staff Work Report tab. In the card Get the Staff Work Report from Cradlee, choose the month.'},
     hi:{t:'1. Staff Work Report खोलें और महीना चुनें',s:'अपना आउटलेट खोलें और Staff Work Report टैब चुनें। Get the Staff Work Report from Cradlee वाले कार्ड में महीना चुनें।'}},
    {icon:'🔐',mock:[[['🔗 Open Cradlee',1]],[['🔒 app.cradleesoft.com'],['Login']]],
     en:{t:'2. Open Cradlee and log in there',s:'Press Open Cradlee. Cradlee opens in a new tab — log in there as usual. Your Cradlee password is only ever typed on Cradlee’s own site.'},
     hi:{t:'2. Cradlee खोलें और वहीं लॉगिन करें',s:'Open Cradlee दबाएँ। Cradlee नए टैब में खुलेगा — वहीं हमेशा की तरह लॉगिन करें। आपका Cradlee पासवर्ड सिर्फ़ Cradlee की अपनी साइट पर लिखा जाता है।'}},
    {icon:'⬇️',mock:[[['Reports'],['Staff Work Report',1]],[['01/08/2026 – 31/08/2026']],[['Export Excel',1]]],
     en:{t:'3. Export the Staff Work Report',s:'In Cradlee open Reports, then Staff Work Report, choose the same month and export it as Excel or CSV. It is saved in your Downloads folder.'},
     hi:{t:'3. Staff Work Report एक्सपोर्ट करें',s:'Cradlee में Reports, फिर Staff Work Report खोलें, वही महीना चुनें और Excel या CSV में एक्सपोर्ट करें। फ़ाइल आपके Downloads फ़ोल्डर में सेव होती है।'}},
    {icon:'📄',mock:[[['📄 Choose file',1]],[['Downloads'],['Staff Work Report.csv',1]],[['Open',1]]],
     en:{t:'4. Back in SalonOS: Choose file',s:'Come back to SalonOS and press Choose file. It opens straight in Downloads — pick the report you just exported and press Open.'},
     hi:{t:'4. SalonOS में वापस: Choose file',s:'SalonOS पर वापस आएँ और Choose file दबाएँ। यह सीधे Downloads में खुलता है — अभी एक्सपोर्ट की हुई रिपोर्ट चुनें और Open दबाएँ।'}},
    {icon:'✅',mock:[[['Loaded 12 staff records for August 2026',1]],[['replaces the earlier import for this month']]],
     en:{t:'5. Check the staff rows',s:'Each staff member’s sales, targets and customers appear for that month. A new export for the same month replaces the earlier one, so a month-so-far report can be imported again and again. These figures feed Incentive Working.'},
     hi:{t:'5. स्टाफ़ की एंट्री जाँचें',s:'हर स्टाफ़ की उस महीने की सेल, टारगेट और ग्राहक दिखते हैं। उसी महीने की नई रिपोर्ट पुरानी की जगह ले लेती है, इसलिए महीने की अब तक की रिपोर्ट बार-बार इम्पोर्ट की जा सकती है। ये आँकड़े Incentive Working में जाते हैं।'}},
    {icon:'⚡',mock:[[['📂 Connect a folder inside Downloads',1]],[['Downloads › New folder › Cradlee Exports']]],
     en:{t:'6. Optional: import by itself',s:'Want it automatic? Connect a folder inside Downloads named Cradlee Exports and save the report there — after you press Open Cradlee, SalonOS imports the new export by itself.'},
     hi:{t:'6. वैकल्पिक: अपने-आप इम्पोर्ट',s:'अपने-आप चाहिए? Downloads के अंदर Cradlee Exports नाम का फ़ोल्डर जोड़ें और रिपोर्ट वहीं सेव करें — Open Cradlee दबाने के बाद SalonOS नई रिपोर्ट अपने-आप इम्पोर्ट कर लेगा।'}}]},

  {id:'whatsapp',icon:'💬',who:{en:'All staff',hi:'सारा स्टाफ़'},
   title:{en:'Sending bills on WhatsApp',hi:'WhatsApp पर बिल भेजना'},
   scenes:[
    {icon:'📇',mock:[[['Your mobile number'],['registered ✓',1]]],
     en:{t:'1. Your number must be registered',s:'Ask your Super Admin to add your mobile number in SalonOS. Messages from other numbers are not accepted.'},
     hi:{t:'1. आपका नंबर जुड़ा होना चाहिए',s:'Super Admin से अपना मोबाइल नंबर SalonOS में जुड़वाएँ। दूसरे नंबरों से आए मैसेज स्वीकार नहीं होते।'}},
    {icon:'📸',mock:[[['📷 Photo of the whole bill',1]],[['or 📄 PDF']],[['→ SalonOS WhatsApp number',1]]],
     en:{t:'2. Send a clear photo or PDF',s:'Take a clear photo of the whole bill in good light, or send the PDF, to the SalonOS WhatsApp number. One bill per photo, up to 8 MB.'},
     hi:{t:'2. साफ़ फ़ोटो या PDF भेजें',s:'अच्छी रोशनी में पूरे बिल की साफ़ फ़ोटो लें, या PDF भेजें, SalonOS के WhatsApp नंबर पर। एक फ़ोटो में एक बिल, 8 MB तक।'}},
    {icon:'✅',mock:[[['✅ Bill received: Sharma Traders · ST-221 · ₹18,450',1]]],
     en:{t:'3. You get a reply',s:'SalonOS replies with the supplier and amount it read. The bill then waits in SalonOS for the accounts person to check and add.'},
     hi:{t:'3. जवाब आता है',s:'SalonOS पढ़ा गया सप्लायर और रकम बताकर जवाब देता है। फिर बिल SalonOS में अकाउंट्स वाले के जाँचने और जोड़ने के लिए रहता है।'}},
    {icon:'📊',mock:[[['today',1]],[['📊 Sales ₹18,800 · Expenses ₹2,450']],[['Staff: 9 present, 1 absent']]],
     en:{t:'4. Ask for today’s figures',s:'Send the word today to get today’s sales, expenses and staff present for your outlet.'},
     hi:{t:'4. आज के आँकड़े पूछें',s:'today लिखकर भेजें — आपके आउटलेट की आज की सेल, खर्च और हाज़िर स्टाफ़ की जानकारी मिल जाएगी।'}}]},

  {id:'salary',icon:'💼',who:{en:'Accounts · Super Admin',hi:'अकाउंट्स · सुपर एडमिन'},
   title:{en:'Monthly salary',hi:'महीने की तनख़्वाह'},
   scenes:[
    {icon:'📋',mock:[[['Attendance: Month Final ✓']],[['Advances ✓'],['Penalties ✓']]],
     en:{t:'1. Get the month ready',s:'Before salary, make sure attendance for the month is complete and marked Final, and that advances and penalties are entered.'},
     hi:{t:'1. महीना तैयार करें',s:'तनख़्वाह से पहले देख लें कि महीने की हाज़िरी पूरी है और Final है, और एडवांस व पेनल्टी लिखे जा चुके हैं।'}},
    {icon:'🧮',mock:[[['Salary Working']],[['September'],['2026'],['🧮 Generate Salary',1]]],
     en:{t:'2. Generate Salary',s:'Open Salary Working, choose the month and press Generate Salary. It checks attendance first, then shows everyone’s salary.'},
     hi:{t:'2. Generate Salary दबाएँ',s:'Salary Working खोलें, महीना चुनें और Generate Salary दबाएँ। पहले हाज़िरी जाँची जाती है, फिर सबकी तनख़्वाह दिखती है।'}},
    {icon:'🔍',mock:[[['Riya'],['29 / 30 days'],['Gross ₹29,000'],['PF ₹2,400'],['Net ₹27,400',1]]],
     en:{t:'3. Check each person',s:'Check days payable, gross salary, PF, ESIC, advance recovery and net pay for each employee.'},
     hi:{t:'3. हर व्यक्ति की जाँच करें',s:'हर कर्मचारी के देय दिन, कुल तनख़्वाह, PF, ESIC, एडवांस कटौती और हाथ में मिलने वाली रकम जाँचें।'}},
    {icon:'📄',mock:[[['📄 Payslips (PDF)',1],['📲 Notify on WhatsApp',1]]],
     en:{t:'4. Payslips and messages',s:'Payslips PDF makes one page per employee. Notify on WhatsApp tells each employee their net pay has been released.'},
     hi:{t:'4. पे-स्लिप और मैसेज',s:'Payslips PDF से हर कर्मचारी की एक पेज की पे-स्लिप बनती है। Notify on WhatsApp से हर कर्मचारी को उसकी तनख़्वाह जारी होने का मैसेज जाता है।'}}]},

  {id:'alerts',icon:'🔔',who:{en:'Everyone',hi:'सभी के लिए'},
   title:{en:'Alerts and Ask',hi:'अलर्ट और Ask'},
   scenes:[
    {icon:'🔔',mock:[[['🔔 4',1]],[['Sales for 29 Sep not entered']],[['3 staff not marked today']]],
     en:{t:'1. The bell shows what needs attention',s:'The number on the bell counts things that need attention — missing sales or attendance, bills due, month-end checks. SalonOS checks every night at 9 PM.'},
     hi:{t:'1. घंटी बताती है क्या बाकी है',s:'घंटी पर लिखी संख्या बताती है कि कितने काम बाकी हैं — छूटी सेल या हाज़िरी, ड्यू बिल, महीने के आख़िर की जाँच। SalonOS हर रात 9 बजे जाँचता है।'}},
    {icon:'👉',mock:[[['Open',1],['Mark done',1]]],
     en:{t:'2. Open it and fix it',s:'Press Open to go straight to the sheet that fixes it. Fixed alerts close by themselves after the next check; press Mark done for ones you handled another way.'},
     hi:{t:'2. Open दबाकर ठीक करें',s:'Open दबाएँ — सीधे वही शीट खुलेगी जहाँ इसे ठीक करना है। ठीक किए गए अलर्ट अगली जाँच के बाद अपने-आप बंद हो जाते हैं; जो किसी और तरीक़े से निपटाया हो उस पर Mark done दबाएँ।'}},
    {icon:'💬',mock:[[['💬 Ask',1]],[['पिछले महीने कौन सा खर्च सबसे ज़्यादा बढ़ा?',1]]],
     en:{t:'3. Ask a question',s:'Press Ask at the top, pick the outlet and type a question in English or Hindi — for example, which bills are overdue. The answer uses only data you are allowed to see.'},
     hi:{t:'3. सवाल पूछें',s:'ऊपर Ask दबाएँ, आउटलेट चुनें और अंग्रेज़ी या हिंदी में सवाल लिखें — जैसे कौन से बिल ड्यू हो गए हैं। जवाब सिर्फ़ उसी डेटा से आता है जो आप देख सकते हैं।'}}]},

  {id:'insights',icon:'💡',who:{en:'Owners · Super Admin',hi:'मालिक · सुपर एडमिन'},
   title:{en:'Owner Insights',hi:'Owner Insights (मालिक के लिए)'},
   scenes:[
    {icon:'📍',mock:[[['💡 Owner Insights',1]],[['Sales today ₹18,800'],['👥 9 present of 10']]],
     en:{t:'1. Today at a glance',s:'Open Owner Insights from the left menu. Each outlet shows today’s sales, expenses, staff present, and the month so far against your target.'},
     hi:{t:'1. आज एक नज़र में',s:'बाएँ मेनू से Owner Insights खोलें। हर आउटलेट की आज की सेल, खर्च, हाज़िर स्टाफ़ और टारगेट के मुक़ाबले महीने की अब तक की सेल दिखती है।'}},
    {icon:'🔮',mock:[[['Expected close ₹5,90,000',1]],[['Target ₹6,00,000'],['Set',1]]],
     en:{t:'2. Where the month is heading',s:'Forecast shows where the month is likely to close and an estimate for next month. Press Set to give each outlet a monthly sales target.'},
     hi:{t:'2. महीना कहाँ तक पहुँचेगा',s:'Forecast बताता है कि महीना लगभग कहाँ ख़त्म होगा और अगले महीने का अनुमान। Set दबाकर हर आउटलेट का महीने का सेल टारगेट डालें।'}},
    {icon:'💸',mock:[[['Bills due in 7 days — ₹50,840']],[['2 days overdue',1],['L’Oreal · ₹32,500']]],
     en:{t:'3. Bills due this week',s:'See every supplier bill due in the next seven days, with overdue ones in red.'},
     hi:{t:'3. इस हफ़्ते के ड्यू बिल',s:'अगले सात दिनों में ड्यू होने वाले सप्लायर बिल देखें — जो ड्यू हो चुके हैं वे लाल रंग में दिखते हैं।'}},
    {icon:'🏅',mock:[[['🥇 Riya · score 82',1]],[['🥈 Aman · 74'],['🥉 Neha · 69']]],
     en:{t:'4. Staff scorecard',s:'Each employee gets a score out of 100: half from target achieved, the rest from attendance and sales per rupee of pay.'},
     hi:{t:'4. स्टाफ़ स्कोरकार्ड',s:'हर कर्मचारी को 100 में से स्कोर मिलता है: आधा टारगेट पूरा करने से, बाकी हाज़िरी और तनख़्वाह के मुक़ाबले सेल से।'}},
    {icon:'📦',mock:[[['⬇ Download PDF',1],['📧 Email',1]]],
     en:{t:'5. Month-end pack',s:'Download the month-end pack as one PDF — summary, profit and loss, salary, staff and supplier bills — or email it straight to the owners.'},
     hi:{t:'5. महीने के आख़िर का पैक',s:'महीने के आख़िर का पैक एक PDF में डाउनलोड करें — सारांश, लाभ-हानि, तनख़्वाह, स्टाफ़ और सप्लायर बिल — या सीधे मालिकों को ईमेल करें।'}}]},
];

// Scene picture for the in-app player, from the scene's chip rows.
function staffGuidePictures(guide){
  return({box,pill})=>{
    const out={};
    guide.scenes.forEach((sc,k)=>{
      out['g'+k]=React.createElement('div',{style:box},
        (sc.mock||[]).map((row,r)=>React.createElement('div',{key:r,style:{margin:'4px 0',animation:'bgIn .5s ease both '+(0.25+r*0.45)+'s'}},
          row.map((c,ci)=>React.createElement(React.Fragment,{key:ci},pill(c[0],!!c[1]))))));
    });
    return out;
  };
}
function StaffGuideModal({guide,initialLang,onClose}){
  const scenes=guide.scenes.map((s,k)=>({...s,ui:'g'+k}));
  return React.createElement(GuideModal,{scenes,pictures:staffGuidePictures(guide),title:guide.title,initialLang,onClose});
}

// ── Save as video: draws the guide on a 1280×720 canvas (same scenes, chips appear one by one, the
// highlighted ones pulse, the caption writes itself) and records it with MediaRecorder. Real time,
// so a 5-scene guide takes about 40 seconds. MP4 where the browser can record it, else WebM.
function guideVideoMime(){
  if(typeof MediaRecorder==='undefined')return '';
  return['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm'].find(t=>{try{return MediaRecorder.isTypeSupported(t);}catch(e){return false;}})||'';
}
function guideSceneMs(sc,lang){return Math.min(14000,Math.max(6000,(sc[lang].t.length+sc[lang].s.length)*62));}
function wrapCanvasText(ctx,text,maxW){
  const words=String(text).split(' '),lines=[];let line='';
  words.forEach(w=>{const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;});
  if(line)lines.push(line);return lines;
}
function drawGuideFrame(ctx,guide,lang,si,tMs){
  const W=1280,H=720,sc=guide.scenes[si],txt=sc[lang],font='"Segoe UI","Nirmala UI","Noto Sans Devanagari",Inter,Arial,sans-serif';
  const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0f1f3d');g.addColorStop(1,'#1e3a8a');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  // header
  ctx.fillStyle='rgba(255,255,255,0.08)';ctx.fillRect(0,0,W,70);
  ctx.fillStyle='#fff';ctx.font='700 28px '+font;ctx.textBaseline='middle';
  ctx.fillText('SalonOS  ·  '+guide.title[lang],40,36);
  ctx.font='500 20px '+font;ctx.fillStyle='#a9c4ff';ctx.textAlign='right';ctx.fillText((si+1)+' / '+guide.scenes.length,W-40,36);ctx.textAlign='left';
  // title slides in
  const a=Math.min(1,tMs/500);
  ctx.globalAlpha=a;
  ctx.font='56px '+font;ctx.fillText(sc.icon,40,140+(1-a)*20);
  ctx.font='700 38px '+font;ctx.fillStyle='#fff';ctx.fillText(txt.t,120,142+(1-a)*20);
  ctx.globalAlpha=1;
  // screen mock card
  const cx=40,cy=200,cw=W-80,ch=250;
  ctx.fillStyle='#f4f7fc';roundRect(ctx,cx,cy,cw,ch,18);ctx.fill();
  let y=cy+48;
  (sc.mock||[]).forEach((row,r)=>{
    const appear=Math.max(0,Math.min(1,(tMs-400-r*600)/400));
    if(appear<=0){y+=54;return;}
    ctx.globalAlpha=appear;
    let x=cx+30;
    row.forEach(c=>{
      ctx.font='600 24px '+font;
      const w=ctx.measureText(c[0]).width+36;
      if(x+w>cx+cw-20)return;
      if(c[1]){
        const p=0.5+0.5*Math.sin(tMs/220);
        ctx.fillStyle='rgba(47,95,224,'+(0.25*p)+')';roundRect(ctx,x-6,y-26,w+12,52,14);ctx.fill();
        ctx.fillStyle='#2f5fe0';
      }else ctx.fillStyle='#dee7f7';
      roundRect(ctx,x,y-20,w,40,10);ctx.fill();
      ctx.fillStyle=c[1]?'#fff':'#14335e';ctx.fillText(c[0],x+18,y+1);
      x+=w+14;
    });
    ctx.globalAlpha=1;y+=54;
  });
  // caption, written out over the first 70% of the scene
  const total=guideSceneMs(sc,lang);
  const shown=Math.floor(txt.s.length*Math.min(1,tMs/(total*0.7)));
  ctx.font='500 28px '+font;ctx.fillStyle='#fff';
  wrapCanvasText(ctx,txt.s.slice(0,shown),W-80).slice(0,5).forEach((l,i)=>ctx.fillText(l,40,500+i*40));
  // progress
  ctx.fillStyle='rgba(255,255,255,0.18)';ctx.fillRect(0,H-8,W,8);
  ctx.fillStyle='#4c7dff';ctx.fillRect(0,H-8,W*((si+Math.min(1,tMs/total))/guide.scenes.length),8);
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
// Preferred: encode frame by frame with WebCodecs into an MP4 (mp4-muxer) — exact timing, faster than
// real time, and not affected by the tab being in the background (which pauses canvas recording).
const CDN_MP4_MUXER_URL='https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js';
async function encodeGuideMp4(guide,lang,onProgress){
  await loadScript(CDN_MP4_MUXER_URL);
  const M=window.Mp4Muxer;
  if(!M)throw new Error('Video library unavailable — check your internet connection.');
  const W=1280,H=720,FPS=30;
  const cfg={codec:'avc1.4d0028',width:W,height:H,bitrate:1200000,framerate:FPS};
  const sup=await VideoEncoder.isConfigSupported(cfg).catch(()=>({supported:false}));
  if(!sup.supported)throw new Error('unsupported');
  const muxer=new M.Muxer({target:new M.ArrayBufferTarget(),video:{codec:'avc',width:W,height:H},fastStart:'in-memory'});
  let failure=null;
  const enc=new VideoEncoder({output:(chunk,meta)=>muxer.addVideoChunk(chunk,meta),error:e=>{failure=e;}});
  enc.configure(cfg);
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  const durations=guide.scenes.map(s=>guideSceneMs(s,lang)+1200);
  const total=durations.reduce((a,b)=>a+b,0);
  const frames=Math.ceil(total/1000*FPS);
  for(let f=0;f<frames;f++){
    if(failure)throw failure;
    const t=f*1000/FPS;
    let acc=0,si=0;while(si<durations.length-1&&t>=acc+durations[si]){acc+=durations[si];si++;}
    drawGuideFrame(ctx,guide,lang,si,t-acc);
    const frame=new VideoFrame(canvas,{timestamp:Math.round(f*1e6/FPS),duration:Math.round(1e6/FPS)});
    enc.encode(frame,{keyFrame:f%(FPS*2)===0});frame.close();
    if(enc.encodeQueueSize>8)await new Promise(r=>setTimeout(r,0));
    if(onProgress&&f%15===0)onProgress(f/frames);
  }
  await enc.flush();enc.close();
  if(failure)throw failure;
  muxer.finalize();
  if(onProgress)onProgress(1);
  return new Blob([muxer.target.buffer],{type:'video/mp4'});
}
async function recordGuideVideo(guide,lang,onProgress){
  if(typeof VideoEncoder==='function'&&typeof VideoFrame==='function'){
    try{return await encodeGuideMp4(guide,lang,onProgress);}
    catch(e){if(!(e&&e.message==='unsupported'))throw e;}
  }
  const mime=guideVideoMime();
  if(!mime)throw new Error('This browser can’t record video — use Chrome or Edge on a computer.');
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  const ctx=canvas.getContext('2d');
  const stream=canvas.captureStream(30);
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1200000});
  const chunks=[];rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
  const durations=guide.scenes.map(s=>guideSceneMs(s,lang)+1200);
  const total=durations.reduce((a,b)=>a+b,0);
  drawGuideFrame(ctx,guide,lang,0,0);
  rec.start(1000);
  await new Promise(res=>{
    const t0=performance.now();
    const tick=()=>{
      const t=performance.now()-t0;
      let acc=0,si=0;while(si<durations.length-1&&t>acc+durations[si]){acc+=durations[si];si++;}
      drawGuideFrame(ctx,guide,lang,si,t-acc);
      if(onProgress)onProgress(Math.min(1,t/total));
      if(t>=total){res();return;}
      setTimeout(tick,1000/30);
    };
    tick();
  });
  await new Promise(res=>{rec.onstop=res;rec.stop();});
  stream.getTracks().forEach(t=>t.stop());
  return new Blob(chunks,{type:mime.split(';')[0]});
}

// Ready-made videos of every guide, published with the site: guides/<id>_<hi|en>.mp4 (made with
// recordGuideVideo; bump GUIDE_VIDEO_REV when they are re-made so browsers fetch the new files).
const GUIDE_VIDEO_REV='1';
function guideVideoUrl(id,lang){return 'guides/'+id+'_'+(lang==='hi'?'hi':'en')+'.mp4?r='+GUIDE_VIDEO_REV;}
function staffGuideById(id){return STAFF_GUIDES.find(g=>g.id===id)||null;}
function GuideVideoModal({guide,initialLang,onClose}){
  const h=React.createElement;
  const [lang,setLang]=useState(initialLang||'en');
  const [failed,setFailed]=useState(false);
  const [animated,setAnimated]=useState(false);
  if(animated)return h(StaffGuideModal,{guide,initialLang:lang,onClose});
  return h('div',{className:'modal-overlay',onClick:onClose},
    h('div',{className:'modal',style:{width:860,maxWidth:'96vw',padding:16},onClick:e=>e.stopPropagation()},
      h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}},
        h('div',{className:'modal-title',style:{margin:0,flex:1}},'🎬 '+guide.title[lang]),
        ['en','hi'].map(l=>h('button',{key:l,className:'btn btn-sm '+(lang===l?'btn-primary':'btn-ghost'),onClick:()=>{setLang(l);setFailed(false);}},l==='en'?'English':'हिंदी'))),
      failed
        ?h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'🎞'),h('div',{className:'empty-title'},lang==='hi'?'वीडियो लोड नहीं हुआ':'The video could not be loaded'),
            h('div',{className:'empty-sub'},lang==='hi'?'इंटरनेट जाँचें, या नीचे आवाज़ वाला ऐनिमेटेड गाइड चलाएँ।':'Check the connection, or play the animated guide with voice below.'))
        :h('video',{key:lang,src:guideVideoUrl(guide.id,lang),controls:true,autoPlay:true,playsInline:true,preload:'metadata',onError:()=>setFailed(true),
            style:{width:'100%',aspectRatio:'16/9',background:'#000',borderRadius:10,display:'block'}}),
      h('div',{className:'modal-actions'},
        h('button',{className:'btn btn-ghost',onClick:()=>setAnimated(true)},lang==='hi'?'▶ आवाज़ के साथ चलाएँ':'▶ Play with voice'),
        h('a',{className:'btn btn-ghost',href:guideVideoUrl(guide.id,lang),download:'SalonOS_'+guide.id+'_'+(lang==='hi'?'Hindi':'English')+'.mp4'},lang==='hi'?'⬇ डाउनलोड (WhatsApp पर भेजें)':'⬇ Download (to send on WhatsApp)'),
        h('button',{className:'btn btn-primary',onClick:onClose},lang==='hi'?'बंद करें':'Close')))
  );
}
// Small "🎬 How-to" button for the screen a guide is about.
function GuideVideoButton({id,label}){
  const h=React.createElement;
  const [open,setOpen]=useState(false);
  const g=staffGuideById(id);
  if(!g)return null;
  return h(React.Fragment,null,
    h('button',{type:'button',className:'btn btn-ghost btn-sm',title:'Short video: '+g.title.en+' / '+g.title.hi,onClick:()=>setOpen(true)},label||'🎬 How-to'),
    open&&h(GuideVideoModal,{guide:g,initialLang:'en',onClose:()=>setOpen(false)}));
}

// ── Complete training video — every screen with a real example outlet, spoken in English or
// Hindi, with chapters. Made by tools/training-video (local-test/demo.html + narration). ──
const TRAINING_VIDEO_REV='1';
const TRAINING_CHAPTERS={"en":[{"key":"intro","title":"Welcome to SalonOS","start":0.0},{"key":"start","title":"Getting started","start":23.07},{"key":"front","title":"Front desk","start":147.82},{"key":"money","title":"Daily sales, collection & bank","start":227.14},{"key":"payroll","title":"Payroll & HR","start":365.7},{"key":"vendors","title":"Vendors & expenses","start":569.01},{"key":"reports","title":"P&L, reports & Tally","start":687.57},{"key":"admin","title":"Users, settings & good habits","start":826.71}],"hi":[{"key":"intro","title":"SalonOS में आपका स्वागत है","start":0.0},{"key":"start","title":"शुरुआत","start":28.69},{"key":"front","title":"फ्रंट डेस्क","start":169.52},{"key":"money","title":"डेली सेल्स, कलेक्शन और बैंक","start":257.19},{"key":"payroll","title":"पेरोल और HR","start":405.04},{"key":"vendors","title":"वेंडर और खर्चे","start":625.77},{"key":"reports","title":"P&L, रिपोर्ट्स और Tally","start":750.43},{"key":"admin","title":"यूज़र, सेटिंग्स और अच्छी आदतें","start":896.62}],"duration":{"en":909,"hi":987}};
function trainingVideoUrl(lang){return 'guides/training_'+(lang==='hi'?'hi':'en')+'.mp4?r='+TRAINING_VIDEO_REV;}
function fmtClock(sec){sec=Math.max(0,Math.round(sec));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');}
function TrainingVideoModal({initialLang,onClose}){
  const h=React.createElement;
  const [lang,setLang]=useState(initialLang||'en');
  const [failed,setFailed]=useState(false);
  const [now,setNow]=useState(0);
  const vref=useRef(null);
  const chapters=TRAINING_CHAPTERS[lang]||[];
  const curIdx=chapters.reduce((k,c,i)=>now>=c.start-0.25?i:k,0);
  const seek=(c)=>{const v=vref.current;if(!v)return;v.currentTime=c.start+0.05;v.play().catch(()=>{});};
  return h('div',{className:'modal-overlay',onClick:onClose},
    h('div',{className:'modal',style:{width:1120,maxWidth:'97vw',padding:16},onClick:e=>e.stopPropagation()},
      h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}},
        h('div',{className:'modal-title',style:{margin:0,flex:1}},lang==='hi'?'🎓 SalonOS ट्रेनिंग वीडियो':'🎓 SalonOS training video'),
        ['en','hi'].map(l=>h('button',{key:l,className:'btn btn-sm '+(lang===l?'btn-primary':'btn-ghost'),onClick:()=>{setLang(l);setFailed(false);setNow(0);}},l==='en'?'English':'हिंदी'))),
      h('div',{style:{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-start'}},
        h('div',{style:{flex:'1 1 560px',minWidth:0}},
          failed
            ?h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'🎞'),h('div',{className:'empty-title'},lang==='hi'?'वीडियो लोड नहीं हुआ':'The video could not be loaded'),
                h('div',{className:'empty-sub'},lang==='hi'?'इंटरनेट जाँचें और दोबारा खोलें।':'Check the connection and open it again.'))
            :h('video',{key:lang,ref:vref,src:trainingVideoUrl(lang),controls:true,autoPlay:true,playsInline:true,preload:'metadata',onError:()=>setFailed(true),
                onTimeUpdate:e=>setNow(e.currentTarget.currentTime),style:{width:'100%',aspectRatio:'16/9',background:'#000',borderRadius:10,display:'block'}})),
        h('div',{style:{flex:'0 1 280px',minWidth:220,maxHeight:460,overflowY:'auto'}},
          h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}},lang==='hi'?'अध्याय':'Chapters'),
          chapters.map((c,i)=>h('button',{key:c.key,type:'button',onClick:()=>seek(c),
            style:{display:'flex',gap:8,alignItems:'baseline',width:'100%',textAlign:'left',padding:'8px 10px',marginBottom:4,borderRadius:8,cursor:'pointer',
              border:'1px solid '+(i===curIdx?'var(--accent)':'var(--border)'),background:i===curIdx?'var(--accent-dim, rgba(59,130,246,0.12))':'var(--bg2)',color:'var(--text)',fontSize:13}},
            h('span',{style:{fontVariantNumeric:'tabular-nums',color:'var(--text3)',fontSize:11.5,minWidth:38}},fmtClock(c.start)),
            h('span',{style:{fontWeight:i===curIdx?700:500}},(i?i+'. ':'')+c.title))))),
      h('div',{className:'modal-actions'},
        h('a',{className:'btn btn-ghost',href:trainingVideoUrl(lang),download:'SalonOS_Training_'+(lang==='hi'?'Hindi':'English')+'.mp4'},lang==='hi'?'⬇ डाउनलोड':'⬇ Download'),
        h('button',{className:'btn btn-primary',onClick:onClose},lang==='hi'?'बंद करें':'Close')))
  );
}
function TrainingVideoCard({lang}){
  const h=React.createElement;
  const [open,setOpen]=useState(false);
  const ch=TRAINING_CHAPTERS[lang]||[];
  const mins=Math.round((TRAINING_CHAPTERS.duration&&TRAINING_CHAPTERS.duration[lang]||0)/60);
  return h('div',{style:{border:'1px solid var(--accent)',borderRadius:12,padding:'12px 14px',marginBottom:12,background:'var(--bg3)'}},
    h('div',{style:{display:'flex',alignItems:'center',gap:10}},
      h('div',{style:{fontSize:26}},'🎓'),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontWeight:700,fontSize:14}},lang==='hi'?'पूरा ट्रेनिंग वीडियो':'Complete training video'),
        h('div',{style:{fontSize:11.5,color:'var(--text3)'}},(lang==='hi'?'हर स्क्रीन, example के साथ · ':'Every screen, with examples · ')+(ch.length-1)+(lang==='hi'?' अध्याय · ':' chapters · ')+(mins?mins+(lang==='hi'?' मिनट':' min'):''))),
      h('button',{className:'btn btn-primary btn-sm',onClick:()=>setOpen(true)},lang==='hi'?'▶ देखें':'▶ Watch')),
    open&&h(TrainingVideoModal,{initialLang:lang,onClose:()=>setOpen(false)}));
}

// ── Module videos (one per sheet / page, English and Hindi). A person sees only the videos for the
// pages and outlet sheets their own access lets them open (same rules as the sidebar and the sheet
// tabs). Made by tools/training-video (mbuild.py). ──
const MODULE_VIDEO_REV='1';
const MODULE_VIDEOS=[];
function moduleVideoUrl(id,lang){return 'guides/modules/'+id+'_'+(lang==='hi'?'hi':'en')+'.mp4?r='+MODULE_VIDEO_REV;}
function userCanSeeVideo(u,access){
  if(!access||access==='all')return true;
  if(!u)return false;
  const sa=u.role==='Super Admin';
  const reportOnly=REPORTS_ONLY_ROLES.includes(u.role);
  const [kind,id]=String(access).split(':');
  if(kind==='page'){
    if(id==='collaboration')return !reportOnly;
    if(id==='master-sheet'||id==='users'||id==='settings')return sa;
    if(id==='pnl')return sa||reportOnly;
    return true; // dashboard, insights, reports hub: every signed-in user
  }
  if(sa)return true;
  if(reportOnly&&!REPORTS_ONLY_TAB_IDS.includes(id))return false;
  return SALONS.filter(s=>userCanSeeOutlet(u,s.id)).some(s=>{
    const m=(u.sheetAccessByOutlet&&u.sheetAccessByOutlet[s.id])||u.sheetAccess||null;
    if(!m)return true;
    return (m[id]||'View Only')!=='No Access'||(isSummaryApproverRole(u)&&(id==='salary-working'||id==='incentive-working'));
  });
}
function visibleModuleVideos(u){return MODULE_VIDEOS.filter(v=>userCanSeeVideo(u,v.access));}
function ModuleVideoModal({video,initialLang,onClose}){
  const h=React.createElement;
  const [lang,setLang]=useState(initialLang||'en');
  const [failed,setFailed]=useState(false);
  return h('div',{className:'modal-overlay',onClick:onClose},
    h('div',{className:'modal',style:{width:900,maxWidth:'96vw',padding:16},onClick:e=>e.stopPropagation()},
      h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}},
        h('div',{className:'modal-title',style:{margin:0,flex:1}},video.icon+' '+video.title[lang]),
        ['en','hi'].map(l=>h('button',{key:l,className:'btn btn-sm '+(lang===l?'btn-primary':'btn-ghost'),onClick:()=>{setLang(l);setFailed(false);}},l==='en'?'English':'हिंदी'))),
      failed
        ?h('div',{className:'empty-state'},h('div',{className:'empty-icon'},'🎞'),h('div',{className:'empty-title'},lang==='hi'?'वीडियो लोड नहीं हुआ':'The video could not be loaded'),
            h('div',{className:'empty-sub'},lang==='hi'?'इंटरनेट जाँचें और दोबारा खोलें।':'Check the connection and open it again.'))
        :h('video',{key:lang,src:moduleVideoUrl(video.id,lang),controls:true,autoPlay:true,playsInline:true,preload:'metadata',onError:()=>setFailed(true),
            style:{width:'100%',aspectRatio:'16/9',background:'#000',borderRadius:10,display:'block'}}),
      h('div',{className:'modal-actions'},
        h('a',{className:'btn btn-ghost',href:moduleVideoUrl(video.id,lang),download:'SalonOS_'+video.id+'_'+(lang==='hi'?'Hindi':'English')+'.mp4'},lang==='hi'?'⬇ डाउनलोड':'⬇ Download'),
        h('button',{className:'btn btn-primary',onClick:onClose},lang==='hi'?'बंद करें':'Close'))));
}
// "🎓 Video" next to the period on each outlet sheet — the module video for the sheet that is open.
function ModuleVideoButton({id}){
  const h=React.createElement;
  const [open,setOpen]=useState(false);
  const v=MODULE_VIDEOS.find(x=>x.access==='tab:'+id);
  if(!v||!userCanSeeVideo(currentSessionUser(),v.access))return null;
  return h(React.Fragment,null,
    h('button',{type:'button',className:'btn btn-ghost btn-sm',title:'Training video: '+v.title.en+' / '+v.title.hi,onClick:()=>setOpen(true)},'🎓 Video'),
    open&&h(ModuleVideoModal,{video:v,initialLang:'en',onClose:()=>setOpen(false)}));
}
function ModuleVideosList({lang}){
  const h=React.createElement;
  const [watching,setWatching]=useState(null);
  const vids=visibleModuleVideos(currentSessionUser());
  if(!vids.length)return null;
  const groups=[];vids.forEach(v=>{let g=groups.find(x=>x.k===v.group.en);if(!g){g={k:v.group.en,v:v.group,items:[]};groups.push(g);}g.items.push(v);});
  const mins=v=>{const d=v.dur&&v.dur[lang];return d?Math.max(1,Math.round(d/60))+(lang==='hi'?' मिनट':' min'):'';};
  return h('div',{style:{marginBottom:14}},
    h('div',{style:{fontWeight:700,fontSize:13.5,margin:'4px 0 2px'}},(lang==='hi'?'🎓 मॉड्यूल वीडियो':'🎓 Module videos')+' ('+vids.length+')'),
    h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:6}},lang==='hi'?'हर स्क्रीन का पूरा वीडियो — सिर्फ वही जो आप खोल सकते हैं।':'A full video for each screen — only the ones you can open.'),
    groups.map(g=>h('div',{key:g.k},
      h('div',{style:{fontSize:10.5,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.08em',margin:'10px 0 2px'}},g.v[lang]),
      g.items.map(v=>h('div',{key:v.id,style:{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderTop:'1px solid var(--border)'}},
        h('div',{style:{fontSize:20,width:26,textAlign:'center'}},v.icon),
        h('div',{style:{flex:1,minWidth:0}},
          h('div',{style:{fontSize:13,fontWeight:600}},v.title[lang]),
          h('div',{style:{fontSize:11,color:'var(--text3)'}},mins(v))),
        h('button',{className:'btn btn-primary btn-sm',title:lang==='hi'?'वीडियो देखें':'Watch the video',onClick:()=>setWatching(v)},'▶'),
        h('a',{className:'btn btn-ghost btn-sm',title:lang==='hi'?'वीडियो डाउनलोड करें':'Download the video',href:moduleVideoUrl(v.id,lang),download:'SalonOS_'+v.id+'_'+(lang==='hi'?'Hindi':'English')+'.mp4'},'⬇'))))),
    watching&&h(ModuleVideoModal,{video:watching,initialLang:lang,onClose:()=>setWatching(null)}));
}
// The short how-to clips, each tied to the page or sheet it is about.
const STAFF_GUIDE_ACCESS={login:'all',whatsapp:'all',alerts:'all','daily-sales':'tab:daily-sales',attendance:'tab:attendance','vendor-bill':'tab:vendors',
  'bank-statement':'tab:bank-statement',cradlee:'tab:collection','staff-report':'tab:incentive-working',salary:'tab:salary-working',insights:'page:insights'};

function StaffGuidesList(){
  const h=React.createElement;
  const [lang,setLang]=useState('en');
  const [playing,setPlaying]=useState(null);
  const [watching,setWatching]=useState(null);
  const u=currentSessionUser();
  const clips=STAFF_GUIDES.filter(g=>userCanSeeVideo(u,STAFF_GUIDE_ACCESS[g.id]||'all'));
  return h('div',{style:{marginBottom:14}},
    h('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:8}},
      h('div',{style:{fontWeight:700,fontSize:14,flex:1}},'🎬 Video guides'),
      ['en','hi'].map(l=>h('button',{key:l,className:'btn btn-sm '+(lang===l?'btn-primary':'btn-ghost'),onClick:()=>setLang(l)},l==='en'?'English':'हिंदी'))),
    u&&u.role==='Super Admin'&&h(TrainingVideoCard,{lang}),
    h(ModuleVideosList,{lang}),
    clips.length>0&&h('div',{style:{fontWeight:700,fontSize:13.5,margin:'4px 0 2px'}},lang==='hi'?'⚡ छोटे how-to clips':'⚡ Short how-to clips'),
    clips.length>0&&h('div',{style:{fontSize:11.5,color:'var(--text3)',marginBottom:8}},lang==='hi'?'🎞 वीडियो देखें · ▶ आवाज़ के साथ ऐनिमेटेड गाइड · ⬇ वीडियो डाउनलोड करके स्टाफ़ को WhatsApp पर भेजें।':'🎞 watch the video · ▶ animated guide with voice · ⬇ download the video to send to staff on WhatsApp.'),
    clips.map(g=>h('div',{key:g.id,style:{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:'1px solid var(--border)'}},
      h('div',{style:{fontSize:22}},g.icon),
      h('div',{style:{flex:1,minWidth:0}},
        h('div',{style:{fontSize:13,fontWeight:600}},g.title[lang]),
        h('div',{style:{fontSize:11,color:'var(--text3)'}},g.who[lang]+' · '+g.scenes.length+(lang==='hi'?' भाग':' steps'))),
      h('button',{className:'btn btn-primary btn-sm',title:lang==='hi'?'वीडियो देखें':'Watch the video',onClick:()=>setWatching(g)},'🎞'),
      h('button',{className:'btn btn-ghost btn-sm',title:lang==='hi'?'आवाज़ के साथ ऐनिमेटेड गाइड':'Animated guide with voice',onClick:()=>setPlaying(g)},'▶'),
      h('a',{className:'btn btn-ghost btn-sm',title:lang==='hi'?'वीडियो डाउनलोड करें':'Download the video',href:guideVideoUrl(g.id,lang),download:'SalonOS_'+g.id+'_'+(lang==='hi'?'Hindi':'English')+'.mp4'},'⬇'))),
    watching&&h(GuideVideoModal,{guide:watching,initialLang:lang,onClose:()=>setWatching(null)}),
    playing&&h(StaffGuideModal,{guide:playing,initialLang:lang,onClose:()=>setPlaying(null)})
  );
}
