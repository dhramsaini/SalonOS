from modules._h import *
MODS = {}
SEP = set_select('Oct', 'Sep')
CTRLF = js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));await sleep(500);")

MODS['basics'] = [
 dict(id='login', opt={'page': 'login'}, lines=[
  ('$#f-1', "Open SalonOS in Chrome or Edge and sign in with the email your Super Admin created for you.",
   "Chrome या Edge में SalonOS खोलें और Super Admin द्वारा बनाए गए email से sign in करें।"),
  ('$input[type=password]', "Type your password. Never share it — every change is saved under your name, and the Audit Log shows it.",
   "अपना password डालें। इसे कभी share न करें — हर बदलाव आपके नाम से सेव होता है, और Audit Log में दिखता है।"),
  ('Forgot password?', "Forgot password sends a reset link to your email.", "Forgot password आपके email पर reset link भेजता है।"),
 ]),
 dict(id='sidebar', lines=[
  ('$.sidebar', "After signing in, the sidebar is on the left. Global pages are at the top; below are the outlets you have access to.",
   "Sign in के बाद बाईं तरफ sidebar है। ऊपर global pages हैं; नीचे वो outlets जिनका access आपको है।"),
  ('Glow Sector 21', "You only see the outlets and pages your Super Admin has given you. Click an outlet to open it.",
   "आपको सिर्फ वही outlets और pages दिखते हैं जो Super Admin ने दिए हैं। Outlet खोलने के लिए उस पर क्लिक करें।"),
  ('Amit Kumar', "Your name and role are at the bottom of the sidebar.", "आपका नाम और role sidebar में नीचे है।"),
 ]),
 dict(id='period', opt={'page': 'salon', 'tab': 'outlet-dashboard'}, lines=[
  ('September 2026 · FY 2026-27', "Inside an outlet, check the period first. Every sheet of the outlet works on this month.",
   "Outlet के अंदर पहले period देखें। Outlet की हर sheet इसी महीने पर काम करती है।"),
  ('Change period', "Change period picks another month. You can save it as the default for this outlet; Clear default removes that.",
   "Change period दूसरा महीना चुनता है। इसे इस outlet का default सेव कर सकते हैं; Clear default उसे हटाता है।"),
 ]),
 dict(id='tabs', opt={'page': 'salon', 'tab': 'outlet-dashboard'}, lines=[
  ('$.tab-btn.active', "This row of tabs opens every sheet of the outlet — front desk, payroll, money, and reports. Use the arrows to scroll it.",
   "Tabs की यह line outlet की हर sheet खोलती है — front desk, payroll, money और reports। Arrows से इसे scroll करें।"),
  ('← Back', "Back returns to where you were. On a phone, the sheets appear in a menu at the bottom instead.",
   "Back वहीं लौटाता है जहाँ आप थे। Phone पर sheets नीचे के menu में दिखती हैं।"),
 ]),
 dict(id='search', opt={'page': 'salon', 'tab': 'outlet-dashboard', 'do': [CTRLF]}, lines=[
  ('$.cp', "Press Control F anywhere to search. Type a sheet, an employee, a vendor or an outlet, and press Enter to jump straight there.",
   "कहीं भी Control F दबाकर search करें। Sheet, employee, vendor या outlet का नाम लिखें, और Enter दबाकर सीधे वहाँ जाएँ।"),
  (None, "The slash key also opens search. Search only shows what you have access to.", "Slash key से भी search खुलता है। Search में सिर्फ वही दिखता है जिसका आपको access है।"),
 ]),
 dict(id='topbar', opt={'page': 'salon', 'tab': 'outlet-dashboard'}, lines=[
  ('Refresh', "Refresh pulls the latest data from the cloud — useful when a colleague has just made changes.",
   "Refresh cloud से नया data लाता है — जब किसी साथी ने अभी बदलाव किए हों तब काम का।"),
  ('Saved just now', "Every change is saved automatically and synced to the cloud. This button shows the save status; click it to save immediately.",
   "हर बदलाव अपने-आप सेव होकर cloud में sync होता है। यह button save status दिखाता है; तुरंत सेव करने के लिए क्लिक करें।"),
  ('Dark', "Dark switches to a dark theme, easier on the eyes at night.", "Dark, dark theme पर बदलता है, रात में आँखों के लिए आसान।"),
 ]),
 dict(id='excel', opt={'page': 'salon', 'tab': 'vendors'}, lines=[
  ('Click a cell — or drag across several — then Ctrl/Cmd+C to copy, just like Excel.', "Tables work like Excel: click a cell or drag across several, and press Control C to copy. Column headers have filters and sorting.",
   "Tables Excel जैसी चलती हैं: cell पर क्लिक करें या कई cells पर drag करें, और Control C से copy करें। Column headers में filters और sorting हैं।"),
  ('⬇ Import Template', "Most sheets can export to Excel or PDF, and share on WhatsApp or email.", "ज़्यादातर sheets Excel या PDF में export, और WhatsApp या email पर share हो सकती हैं।"),
 ]),
 dict(id='help', opt={'page': 'salon', 'tab': 'outlet-dashboard', 'do': [['click', 'Help & Guide', 900]]}, lines=[
  ('Help & Guide', "Help and Guide opens the training videos and help topics. You will see videos only for the sheets you can open.",
   "Help & Guide training videos और help topics खोलता है। आपको सिर्फ उन sheets के videos दिखेंगे जिन्हें आप खोल सकते हैं।"),
  (None, "Each video is available in English and Hindi, and can be downloaded to share with staff.", "हर video English और Hindi में है, और staff के साथ share करने के लिए download हो सकता है।"),
 ]),
 dict(id='signout', lines=[
  ('Sign Out', "When you finish, sign out — especially on a shared counter computer. SalonOS also signs you out after thirty minutes without activity, but never while a change is still saving.",
   "काम खत्म होने पर sign out करें — खासकर shared counter computer पर। SalonOS तीस मिनट तक कोई activity न होने पर भी sign out कर देता है, पर बदलाव सेव होते समय कभी नहीं।"),
  ('Super Admin', "If your access changes, it applies within a minute — you don't need to sign in again.", "आपका access बदलता है तो एक मिनट में लागू होता है — दोबारा sign in नहीं करना पड़ता।"),
 ]),
]

MODS['review'] = [
 dict(id='top', lines=[
  ('Review Centre', "The Review Centre is where submitted data is reviewed. Super Admins and Reviewers see the Review Centre; other users see it as My Submissions.",
   "Review Centre में submit किया गया data review होता है। Super Admins और Reviewers को Review Centre दिखता है; बाकी users को My Submissions।"),
  ('SUBMITTED', "Cards count submissions that are submitted, under review, approved and returned.", "Cards में submitted, under review, approved और returned submissions गिने जाते हैं।"),
 ]),
 dict(id='filters', lines=[
  ('All', "Filter by status. Each submission shows the outlet, period, who submitted it and when, and its status.",
   "Status से filter करें। हर submission में outlet, period, किसने और कब submit किया, और status है।"),
  ('Review', "Click Review to open it, check the figures, then approve it or return it with a comment saying what to fix.",
   "Review दबाकर खोलें, आंकड़े check करें, फिर approve करें या comment के साथ return करें कि क्या ठीक करना है।"),
 ]),
 dict(id='flow', lines=[
  (None, "Outlet users submit their month's data from My Submissions. A returned item comes back to them with the comment, they correct it, and submit again.",
   "Outlet users My Submissions से महीने का data submit करते हैं। Returned item comment के साथ उनके पास लौटता है, वो ठीक करके फिर submit करते हैं।"),
  (None, "Salary and incentive summaries are approved separately, inside Salary Working and Incentive Working, by the Salon Manager or ASM.",
   "Salary और incentive summaries अलग से, Salary Working और Incentive Working के अंदर, Salon Manager या ASM approve करते हैं।"),
 ]),
]

MODS['dashboard'] = [
 dict(id='top', opt={'do': [SEP]}, lines=[
  ('Master Dashboard', "The Master Dashboard compares all your outlets for the financial year.", "Master Dashboard financial year के लिए आपके सभी outlets compare करता है।"),
  ('All Outlets', "Choose all outlets or one outlet, and the financial year.", "सभी outlets या एक outlet, और financial year चुनें।"),
 ]),
 dict(id='compare', opt={'do': [SEP]}, lines=[
  ('Outlet comparison', "Outlet comparison ranks the outlets for one month by revenue — with change against last month, expenses, net profit, margin, staff, revenue per staff and attendance.",
   "Outlet comparison एक महीने के लिए outlets को revenue से rank करता है — पिछले महीने से बदलाव, खर्चे, net profit, margin, staff, revenue per staff और attendance के साथ।"),
  ('Sep 2026', "Pick the month for the comparison here.", "Comparison का महीना यहाँ चुनें।"),
  ('Glow Sector 21 — Gurgaon', "Example, September: Sector 21 leads with about eight lakh sixteen thousand revenue, then DLF Phase 4 and Rajouri Garden.",
   "Example, September: Sector 21 लगभग आठ लाख सोलह हज़ार revenue के साथ सबसे आगे, फिर DLF Phase 4 और Rajouri Garden।"),
 ]),
 dict(id='kpi', opt={'do': [SEP, ['scroll', 'TOTAL REVENUE', 'center']]}, lines=[
  ('TOTAL REVENUE', "The cards give the year's total revenue, net profit, total expenses and active staff across the outlets chosen.",
   "Cards चुने गए outlets का साल का total revenue, net profit, total expenses और active staff दिखाते हैं।"),
  (None, "Below are the monthly revenue trend and outlet performance charts, and payroll figures — salaries, PF, ESIC, net disbursed and loss-of-pay days.",
   "नीचे monthly revenue trend और outlet performance charts, और payroll figures — salaries, PF, ESIC, net disbursed और loss-of-pay days — हैं।"),
 ]),
 dict(id='note', opt={'do': [SEP]}, lines=[
  ('Same figures as each outlet\'s P&L and Salary Working. Ranked by revenue.', "Every figure comes from the same engine as each outlet's P&L and Salary Working — nothing is typed here.",
   "हर आंकड़ा उसी engine से आता है जिससे हर outlet का P&L और Salary Working बनता है — यहाँ कुछ type नहीं होता।"),
  (None, "You only see outlets you have access to.", "आपको सिर्फ वही outlets दिखते हैं जिनका access आपको है।"),
 ]),
]

MODS['insights'] = [
 dict(id='top', lines=[
  ('💡 Owner Insights', "Owner Insights shows, for today, how every outlet is doing, where the month is heading, the bills due, and the team.",
   "Owner Insights आज के लिए दिखाता है हर outlet कैसा चल रहा है, महीना किधर जा रहा है, due bills, और team।"),
 ]),
 dict(id='today', lines=[
  ('📍 Today', "Today: each outlet's sales so far by cash, card, UPI and Luzo, today's expenses and the month so far.",
   "Today: हर outlet की आज तक की sales — cash, card, UPI और Luzo — आज के खर्चे और महीने का अब तक का total।"),
  ('Not entered yet', "Not entered yet in red means the outlet hasn't entered today's sales — a quick reason to call the manager.",
   "लाल रंग में Not entered yet का मतलब outlet ने आज की sales नहीं डाली — manager को call करने का कारण।"),
  (None, "It also shows how many staff are present and how many are not marked.", "ये भी दिखता है कितने staff present हैं और कितने mark नहीं हुए।"),
 ]),
 dict(id='forecast', opt={'do': [['scroll', '🔮 Forecast', 'start']]}, lines=[
  ('🔮 Forecast', "Forecast projects the month's close from the days so far, compares it with your target and last month's costs, and tells you if you are short.",
   "Forecast अब तक के दिनों से महीने का close अनुमानित करता है, target और पिछले महीने के खर्चों से मिलाता है, और बताता है कि कमी है या नहीं।"),
  (None, "Type a target for each outlet and Save.", "हर outlet का target लिखकर Save करें।"),
 ]),
 dict(id='bills', opt={'do': [['scroll', '💸 Bills due in the next 7 days', 'start']]}, lines=[
  ('💸 Bills due in the next 7 days', "Bills due in the next seven days lists vendor, invoice and balance, so payments are planned in time.",
   "अगले सात दिनों में due bills — vendor, invoice और balance — ताकि payments समय पर plan हों।"),
 ]),
 dict(id='staff', opt={'do': [['scroll', '🏅 Staff scorecard & month-end pack', 'start']]}, lines=[
  ('🏅 Staff scorecard & month-end pack', "The staff scorecard ranks employees by sales, achievement, attendance and sales against pay.",
   "Staff scorecard employees को sales, achievement, attendance और pay के मुकाबले sales से rank करता है।"),
  (None, "Month-end pack downloads a summary of the month for the owner.", "Month-end pack owner के लिए महीने का summary download करता है।"),
 ]),
]

MODS['master-sheet'] = [
 dict(id='top', lines=[
  ('Master Sheet', "The Master Sheet holds all outlets of the business. Only a Super Admin sees it.", "Master Sheet में business के सभी outlets हैं। ये सिर्फ Super Admin को दिखता है।"),
  ('TOTAL OUTLETS', "Cards count total, active, owned and franchise outlets. Search by name, city or manager.", "Cards में total, active, owned और franchise outlets गिने जाते हैं। नाम, city या manager से search करें।"),
 ]),
 dict(id='row', lines=[
  ('Open', "Each row shows city, type, GST number, manager, phone and status. Open enters the outlet.", "हर row में city, type, GST number, manager, phone और status है। Open outlet में ले जाता है।"),
  ('✏ Edit', "Edit changes the outlet's details and settings.", "Edit outlet की details और settings बदलता है।"),
  ('🔒 Months', "Months locks or unlocks past months for this outlet — a locked month cannot be changed anywhere.", "Months इस outlet के पिछले महीने lock या unlock करता है — locked महीना कहीं भी बदला नहीं जा सकता।"),
 ]),
 dict(id='add', opt={'do': [['click', '+ Add Salon', 900]]}, lines=[
  ('@modal', "Add Salon: the outlet name, type — owned, COCO, FOCO or franchise — and the firm details: firm name, brand name and logo, firm category and the proprietor or partners.",
   "Add Salon: outlet का नाम, type — owned, COCO, FOCO या franchise — और firm details: firm name, brand name और logo, firm category और proprietor या partners।"),
  (None, "The firm category also decides the depreciation method — Companies Act for companies and LLPs, Income Tax blocks for others.",
   "Firm category depreciation method भी तय करती है — companies और LLPs के लिए Companies Act, बाकियों के लिए Income Tax blocks।"),
 ]),
 dict(id='add2', opt={'do': [['click', '+ Add Salon', 900], scroll_modal(900)]}, lines=[
  ('@modal', "Then address, GST and PAN, manager and contact, the outlet's bank account, and the ESIC, PF, TAN and professional tax registration numbers.",
   "फिर address, GST और PAN, manager और contact, outlet का bank account, और ESIC, PF, TAN व professional tax registration numbers।"),
  (None, "Settings for the outlet: whether bills must be attached, how many days back entries can be edited, and the bill approval limit above which a Super Admin must approve before payment.",
   "Outlet की settings: bills attach करना ज़रूरी है या नहीं, कितने दिन पीछे तक entries edit हो सकती हैं, और bill approval limit जिसके ऊपर payment से पहले Super Admin approve करे।"),
 ]),
 dict(id='bulk', lines=[
  ('📥 Bulk Import Salons', "To add many outlets, download the Import Template, fill it, and use Bulk Import Salons.", "कई outlets जोड़ने के लिए Import Template download करें, भरें, और Bulk Import Salons इस्तेमाल करें।"),
  ('Delete', "Delete removes an outlet and all its data — use it only for a mistake, and take a backup first.", "Delete outlet और उसका सारा data हटाता है — सिर्फ गलती होने पर, और पहले backup लेकर।"),
  (None, "Setup order for a new outlet: add the outlet, add employees, import a bank statement, then set incentive rules.",
   "नए outlet का setup order: outlet जोड़ें, employees जोड़ें, bank statement import करें, फिर incentive rules set करें।"),
 ]),
]

MODS['reports-hub'] = [
 dict(id='top', opt={'do': [SEP]}, lines=[
  ('Reports Hub', "The Reports Hub combines reports across your outlets.", "Reports Hub आपके outlets की reports को जोड़ता है।"),
  ('All Outlets', "Choose all outlets or one, and the month and year.", "सभी outlets या एक, और महीना व साल चुनें।"),
  ('TOTAL REVENUE', "Cards give revenue, net profit, expenses and gross margin for the selection, with a six-month revenue and expense trend.",
   "Cards चुने गए हिस्से का revenue, net profit, expenses और gross margin देते हैं, छह महीने के revenue और expense trend के साथ।"),
 ]),
 dict(id='cards', opt={'do': [SEP, ['scroll', 'Revenue Report', 'center']]}, lines=[
  ('Revenue Report', "Below are twelve ready reports: revenue, expense, P&L summary, salary register, attendance, incentive, vendor payables with ageing, advance register, collection, penalty register, compliance calendar and daily sales.",
   "नीचे बारह तैयार reports हैं: revenue, expense, P&L summary, salary register, attendance, incentive, ageing के साथ vendor payables, advance register, collection, penalty register, compliance calendar और daily sales।"),
  ('View', "View opens a report on screen; CSV downloads it for Excel.", "View report screen पर खोलता है; CSV उसे Excel के लिए download करता है।"),
 ]),
 dict(id='open', opt={'do': [SEP, ['click', 'View', 900]]}, lines=[
  (None, "Each report shows the outlet with every line, and Export CSV downloads exactly that.", "हर report हर line के साथ outlet दिखाती है, और Export CSV वही download करता है।"),
  (None, "Use the Reports Hub for owner reviews across outlets; use each outlet's Reports tab for that outlet's registers.",
   "Outlets की owner review के लिए Reports Hub, और किसी outlet के registers के लिए उसका Reports tab इस्तेमाल करें।"),
 ]),
]

MODS['pnl-statement'] = [
 dict(id='top', lines=[
  ('Profit & Loss Statement', "The P&L Statement shows the whole financial year month by month, from each month's P&L.",
   "P&L Statement पूरा financial year महीने-दर-महीने दिखाता है, हर महीने के P&L से।"),
  ('ANNUAL REVENUE', "Cards give annual revenue, annual expenses, annual net profit and the average net margin.", "Cards में annual revenue, annual expenses, annual net profit और average net margin है।"),
 ]),
 dict(id='table', lines=[
  ('A. REVENUE', "Rows are revenue — cash, card and UPI sale and other income — then direct cost, employee cost, operating expenses, and depreciation and interest.",
   "Rows में revenue — cash, card और UPI sale और other income — फिर direct cost, employee cost, operating expenses, और depreciation व interest।"),
  ('Glow Sector 21', "Columns are April to March, with the annual total. Choose the outlet and year at the top.", "Columns April से March हैं, annual total के साथ। ऊपर outlet और year चुनें।"),
  (None, "Months from Previous Months P&L are included, so you see the full year even before SalonOS.", "Previous Months P&L के महीने भी शामिल हैं, ताकि SalonOS से पहले का साल भी दिखे।"),
 ]),
 dict(id='share', lines=[
  ('Share', "Share sends the statement as a report. It is available to Super Admins, Reviewers and Owners.", "Share statement को report की तरह भेजता है। ये Super Admins, Reviewers और Owners के लिए है।"),
 ]),
]

MODS['users'] = [
 dict(id='top', lines=[
  ('User Management', "User Management is where a Super Admin creates logins and decides exactly what each person can see and change.",
   "User Management में Super Admin logins बनाता है और तय करता है कि हर व्यक्ति क्या देख और बदल सकता है।"),
  ('TOTAL USERS', "Cards count users, active users, super admins and users with sheet access.", "Cards में users, active users, super admins और sheet access वाले users गिने जाते हैं।"),
 ]),
 dict(id='list', lines=[
  ('Salon Manager', "Each user shows name, email, role, outlets, sheets, status and last login.", "हर user का नाम, email, role, outlets, sheets, status और last login दिखता है।"),
  ('Active', "Click the status to deactivate someone — they cannot log in, but the account stays and can be reactivated. Delete erases the login permanently; their data stays.",
   "किसी को deactivate करने के लिए status पर क्लिक करें — वो log in नहीं कर सकते, पर account बना रहता है और reactivate हो सकता है। Delete login हमेशा के लिए मिटाता है; उनका data रहता है।"),
 ]),
 dict(id='create', opt={'do': [['click', '+ Add User', 900]]}, lines=[
  ('@modal', "Add User: full name, email, role and a password of at least eight characters. Share the password privately.",
   "Add User: पूरा नाम, email, role और कम से कम आठ characters का password। Password निजी तौर पर share करें।"),
  (None, "Roles: Super Admin sees everything. Salon Owner and Salon Manager follow the access you set. Data Entry User and Accountant usually get only their sheets. Reviewer and Owner are read-only, reports only.",
   "Roles: Super Admin सब कुछ देखता है। Salon Owner और Salon Manager आपके set किए access पर चलते हैं। Data Entry User और Accountant को आमतौर पर सिर्फ उनकी sheets मिलती हैं। Reviewer और Owner सिर्फ पढ़ सकते हैं, reports only।"),
  (None, "Access until sets a date after which the login stops working — useful for trainees or auditors.", "Access until एक तारीख तय करता है जिसके बाद login बंद हो जाता है — trainees या auditors के लिए काम का।"),
 ]),
 dict(id='outlets', opt={'do': [['click', '+ Add User', 900], ['scroll', 'Outlet Access', 'start']]}, lines=[
  ('Outlet Access', "Outlet Access: for each outlet choose No Access, View Only, or View and Edit. Grant buttons set all outlets at once.",
   "Outlet Access: हर outlet के लिए No Access, View Only, या View and Edit चुनें। Grant buttons सभी outlets एक साथ set करते हैं।"),
  (None, "Then, for each outlet, the sheet matrix sets every sheet to Edit, View Only or No Access.", "फिर हर outlet के लिए sheet matrix हर sheet को Edit, View Only या No Access set करता है।"),
  (None, "Example: a front-desk user gets Appointments, Billing and Clients as Edit, and everything else No Access. They will then also see only those training videos.",
   "Example: front-desk user को Appointments, Billing और Clients पर Edit, और बाकी सब No Access। फिर उन्हें training videos भी सिर्फ इन्हीं के दिखेंगे।"),
 ]),
 dict(id='live', lines=[
  (None, "Changes apply within a minute, without the user signing in again. The database enforces the same rules, so access cannot be bypassed.",
   "बदलाव एक मिनट में लागू होते हैं, user को दोबारा sign in किए बिना। Database भी यही rules लागू करता है, इसलिए access को bypass नहीं किया जा सकता।"),
  ('+ Add User', "Review user access every month, and deactivate anyone who leaves on their last day.", "हर महीने user access review करें, और कोई छोड़े तो उसी दिन उसे deactivate करें।"),
 ]),
]

MODS['settings'] = [
 dict(id='top', lines=[
  ('Master Settings', "Master Settings holds backup, storage, statutory provisions and company-wide salary settings. Only a Super Admin sees it.",
   "Master Settings में backup, storage, statutory provisions और पूरी company की salary settings हैं। ये सिर्फ Super Admin को दिखता है।"),
 ]),
 dict(id='backup', lines=[
  ('⬇ Take Backup (JSON)', "Your data is saved in the cloud. Take Backup still downloads a complete copy as a file — keep one every week somewhere safe.",
   "आपका data cloud में सेव है। फिर भी Take Backup पूरी copy file के रूप में download करता है — हर हफ्ते एक copy सुरक्षित जगह रखें।"),
  ('⬆ Import Backup (JSON)', "Import Backup restores from such a file. Auto-backup keeps a snapshot in this browser every minute.",
   "Import Backup ऐसी file से restore करता है। Auto-backup इस browser में हर मिनट snapshot रखता है।"),
 ]),
 dict(id='storage', lines=[
  ('🗄 Storage', "Storage shows how much browser space this device uses, and what is using it.", "Storage दिखाता है इस device पर browser की कितनी जगह इस्तेमाल हुई, और किस चीज़ ने।"),
  ('🗑 Clear All Local Data', "Clear All Local Data wipes this browser's copy — you must type DELETE, and should take a backup first.",
   "Clear All Local Data इस browser की copy मिटाता है — DELETE type करना पड़ता है, और पहले backup लेना चाहिए।"),
 ]),
 dict(id='statutory', opt={'do': [['scroll', 'Statutory Provisions', 'start']]}, lines=[
  ('Statutory Provisions', "Statutory Provisions switch PF, ESIC, TDS on salary and gratuity on or off. ESIC applies below twenty-one thousand gross.",
   "Statutory Provisions PF, ESIC, salary पर TDS और gratuity को on या off करते हैं। ESIC इक्कीस हज़ार gross से कम पर लागू होता है।"),
  ('Salary Configuration', "Salary Configuration sets the salary cycle and the financial-year start, and Leave Policy sets casual and sick leave.",
   "Salary Configuration salary cycle और financial year की शुरुआत तय करता है, और Leave Policy casual और sick leave।"),
 ]),
]
