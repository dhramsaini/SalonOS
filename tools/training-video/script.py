# SalonOS training video — scenes. Each line: (highlight target or None, English, Hindi).
# Target = visible text on the screen ("$css" for a selector). Lines play in order; the pointer
# and spotlight move to each line's target while it is spoken.
CHAPTERS = [
  ('intro',   'Welcome to SalonOS',              'SalonOS में आपका स्वागत है'),
  ('start',   'Getting started',                 'शुरुआत'),
  ('front',   'Front desk',                      'फ्रंट डेस्क'),
  ('money',   'Daily sales, collection & bank',  'डेली सेल्स, कलेक्शन और बैंक'),
  ('payroll', 'Payroll & HR',                    'पेरोल और HR'),
  ('vendors', 'Vendors & expenses',              'वेंडर और खर्चे'),
  ('reports', 'P&L, reports & Tally',            'P&L, रिपोर्ट्स और Tally'),
  ('admin',   'Users, settings & good habits',   'यूज़र, सेटिंग्स और अच्छी आदतें'),
]
S = lambda id, ch, opt, lines: dict(id=id, ch=ch, opt=opt, lines=lines)
O = lambda tab, **k: dict(page='salon', tab=tab, **k)

SCENES = [
# ── 0 Intro ──
S('intro', 'intro', {'card': 'intro'}, [
  (None, "Welcome to SalonOS — the complete management software for your salon outlets.",
         "नमस्ते! SalonOS में आपका स्वागत है — आपके सैलून आउटलेट्स को चलाने का पूरा सॉफ्टवेयर।"),
  (None, "In this training we will walk through every screen with a real example outlet, Glow Sector 21, for September 2026.",
         "इस ट्रेनिंग में हम एक example आउटलेट, Glow Sector 21, के September 2026 के डेटा के साथ हर स्क्रीन को step by step देखेंगे।"),
  (None, "Use the chapter list to jump to any topic at any time.",
         "किसी भी टॉपिक पर सीधे जाने के लिए chapter list का इस्तेमाल करें।"),
]),
# ── 1 Getting started ──
S('login', 'start', {'page': 'login'}, [
  ('$#f-1', "Open SalonOS in your browser and sign in with the email given to you by your Super Admin.",
                         "ब्राउज़र में SalonOS खोलें और Super Admin द्वारा दिए गए ईमेल से sign in करें।"),
  ('$input[type=password]', "Type your password. Never share it — every change you make is saved under your name.",
                            "अपना पासवर्ड डालें। इसे किसी से share न करें — आपका हर बदलाव आपके नाम से सेव होता है।"),
  ('Sign In', "Then click Sign In.", "फिर Sign In पर क्लिक करें।"),
]),
S('dashboard', 'start', {'page': 'dashboard', 'do': [['js', "const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.text.startsWith('Sep')));if(s){const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;const o=[...s.options].find(o=>o.text.startsWith('Sep'));set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));}"]]}, [
  ('$.sidebar', "On the left is the sidebar. Global pages are at the top, and every outlet you can access is listed below.",
               "बाईं तरफ sidebar है। ऊपर global pages हैं और नीचे वो सभी आउटलेट्स जिनका access आपको मिला है।"),
  ('Outlet comparison', "The Master Dashboard compares all outlets side by side — revenue, expenses, net profit, staff and attendance.",
                        "Master Dashboard सभी आउटलेट्स को साथ-साथ compare करता है — revenue, खर्चे, net profit, स्टाफ और attendance।"),
  ('Glow Sector 21 — Gurgaon', "Every figure comes from the real entries of that outlet, so nothing here is typed by hand.",
                               "यहाँ का हर आंकड़ा उस आउटलेट की असली entries से आता है, कुछ भी हाथ से नहीं भरा जाता।"),
]),
S('insights', 'start', {'page': 'insights'}, [
  ('Owner Insights', "Owner Insights tells you, for today, which outlet has entered its sales, what it spent and who is present.",
                     "Owner Insights बताता है कि आज किस आउटलेट ने sales entry की, कितना खर्च हुआ और कौन present है।"),
  ('Not entered yet', "If an outlet has not entered today's sales, it shows here in red, so you can follow up immediately.",
                      "अगर किसी आउटलेट ने आज की sales नहीं डाली, तो वो यहाँ लाल रंग में दिखेगा, ताकि आप तुरंत follow up कर सकें।"),
]),
S('master-sheet', 'start', {'page': 'master-sheet'}, [
  ('Master Sheet', "The Master Sheet lists all your outlets with their state, type and status.",
                   "Master Sheet में आपके सभी आउटलेट्स उनकी state, type और status के साथ दिखते हैं।"),
  ('+ Add Salon', "A Super Admin adds a new outlet with Add Salon, or many outlets at once with Bulk Import.",
                  "Super Admin, Add Salon से नया आउटलेट जोड़ता है, या Bulk Import से एक साथ कई आउटलेट्स।"),
  ('Open', "Click Open to enter an outlet.", "किसी आउटलेट में जाने के लिए Open पर क्लिक करें।"),
]),
S('outlet', 'start', O('outlet-dashboard'), [
  ('September 2026 · FY 2026-27', "Inside an outlet, first check the period. All sheets work on this month. Use Change period to switch.",
                                  "आउटलेट के अंदर सबसे पहले period देखें। सारी sheets इसी महीने पर काम करती हैं। बदलने के लिए Change period दबाएँ।"),
  ('$.tab-btn.active', "This row of tabs opens every sheet of the outlet. The arrows scroll the row.",
                       "Tabs की इस line से आउटलेट की हर sheet खुलती है। Arrows से line को आगे-पीछे करें।"),
  ('TOTAL REVENUE', "The outlet dashboard shows revenue, profit, expenses and the collection mix for the month.",
                    "Outlet dashboard में महीने का revenue, profit, खर्चे और collection mix दिखता है।"),
  ('Search', "Press Control K anywhere to search for any sheet, employee or vendor.",
             "कहीं भी Control K दबाकर कोई भी sheet, employee या vendor search करें।"),
  ('Help & Guide', "And Help and Guide always has short videos and steps for each screen.",
                   "और Help & Guide में हर स्क्रीन के छोटे videos और steps हमेशा मिलते हैं।"),
]),
# ── 2 Front desk ──
S('appointments', 'front', O('appointments'), [
  ('Appointment Book', "The Appointment Book shows every stylist as a column and the day's bookings as cards.",
                       "Appointment Book में हर stylist का एक column है और दिन की bookings cards की तरह दिखती हैं।"),
  ('+ New appointment', "Click an empty slot or New appointment to book a client. Click a card to check in, complete or mark a no-show.",
                        "Client बुक करने के लिए खाली slot या New appointment पर क्लिक करें। Card पर क्लिक करके check in, complete या no-show mark करें।"),
  ('Send WhatsApp reminders', "Send WhatsApp reminders to the day's clients with one click.",
                              "एक क्लिक में दिन के clients को WhatsApp reminders भेजें।"),
]),
S('billing', 'front', O('billing'), [
  ('+ New Bill', "Billing is the point of sale. Click New Bill, choose services and products, the stylist and the payment mode.",
                 "Billing आपका point of sale है। New Bill दबाएँ, services और products चुनें, stylist और payment mode चुनें।"),
  ('TODAY\'S COLLECTION', "GST is calculated automatically and today's collection updates live.",
                          "GST अपने-आप लगता है और आज का collection तुरंत update होता है।"),
  ('INV-1520', "Every bill can be viewed, printed as an A4 invoice, edited or deleted.",
               "हर bill को देखा, A4 invoice में print, edit या delete किया जा सकता है।"),
]),
S('clients', 'front', O('clients', do=[['click', 'Anjali']]), [
  ('CLIENTS ON FILE', "Clients is your CRM — visits, total spend and when each client last came.",
                      "Clients आपका CRM है — हर client की visits, कुल खर्च और आखिरी visit कब हुई।"),
  ('VIP', "Filter VIP, regular, new or lapsed clients, and send them a WhatsApp offer.",
          "VIP, regular, new या lapsed clients को filter करें और उन्हें WhatsApp offer भेजें।"),
]),
S('inventory', 'front', O('inventory'), [
  ('Inventory', "Inventory tracks backbar and retail stock. Items below the reorder level are flagged.",
                "Inventory में backbar और retail stock track होता है। Reorder level से कम items flag हो जाते हैं।"),
  ('Draft purchase order', "Draft purchase order prepares an order for everything that is running low.",
                           "Draft purchase order कम हो रहे सभी items का order तैयार कर देता है।"),
]),
# ── 3 Money ──
S('daily-sales', 'money', O('daily-sales'), [
  ('Daily Expenses & Sales Sheet', "Daily Sales and Expenses is the most important daily entry. Each column is a day.",
                                   "Daily Sales & Expenses सबसे ज़रूरी daily entry है। हर column एक दिन है।"),
  ('DAILY EXPENSES', "Enter every cash expense in its row — pantry, conveyance, staff refreshment and so on.",
                     "हर cash खर्च उसकी row में डालें — pantry, conveyance, staff refreshment वगैरह।"),
  ('💾 Save Today', "Entries are made for today's date. Click Save Today when the day's entry is complete.",
                   "Entries आज की तारीख के लिए होती हैं। दिन की entry पूरी होने पर Save Today दबाएँ।"),
  ('Mark Month Final', "At month end, Mark Month Final locks the month so nobody can change it by mistake.",
                       "महीने के अंत में Mark Month Final से महीना lock हो जाता है, ताकि गलती से कोई बदलाव न हो।"),
]),
S('daily-sales-collection', 'money', O('daily-sales', do=[['scroll', 'Cash Sale', 'center']]), [
  ('Cash Sale', "Further down, enter the day's cash, card, UPI and Luzo sales and the cash handover.",
                "नीचे दिन की cash, card, UPI और Luzo sales और cash handover डालें।"),
  ('Closing Cash Balance', "The closing cash balance is worked out for you. The app blocks any entry that would make it negative.",
                           "Closing cash balance अपने-आप निकलता है। जो entry इसे negative कर दे, ऐप उसे रोक देता है।"),
]),
S('collection', 'money', O('collection'), [
  ('Import Collection Data', "Collection Summary imports the day-wise collection report from your billing software, Cradlee.",
                             "Collection Summary आपके billing software, Cradlee, से day-wise collection report import करता है।"),
  ('🔗 Open Cradlee eSoft Login', "Open Cradlee, download the report for the dates, then choose the file here.",
                                 "Cradlee खोलें, तारीखों की report download करें और फिर यहाँ file चुनें।"),
  ('Connect a folder inside Downloads', "Or connect your Downloads folder once, and new reports are imported automatically.",
                                        "या Downloads folder एक बार connect कर दें, नई reports अपने-आप import हो जाएँगी।"),
]),
S('collection-reco', 'money', O('collection-sheet'), [
  ('Collection Reco', "Collection Reco matches three sources every day — the billing software, your counter report and the bank statement.",
                      "Collection Reco हर दिन तीन sources मिलाता है — billing software, आपकी counter report और bank statement।"),
  ('DIFFERENCE', "Any difference is highlighted. Pick a reason for it, such as a credit sale or previous month collection.",
                 "कोई भी difference highlight होता है। उसका reason चुनें, जैसे credit sale या पिछले महीने का collection।"),
]),
S('bank-statement', 'money', O('bank-statement'), [
  ('Bank Statement', "Bank Statement imports the statement from your bank — HDFC, ICICI, Axis, SBI, Kotak and others.",
                     "Bank Statement आपके bank — HDFC, ICICI, Axis, SBI, Kotak वगैरह — का statement import करता है।"),
  ('Quick Access', "Use Quick Access to open your bank's net banking, download the statement, then import it here.",
                   "Quick Access से अपनी net banking खोलें, statement download करें और यहाँ import करें।"),
  ('Re-classify Nature & Dates', "Each line is classified automatically — UPI settlement, card settlement, salary, vendor payment.",
                                 "हर line अपने-आप classify होती है — UPI settlement, card settlement, salary, vendor payment।"),
]),
S('bank-payment', 'money', O('bank-payment'), [
  ('Bank Payment', "Bank Payment creates a bulk NEFT or RTGS file for salary, incentive and vendor payments.",
                   "Bank Payment से salary, incentive और vendor payments की bulk NEFT/RTGS file बनती है।"),
  ('Vendor Payments', "Choose the type, check the amounts, and upload the file to your bank's bulk payment page.",
                      "Type चुनें, amounts check करें और file को bank के bulk payment page पर upload करें।"),
]),
# ── 4 Payroll ──
S('master-salary', 'payroll', O('master-salary'), [
  ('Master Salary Sheet', "Master Salary is the staff master — name, designation, date of joining, weekly off, salary and bank details.",
                          "Master Salary staff का master है — नाम, designation, joining date, weekly off, salary और bank details।"),
  ('+ Add Employee', "Add Employee adds one person. Import adds many from Excel using the template.",
                     "Add Employee से एक व्यक्ति जुड़ता है। Import से template वाली Excel से कई लोग एक साथ।"),
  ('GROSS CTC', "PF, ESIC and professional tax are applied from these settings in every salary.",
                "PF, ESIC और professional tax इन्हीं settings से हर salary में लगते हैं।"),
]),
S('attendance', 'payroll', O('attendance'), [
  ('Employee Attendance', "Attendance is marked day by day. Click any day to mark present, half day, absent or off.",
                          "Attendance रोज़ mark होती है। किसी भी दिन पर क्लिक करके present, half day, absent या off mark करें।"),
  ('PRESENT', "The totals of present, absent, half days and loss-of-pay days update instantly.",
              "Present, absent, half day और LOP days का total तुरंत update होता है।"),
  ('Full Register', "Full Register shows the whole team for the month, and Mark Month Final closes it.",
                    "Full Register में पूरी team का महीना दिखता है, और Mark Month Final से वो close होता है।"),
]),
S('salary-working', 'payroll', O('salary-working'), [
  ('🧮 Generate Salary', "Salary Working calculates every salary from attendance, advances, penalties, PF and ESIC. Click Generate Salary.",
                        "Salary Working हर salary को attendance, advances, penalties, PF और ESIC से calculate करता है। Generate Salary दबाएँ।"),
  ('COLUMN APPLICABILITY', "Turn columns on or off here to match how your outlet pays.",
                           "यहाँ columns on या off करें, जैसे आपका आउटलेट pay करता है।"),
  ('$div[aria-hidden=true][style*="background-image"]', "Until the sheet is locked it shows a DRAFT watermark on screen, in PDF and in Excel.",
                                              "जब तक sheet lock नहीं होती, स्क्रीन, PDF और Excel पर DRAFT watermark दिखता है।"),
  ('🔒 Lock Salary Working', "After checking, Lock Salary Working. It then shows FINAL, and payslips can be shared.",
                            "Check करने के बाद Lock Salary Working करें। फिर FINAL दिखेगा और payslips share कर सकते हैं।"),
]),
S('incentive-working', 'payroll', O('incentive-working'), [
  ('🧮 Generate Incentive', "Incentive Working calculates monthly incentives from targets and actual service, membership and product sales.",
                           "Incentive Working, targets और असली service, membership और product sales से monthly incentive निकालता है।"),
  ('TARGET', "Enter achieved figures; percentages and incentive amounts are calculated automatically.",
             "Achieved figures डालें; percentage और incentive amount अपने-आप calculate होते हैं।"),
  ('⚙ Incentive Rules & Settings', "Incentive Rules and Settings holds the slabs, the columns to show, and the overtime working.",
                                  "Incentive Rules & Settings में slabs, दिखने वाले columns और overtime working है।"),
]),
S('ot-working', 'payroll', O('incentive-working', do=[['click', '⚙ Incentive Rules & Settings', 900], ['js', "const t=[...document.querySelectorAll('.modal input[type=checkbox]')];const lab=[...document.querySelectorAll('.modal *')].find(e=>e.childNodes.length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.includes('Overtime (OT)')));if(lab){const cb=lab.closest('label,div').querySelector('input[type=checkbox]');if(cb&&!cb.checked)cb.click();}"], ['wait', 600], ['scroll', 'Overtime (OT) Working', 'start']]), [
  ('Overtime (OT) Working', "Tick Overtime to turn it on. For each person enter normal working hours per day and the overtime hours.",
                            "Overtime tick करके चालू करें। हर व्यक्ति के लिए रोज़ के normal working hours और OT hours डालें।"),
  ('Applicable', "Untick Applicable for staff who don't get overtime.",
                 "जिन्हें overtime नहीं मिलता, उनका Applicable untick करें।"),
  ('OT Amount', "Overtime is monthly salary, divided by days in the month, divided by normal hours, times overtime hours. Only the total shows on the main sheet as OT Inc.",
                "Overtime के लिए monthly salary को महीने के दिनों से भाग दें, फिर normal hours से भाग दें, और OT hours से गुणा करें। Main sheet पर सिर्फ total, OT Inc के नाम से दिखता है।"),
]),
S('share-workings', 'payroll', O('incentive-working', do=[['click', '📤 Share Workings', 900]]), [
  ('$.modal', "Share Workings sends the incentive working to staff — all employees or only the ones you select.",
                       "Share Workings से incentive working staff को भेजें — सभी employees को या सिर्फ चुने हुए लोगों को।"),
  ('Deductions (penalty, advance)', "Choose which workings to include, then share on WhatsApp or download as PDF.",
         "कौन-सी workings शामिल करनी हैं चुनें, फिर WhatsApp पर share करें या PDF download करें।"),
]),
S('daily-incentive', 'payroll', O('daily-incentive'), [
  ('Daily Incentive Sheet', "Daily Incentive records commissions paid day by day. Entries from Daily Sales come here automatically.",
                            "Daily Incentive में रोज़ दिए गए commissions दर्ज होते हैं। Daily Sales की entries यहाँ अपने-आप आती हैं।"),
  ('+ Add Entry', "Add Entry records any other daily incentive by hand.",
                  "कोई और daily incentive हाथ से डालने के लिए Add Entry दबाएँ।"),
]),
S('advance', 'payroll', O('advance'), [
  ('Advance to Employees', "Advances records money given to staff, with a month-by-month deduction schedule.",
                           "Advances में staff को दिया गया पैसा, महीने-दर-महीने कटौती schedule के साथ दर्ज होता है।"),
  ('📝 Request Advance', "Staff can request an advance; a manager approves it, and the deduction flows into Salary Working.",
                        "Staff advance request कर सकता है; manager approve करता है, और कटौती Salary Working में चली जाती है।"),
  ('OUTSTANDING', "Outstanding and recovered amounts are tracked automatically.",
                  "Outstanding और recovered amount अपने-आप track होते हैं।"),
]),
S('penalty', 'payroll', O('penalty'), [
  ('Penalty on Employees', "Penalties records late arrival, uniform violation and other fines.",
                           "Penalties में late arrival, uniform violation जैसे fines दर्ज होते हैं।"),
  ('+ Add Penalty', "Each penalty is deducted in that month's salary.",
                    "हर penalty उसी महीने की salary से कटती है।"),
]),
# ── 5 Vendors & expenses ──
S('vendors', 'vendors', O('vendors'), [
  ('Vendor Sheet', "Vendor Sheet keeps every vendor bill, its due date and its payments.",
                   "Vendor Sheet में हर vendor bill, उसकी due date और payments रहती हैं।"),
  ('+ Add Invoice', "Click Add Invoice to record a bill.", "Bill दर्ज करने के लिए Add Invoice दबाएँ।"),
  ('OVERDUE', "Overdue and outstanding totals show at the top, so nothing is missed.",
              "Overdue और outstanding total ऊपर दिखते हैं, ताकि कुछ छूटे नहीं।"),
]),
S('vendor-invoice', 'vendors', O('vendors', do=[['click', '+ Add Invoice', 900], ['click', 'Skip — enter manually', 900], ['scroll', 'Bill covers more than one month', 'center']]), [
  ('$.modal', "Enter the vendor, invoice number, dates, category and the GST amounts.",
              "Vendor, invoice number, तारीखें, category और GST amounts डालें।"),
  ('Bill covers more than one month', "If one bill covers several months — like a two-month electricity bill — tick this box. The amount is split across those months in the P&L.",
                                      "अगर एक bill कई महीनों का है — जैसे दो महीने का बिजली bill — तो यह box tick करें। Amount P&L में उन महीनों में बँट जाता है।"),
]),
S('due-dates', 'vendors', O('due-dates'), [
  ('Due Date Tracker', "Due Dates lists everything that must be paid — salary, PF, ESIC, TDS, GST and vendor bills.",
                       "Due Dates में सब कुछ है जो pay करना है — salary, PF, ESIC, TDS, GST और vendor bills।"),
  ('✓ Mark Paid', "Overdue items are red. Mark each one paid when it is done.",
                  "Overdue items लाल हैं। Pay होने पर हर एक को Mark Paid करें।"),
]),
S('recurring', 'vendors', O('recurring-expenses'), [
  ('Recurring Expenses', "Recurring Expenses holds the bills that come every period — rent, electricity, internet, software.",
                         "Recurring Expenses में हर period आने वाले bills हैं — rent, बिजली, internet, software।"),
  ('Electricity', "For a variable bill like electricity, choose prepaid or postpaid billing and the months each bill covers.",
                  "बिजली जैसे variable bill के लिए prepaid या postpaid billing और bill कितने महीनों का है, चुनें।"),
  ('➕ Enter bill', "When the bill arrives, click Enter bill. Read bill can fill the details from a photo or PDF.",
                   "Bill आने पर Enter bill दबाएँ। Read bill, photo या PDF से details भर सकता है।"),
]),
S('recurring-accrual', 'vendors', O('recurring-expenses'), [
  ('📒 Register', "If a month's bill has not come yet, SalonOS books an estimate from the previous bill.",
                 "अगर किसी महीने का bill अभी नहीं आया, तो SalonOS पिछले bill से estimate book करता है।"),
  (None, "When the actual bill arrives, the difference is adjusted in that month — with a full register of estimate, actual and adjustment.",
         "असली bill आने पर, difference उसी महीने में adjust होता है — estimate, actual और adjustment का पूरा register रहता है।"),
  ('💳', "For electricity, save the consumer number and payment link, and pay online with one click.",
         "बिजली के लिए consumer number और payment link सेव करें, और एक क्लिक में online pay करें।"),
]),
S('fixed-assets', 'vendors', O('fixed-assets'), [
  ('Fixed Assets', "Fixed Assets picks up every vendor bill booked with the category Fixed Assets, and works out depreciation.",
                   "Fixed Assets उन सभी vendor bills को लेता है जिनकी category Fixed Assets है, और depreciation निकालता है।"),
]),
# ── 6 Reports ──
S('pnl', 'reports', O('outlet-pnl'), [
  ('Monthly P&L — Glow Sector 21 — Gurgaon', "P&L Monthly builds the outlet's profit and loss from billing, daily sales, salary and vendor entries.",
                                             "P&L Monthly, billing, daily sales, salary और vendor entries से आउटलेट का profit & loss बनाता है।"),
  ('REVENUE', "Click any line to see exactly which entries make up the number.",
              "किसी भी line पर क्लिक करके देखें कि वो आंकड़ा किन entries से बना है।"),
  ('✓ Mark as Final', "While you are still checking it shows DRAFT. When it's right, click Mark as Final.",
                      "Check करते समय DRAFT दिखता है। सही होने पर Mark as Final दबाएँ।"),
]),
S('pnl-final', 'reports', O('outlet-pnl', do=[['click', '✓ Mark as Final', 900]]), [
  ('FINAL', "Now the P&L, its PDF and Excel all carry the FINAL mark. An admin can un-finalize it if a correction is needed.",
            "अब P&L, उसकी PDF और Excel पर FINAL mark लगता है। Correction चाहिए तो admin इसे un-finalize कर सकता है।"),
]),
S('previous-pnl', 'reports', O('previous-pnl'), [
  ('+ Add Month', "Previous Months P&L is for months before you started SalonOS — add them one by one or bulk import.",
                  "Previous Months P&L उन महीनों के लिए है जब SalonOS शुरू नहीं हुआ था — एक-एक करके या bulk import से डालें।"),
]),
S('tally', 'reports', O('tally-export'), [
  ('Tally Integration', "Tally Export moves your purchases, payments and receipts into Tally.",
                        "Tally Export आपकी purchases, payments और receipts को Tally में भेजता है।"),
  ('Settings', "First, install the SalonOS Tally Connector once on the computer that runs Tally — the steps are in Settings.",
               "पहले, Tally वाले computer पर SalonOS Tally Connector एक बार install करें — steps Settings में हैं।"),
  ('⟳ Check connection', "When Tally is open, the status shows Connected with your company name.",
                        "Tally खुला होने पर status में Connected और आपकी company का नाम दिखता है।"),
]),
S('tally-vouchers', 'reports', O('tally-export', do=[['click', 'Vouchers', 800]]), [
  ('Vouchers', "Vouchers lists every entry ready for Tally. Nothing is sent automatically.",
               "Vouchers में Tally के लिए तैयार हर entry है। कुछ भी अपने-आप नहीं भेजा जाता।"),
  ('$thead input[type=checkbox]', "Select the entries and click Move to Tally — you always see a preview first, and only then confirm.",
                                  "Entries चुनें और Move to Tally दबाएँ — पहले हमेशा preview दिखेगा, उसके बाद ही confirm करें।"),
  ('Ledgers', "In Ledgers, map each SalonOS ledger to Tally. Similar Tally ledgers are suggested for you.",
              "Ledgers में हर SalonOS ledger को Tally से map करें। मिलते-जुलते Tally ledgers suggest होते हैं।"),
]),
S('reports', 'reports', O('reports'), [
  ('Cash Register', "Reports has ready registers — cash register, expense register, TDS, PF, ESIC and PT summaries.",
                    "Reports में तैयार registers हैं — cash register, expense register, TDS, PF, ESIC और PT summaries।"),
  ('Share', "Every report can be shared or exported to Excel.",
            "हर report share या Excel में export हो सकती है।"),
]),
S('audit-log', 'reports', O('audit-log'), [
  ('Audit Log', "Audit Log shows who changed what, and when, for this outlet.",
                "Audit Log दिखाता है कि इस आउटलेट में किसने, क्या और कब बदला।"),
]),
S('import-center', 'reports', O('import-center'), [
  ('Import Center', "Import Center has every Excel template and bulk upload in one place — staff, vendors, incentives and more.",
                    "Import Center में हर Excel template और bulk upload एक जगह है — staff, vendors, incentives वगैरह।"),
]),
S('reports-hub', 'reports', {'page': 'reports', 'do': [['js', "const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.text.startsWith('Sep')));if(s){const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;const o=[...s.options].find(o=>o.text.startsWith('Sep'));set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));}"]]}, [
  ('Reports Hub', "Reports Hub, in the sidebar, combines reports across all outlets — revenue, expenses, P&L and salary.",
                  "Sidebar का Reports Hub सभी आउटलेट्स की reports जोड़ता है — revenue, खर्चे, P&L और salary।"),
]),
# ── 7 Admin ──
S('users', 'admin', {'page': 'users'}, [
  ('User Management', "User Management is where a Super Admin creates logins.",
                      "User Management में Super Admin logins बनाता है।"),
  ('+ Add User', "Each user gets a role, the outlets they can see, and view or edit rights for each sheet.",
                 "हर user को एक role, दिखने वाले outlets, और हर sheet के view या edit rights मिलते हैं।"),
  ('Salon Manager', "Changes to access apply within a minute — the user does not need to sign in again.",
                    "Access में बदलाव एक मिनट में लागू होता है — user को दोबारा sign in नहीं करना पड़ता।"),
]),
S('settings', 'admin', {'page': 'settings'}, [
  ('⬇ Take Backup (JSON)', "Master Settings has backup and restore. Data is saved to the cloud, and a backup file is extra safety.",
                          "Master Settings में backup और restore है। Data cloud में सेव होता है, और backup file extra सुरक्षा है।"),
  ('Statutory Provisions', "Statutory settings — PF, ESIC and professional tax — apply to every outlet.",
                           "Statutory settings — PF, ESIC और professional tax — हर आउटलेट पर लागू होती हैं।"),
]),
S('review', 'admin', {'page': 'collaboration'}, [
  ('Review Centre', "Review Centre is where submitted sheets are approved or returned with a comment.",
                    "Review Centre में submit की गई sheets approve होती हैं या comment के साथ वापस भेजी जाती हैं।"),
]),
S('outro', 'admin', {'card': 'outro'}, [
  (None, "A good daily routine: enter today's sales and expenses, mark attendance, and record every bill the day it arrives.",
         "रोज़ की अच्छी आदत: आज की sales और खर्चे डालें, attendance mark करें, और हर bill उसी दिन दर्ज करें।"),
  (None, "At month end: finalize attendance, generate and lock salary and incentives, check the P&L, mark it final and move entries to Tally.",
         "महीने के अंत में: attendance final करें, salary और incentive generate करके lock करें, P&L check करके final करें और entries Tally में भेजें।"),
  (None, "That's it — you are ready to use SalonOS. For help, open Help and Guide at any time.",
         "बस इतना ही — अब आप SalonOS इस्तेमाल करने के लिए तैयार हैं। मदद के लिए कभी भी Help & Guide खोलें।"),
]),
]

TOPICS = {
  'start':   (['Sign in','Master Dashboard','Owner Insights','Master Sheet','Outlet, period & tabs'],
              ['Sign in','Master Dashboard','Owner Insights','Master Sheet','आउटलेट, period और tabs']),
  'front':   (['Appointments','Billing','Clients','Inventory'],['Appointments','Billing','Clients','Inventory']),
  'money':   (['Daily Sales & Expenses','Collection Summary','Collection Reco','Bank Statement','Bank Payment'],
              ['Daily Sales & Expenses','Collection Summary','Collection Reco','Bank Statement','Bank Payment']),
  'payroll': (['Master Salary','Attendance','Salary Working','Incentive Working & OT','Daily Incentive, Advances, Penalties'],
              ['Master Salary','Attendance','Salary Working','Incentive Working और OT','Daily Incentive, Advances, Penalties']),
  'vendors': (['Vendor bills','Due Dates','Recurring Expenses & accruals','Fixed Assets'],
              ['Vendor bills','Due Dates','Recurring Expenses और accruals','Fixed Assets']),
  'reports': (['P&L Monthly & Mark as Final','Previous Months P&L','Tally Export','Reports, Audit Log, Import Center'],
              ['P&L Monthly और Mark as Final','Previous Months P&L','Tally Export','Reports, Audit Log, Import Center']),
  'admin':   (['User Management','Master Settings & backup','Review Centre','Daily & month-end routine'],
              ['User Management','Master Settings और backup','Review Centre','रोज़ और महीने के अंत का routine']),
}

def full_scenes():
    out=[]; seen=set(); n=0
    for s in SCENES:
        if s['ch'] not in seen:
            seen.add(s['ch'])
            if s['ch']!='intro':
                n+=1
                key,en,hi=[c for c in CHAPTERS if c[0]==s['ch']][0]
                out.append(dict(id='ch_'+key,ch=key,num=n,opt={'card':'chapter'},
                    lines=[(None,f"Chapter {n}: {en}.",f"अध्याय {n}: {hi}।")]))
        out.append(s)
    return out
