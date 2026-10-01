from modules._h import *
MODS = {}

MODS['master-salary'] = [
 dict(id='top', lines=[
  ('Master Salary Sheet', "Master Salary is the staff master of the outlet. Attendance, Salary Working, Incentive Working, advances and bank payments all read from here.",
   "Master Salary outlet का staff master है। Attendance, Salary Working, Incentive Working, advances और bank payments सब यहीं से पढ़ते हैं।"),
  ('Total Employees', "Cards show total and active employees, the total gross CTC and how many are on PF.",
   "Cards में total और active employees, total gross CTC और PF वाले employees की गिनती है।"),
 ]),
 dict(id='table', opt={'do': [mark_row('Rahul Verma', 'r')]}, lines=[
  (D('r'), "Each row has the employee ID, name and department, designation, joining date, weekly off, gross salary and bank.",
   "हर row में employee ID, नाम और department, designation, joining date, weekly off, gross salary और bank है।"),
  ('Search by name, ID, designation…', "Search by name, ID or designation, or filter by status.", "नाम, ID या designation से search करें, या status से filter करें।"),
  ('$thead input[type=checkbox]', "Tick employees to mark them active or inactive together, or delete them.", "Employees tick करके एक साथ active या inactive करें, या delete करें।"),
 ]),
 dict(id='add1', opt={'do': [['click', '+ Add Employee', 900]]}, lines=[
  ('@modal', "Add Employee has three steps. Step one, Personal: billing-software ID, full name, father's name, mobile, email, address, PAN and Aadhaar, with copies attached.",
   "Add Employee के तीन steps हैं। पहला, Personal: billing-software ID, पूरा नाम, पिता का नाम, mobile, email, address, PAN और Aadhaar, copies के साथ।"),
  ('Employee Id as per Billing Software', "The billing-software ID links this person to the Staff Work Report, so their sales come into Incentive Working automatically.",
   "Billing-software ID इस व्यक्ति को Staff Work Report से जोड़ता है, ताकि उनकी sales अपने-आप Incentive Working में आएँ।"),
  (None, "An Aadhaar copy is compulsory. SalonOS checks the mobile and email format.", "Aadhaar की copy ज़रूरी है। SalonOS mobile और email का format check करता है।"),
 ]),
 dict(id='add2', opt={'do': [['click', '+ Add Employee', 900], ['click', '💼 Employment & Salary', 700]]}, lines=[
  ('💼 Employment & Salary', "Step two, Employment and Salary: department, designation, date of joining, weekly off and status — active, on notice or resigned.",
   "दूसरा, Employment & Salary: department, designation, joining date, weekly off और status — active, on notice या resigned।"),
  ('Department *', "Department matters: the P&L groups salary by department, and helpers and housekeepers are left out of incentives.",
   "Department ज़रूरी है: P&L salary को department के हिसाब से group करता है, और helpers व housekeepers incentive से बाहर रहते हैं।"),
  ('Statutory Applicability — for this employee', "Enter basic, HRA, conveyance and special allowance; gross CTC is calculated. Then tick PF, ESIC and professional tax for this employee, with PF and ESIC numbers.",
   "Basic, HRA, conveyance और special allowance डालें; gross CTC अपने-आप बनता है। फिर इस employee के लिए PF, ESIC और professional tax tick करें, PF और ESIC numbers के साथ।"),
 ]),
 dict(id='add3', opt={'do': [['click', '+ Add Employee', 900], ['click', '🏦 Bank Details', 700]]}, lines=[
  ('🏦 Bank Details', "Step three, Bank Details: bank name, account holder, account number and IFSC, with a bank proof. These go into the bank payment file.",
   "तीसरा, Bank Details: bank name, account holder, account number और IFSC, bank proof के साथ। ये bank payment file में जाते हैं।"),
  ('✓ Add Employee', "Click Add Employee to save. To change someone later, use View or Edit on their row.",
   "सेव करने के लिए Add Employee दबाएँ। बाद में बदलाव के लिए उनकी row पर View या Edit इस्तेमाल करें।"),
 ]),
 dict(id='example', opt={'do': [mark_row('Rahul Verma', 'r')]}, lines=[
  (D('r'), "Example: Rahul Verma, Senior Hair Stylist, joined June 2023, weekly off Tuesday, gross thirty-two thousand a month — basic sixteen thousand, HRA six thousand four hundred, conveyance sixteen hundred and the rest special allowance.",
   "Example: Rahul Verma, Senior Hair Stylist, June 2023 में join किया, weekly off मंगलवार, gross बत्तीस हज़ार महीना — basic सोलह हज़ार, HRA छह हज़ार चार सौ, conveyance सोलह सौ और बाकी special allowance।"),
 ]),
 dict(id='import', lines=[
  ('⬇ Template', "To add many staff at once, download the template, fill it, and use Import. Export Excel and Export PDF give the full roster.",
   "एक साथ कई staff जोड़ने के लिए template download करें, भरें, और Import करें। Export Excel और Export PDF पूरा roster देते हैं।"),
  ('Show inactive employees', "When someone leaves, set the date of leaving and mark them inactive. They move to the inactive list — tick Show inactive employees to see them, and Reactivate if they return.",
   "कोई छोड़े तो date of leaving डालकर inactive करें। वो inactive list में चले जाते हैं — Show inactive employees tick करके देखें, और लौटें तो Reactivate करें।"),
  (None, "Delete only a record created by mistake — it affects attendance and salary history. You get a few seconds to undo.",
   "Delete सिर्फ गलती से बने record को करें — इससे attendance और salary history पर असर पड़ता है। Undo के लिए कुछ seconds मिलते हैं।"),
 ]),
]

MODS['attendance'] = [
 dict(id='top', lines=[
  ('Employee Attendance', "Attendance is the monthly attendance register. Salary is paid on the days marked here.",
   "Attendance monthly attendance register है। Salary यहीं mark किए दिनों पर बनती है।"),
  ('Individual', "There are two views: Individual, one employee's calendar, and Full Register, the whole team.",
   "दो views हैं: Individual, एक employee का calendar, और Full Register, पूरी team।"),
 ]),
 dict(id='individual', lines=[
  ('Employees', "On the left pick an employee. Their month appears as a calendar.", "बाईं तरफ employee चुनें। उनका महीना calendar की तरह दिखता है।"),
  ('Click cell to mark or override', "Click a day to set its status: present, weekly off, holiday, half day, absent, not joined or left.",
   "दिन पर क्लिक करके status चुनें: present, weekly off, holiday, half day, absent, not joined या left।"),
  (None, "Days must be marked in order — mark the previous day first. Future days are greyed out.",
   "दिन क्रम से mark होते हैं — पहले पिछला दिन mark करें। आने वाले दिन grey रहते हैं।"),
 ]),
 dict(id='summary', lines=[
  ('PRESENT', "The summary shows present, absent, half days and loss-of-pay days, updating as you mark.",
   "Summary में present, absent, half day और loss-of-pay days दिखते हैं, mark करते ही update।"),
  (None, "Example: in September Anjali Gupta was present twenty-one days, absent two, with two half days and her weekly offs — so three loss-of-pay days.",
   "Example: September में Anjali Gupta इक्कीस दिन present, दो दिन absent, दो half days और weekly offs के साथ — यानी तीन loss-of-pay days।"),
 ]),
 dict(id='full', opt={'do': [['click', 'Full Register', 900]]}, lines=[
  ('Full Register', "Full Register shows every employee against every day, colour coded, with totals of working days, extra days, allowed weekly offs and total days payable.",
   "Full Register हर employee को हर दिन के साथ, colour में, दिखाता है — working days, extra days, allowed weekly offs और total days payable के totals के साथ।"),
  ('TOTAL DAYS', "Total days is what Salary Working uses: gross salary divided by days in the month, times total days.",
   "Total days वही है जो Salary Working इस्तेमाल करता है: gross salary ÷ महीने के दिन × total days।"),
 ]),
 dict(id='bulk', lines=[
  ('⬇ Template', "To mark a whole month in Excel, download the template — it has drop-downs and colours — fill it, and Bulk Upload. SalonOS reports how many employees and days were updated.",
   "पूरा महीना Excel में mark करने के लिए template download करें — इसमें drop-downs और colours हैं — भरें और Bulk Upload करें। SalonOS बताता है कितने employees और दिन update हुए।"),
  ('⬇ Export Register', "Export Register downloads the register. Attach Register stores a scan of the signed physical register for the month.",
   "Export Register register download करता है। Attach Register महीने के signed physical register का scan सेव करता है।"),
 ]),
 dict(id='final', lines=[
  ('Mark Month Final', "When the month is complete, the manager ticks Mark Month Final. The month locks for the manager; only a Super Admin or Reviewer can un-finalize it.",
   "महीना पूरा होने पर manager Mark Month Final tick करता है। महीना manager के लिए lock हो जाता है; सिर्फ Super Admin या Reviewer उसे un-finalize कर सकता है।"),
  (None, "Good habit: mark attendance every morning for the previous day, so salary is never held up at month end.",
   "अच्छी आदत: हर सुबह पिछले दिन की attendance mark करें, ताकि महीने के अंत में salary कभी न रुके।"),
 ]),
]

MODS['salary-working'] = [
 dict(id='top', lines=[
  ('Salary Working Sheet', "Salary Working calculates the month's salary for every employee — live from attendance, incentives, advances and penalties.",
   "Salary Working हर employee की महीने की salary calculate करता है — attendance, incentives, advances और penalties से, live।"),
  ('Salary Payment', "It has two tabs: Salary Working and Salary Payment.", "इसके दो tabs हैं: Salary Working और Salary Payment।"),
 ]),
 dict(id='generate', opt={'do': [['click', '🧮 Generate Salary', 900]]}, lines=[
  ('@modal', "Generate Salary asks for the month and first checks attendance. If any days are unmarked it warns you, because pay would be understated.",
   "Generate Salary महीना पूछता है और पहले attendance check करता है। अगर कोई दिन unmarked हैं तो चेतावनी देता है, क्योंकि salary कम बनेगी।"),
  (None, "Go to Attendance to complete it, or Generate Anyway.", "पूरा करने के लिए Attendance पर जाएँ, या Generate Anyway करें।"),
 ]),
 dict(id='columns', lines=[
  ('Column Applicability — toggle on/off', "Column Applicability switches columns on or off: incentives, penalties, tea allowance, advances, PF, ESIC, professional tax, TDS and bank details.",
   "Column Applicability से columns on या off करें: incentives, penalties, tea allowance, advances, PF, ESIC, professional tax, TDS और bank details।"),
  ('⚙ Tea: ₹800 fixed', "Tea allowance can be a fixed amount a month, or an amount per working day.", "Tea allowance महीने की fixed amount, या हर working day की amount हो सकती है।"),
 ]),
 dict(id='table', opt={'do': [['scroll', 'TOTAL EMPLOYEES', 'start']]}, lines=[
  ('Total Net Payable', "Cards show employees, total gross, total deductions and total net payable.", "Cards में employees, total gross, total deductions और total net payable है।"),
  (None, "For each employee: total days, gross salary — prorated by days — incentives, advance adjustment, penalty, PF, ESIC, professional tax, TDS and the net salary.",
   "हर employee के लिए: total days, gross salary — दिनों के हिसाब से — incentives, advance adjustment, penalty, PF, ESIC, professional tax, TDS और net salary।"),
  (None, "Click an incentive figure to see the working behind it. Click PF, ESIC or PT to see the working or override it for this month; click TDS to enter it.",
   "Incentive figure पर क्लिक करके उसकी working देखें। PF, ESIC या PT पर क्लिक करके working देखें या इस महीने के लिए override करें; TDS पर क्लिक करके डालें।"),
 ]),
 dict(id='advance', opt={'do': [['scroll', 'TOTAL EMPLOYEES', 'start']]}, lines=[
  (None, "Example: Imran Khan took a ten thousand rupee advance in August with a plan of two thousand five hundred a month. September's salary deducts two thousand five hundred, and five thousand stays outstanding.",
   "Example: Imran Khan ने August में दस हज़ार का advance लिया, ढाई हज़ार महीने के plan के साथ। September की salary से ढाई हज़ार कटते हैं, और पाँच हज़ार बाकी रहते हैं।"),
  (None, "An advance given for next month can be pulled into this month's deduction with Adjust now.", "अगले महीने का advance Adjust now से इसी महीने की कटौती में लाया जा सकता है।"),
 ]),
 dict(id='draft', lines=[
  ('$div[aria-hidden=true][style*="background-image"]', "Until salary is locked the sheet, its Excel, PDF and payslips carry a DRAFT watermark.",
   "Salary lock होने तक sheet, उसकी Excel, PDF और payslips पर DRAFT watermark रहता है।"),
  ('✓ Approve All', "Approve each row, or Approve All. Approved rows lock; Unlock reverts a row to draft.", "हर row approve करें, या Approve All। Approved rows lock हो जाती हैं; Unlock row को draft में वापस करता है।"),
  ('🔒 Lock Salary Working', "Lock Salary Working finalises it and the watermark changes to FINAL. Lock Entire Month also locks attendance and incentives for the month.",
   "Lock Salary Working इसे final करता है और watermark FINAL हो जाता है। Lock Entire Month महीने की attendance और incentives भी lock करता है।"),
 ]),
 dict(id='docs', lines=[
  ('📄 Payslips (PDF)', "Payslips makes a payslip for every employee, ready to print or save as PDF.", "Payslips हर employee की payslip बनाता है, print या PDF के लिए तैयार।"),
  ('🧾 Generate Challan…', "Generate Challan prepares the EPF, ESIC and professional tax challans for the month.", "Generate Challan महीने के EPF, ESIC और professional tax challans तैयार करता है।"),
  ('📤 Send Summary for Approval', "Send Summary for Approval sends a read-only summary to the Salon Manager or ASM, who can approve it or return it with remarks — without access to this sheet.",
   "Send Summary for Approval, Salon Manager या ASM को read-only summary भेजता है, जो इसे approve कर सकते हैं या remarks के साथ return — इस sheet के access के बिना।"),
 ]),
 dict(id='payment', opt={'do': [['click', 'Salary Payment', 800]]}, lines=[
  ('Salary Payment', "Salary Payment lists each employee's net salary with bank details — export it, or use Bank Payment for the bulk bank file.",
   "Salary Payment में हर employee की net salary bank details के साथ है — export करें, या bulk bank file के लिए Bank Payment इस्तेमाल करें।"),
  (None, "Once paid, set the payment status to paid with the mode — or link the bank debit in Bank Statement, which does it for you.",
   "Pay होने पर payment status को mode के साथ paid करें — या Bank Statement में bank debit link करें, जो ये अपने-आप करता है।"),
 ]),
]

MODS['incentive-working'] = [
 dict(id='top', lines=[
  ('Incentive Working Sheet', "Incentive Working calculates each employee's monthly incentive from targets and actual sales. Helpers and housekeepers are excluded.",
   "Incentive Working हर employee का monthly incentive targets और असली sales से निकालता है। Helpers और housekeepers शामिल नहीं होते।"),
  ('Incentive Payment', "Tabs: Incentive Working, Incentive Payment, Comparative Sheet and Staff Work Report.", "Tabs: Incentive Working, Incentive Payment, Comparative Sheet और Staff Work Report।"),
 ]),
 dict(id='targets', opt={'do': [['scroll', 'TOTAL SERVICE INC.', 'start']]}, lines=[
  ('TOTAL SERVICE INC.', "Cards show total service, membership and product incentive, and the grand total.", "Cards में total service, membership और product incentive, और grand total है।"),
  (None, "Each target is a multiple of salary. Here service is five times salary, membership three times and product two times.",
   "हर target salary का गुणज है। यहाँ service salary का पाँच गुना, membership तीन गुना और product दो गुना है।"),
  (None, "Example: Rahul Verma earns thirty-two thousand, so his service target is one lakh sixty thousand. He achieved two lakh sixty-five thousand — about one point six times.",
   "Example: Rahul Verma की salary बत्तीस हज़ार है, इसलिए service target एक लाख साठ हज़ार। उन्होंने दो लाख पैंसठ हज़ार achieve किया — करीब 1.6 गुना।"),
 ]),
 dict(id='achieved', opt={'do': [['scroll', 'TOTAL SERVICE INC.', 'start']]}, lines=[
  (None, "Achieved figures come from the Staff Work Report when it is imported, or can be typed in. The rate comes from the slabs, and the incentive is calculated.",
   "Achieved figures Staff Work Report import होने पर वहाँ से आते हैं, या type किए जा सकते हैं। Rate slabs से आता है, और incentive calculate होता है।"),
  (None, "Rahul's total incentive this month is about sixteen and a half thousand, including fifteen hundred of overtime.",
   "Rahul का इस महीने का total incentive लगभग साढ़े सोलह हज़ार है, पंद्रह सौ के overtime समेत।"),
 ]),
 dict(id='rules', opt={'do': [['click', '⚙ Incentive Rules & Settings', 1000]]}, lines=[
  ('@modal', "Incentive Rules and Settings holds everything behind the numbers.", "Incentive Rules & Settings में आंकड़ों के पीछे की हर चीज़ है।"),
  ('Applicability', "Applicability switches service, membership or product incentive on or off for the outlet.", "Applicability से outlet के लिए service, membership या product incentive on या off करें।"),
  ('Target Multipliers', "Target Multipliers set targets as times of salary. Rate and Amount Source chooses automatic slabs, a manual rate or a manual amount.",
   "Target Multipliers targets को salary के गुणज में तय करते हैं। Rate & Amount Source से automatic slabs, manual rate या manual amount चुनें।"),
 ]),
 dict(id='rules2', opt={'do': [['click', '⚙ Incentive Rules & Settings', 1000], ['scroll', 'Service Incentive Rate Slabs', 'start']]}, lines=[
  ('Service Incentive Rate Slabs', "Rate slabs give the incentive rate by achievement, and can be split by designation. Membership and product each have their own rules.",
   "Rate slabs achievement के हिसाब से incentive rate देते हैं, और designation के हिसाब से अलग हो सकते हैं। Membership और product के अपने rules हैं।"),
  (None, "The manager incentive is based on the whole salon's collection against target, shared between managers by percentage.",
   "Manager incentive पूरे salon के collection बनाम target पर आधारित है, managers में percentage से बँटता है।"),
  (None, "Advanced settings allow different plans per designation or per employee, if you ever need them.", "ज़रूरत हो तो Advanced settings से designation या employee के हिसाब से अलग plans बन सकते हैं।"),
 ]),
 dict(id='ot', opt={'do': [['click', '⚙ Incentive Rules & Settings', 1000], ['scroll', 'Overtime (OT) Working', 'start']]}, lines=[
  ('Overtime (OT) Working', "Overtime is worked here. Tick Applicable, enter normal working hours per day and overtime hours.",
   "Overtime की working यहाँ होती है। Applicable tick करें, रोज़ के normal working hours और OT hours डालें।"),
  ('OT Amount', "Overtime equals salary divided by days in the month, divided by normal hours, times overtime hours. Rahul: thirty-two thousand by thirty, by ten, times fourteen — one thousand four hundred and ninety-three.",
   "Overtime = salary ÷ महीने के दिन ÷ normal hours × OT hours। Rahul: बत्तीस हज़ार ÷ तीस ÷ दस × चौदह — एक हज़ार चार सौ तिरानवे।"),
  (None, "Only the total shows on the main sheet, in the OT Inc column.", "Main sheet पर सिर्फ total, OT Inc column में दिखता है।"),
 ]),
 dict(id='share', opt={'do': [['click', '📤 Share Workings', 900]]}, lines=[
  ('@modal', "Share Workings sends the incentive working to staff — all employees or only selected ones.", "Share Workings incentive working staff को भेजता है — सभी को या सिर्फ चुने हुए लोगों को।"),
  ('Deductions (penalty, advance)', "Choose the workings to include — summary, service, membership, product, manager, overtime, deductions or an employee-wise statement.",
   "शामिल करने की workings चुनें — summary, service, membership, product, manager, overtime, deductions या employee-wise statement।"),
 ]),
 dict(id='lock', lines=[
  ('🔒 Lock Incentive Working', "As with salary: approve rows, lock the working, and send the summary for approval. The DRAFT watermark changes to FINAL.",
   "Salary की तरह: rows approve करें, working lock करें, और summary approval के लिए भेजें। DRAFT watermark FINAL हो जाता है।"),
 ]),
 dict(id='comparative', opt={'do': [['click', 'Comparative Sheet', 900]]}, lines=[
  ('Comparative Sheet', "Comparative Sheet compares each employee's achievement and incentive over the last three, six or twelve months, colour coded by achievement.",
   "Comparative Sheet हर employee का achievement और incentive पिछले तीन, छह या बारह महीनों में compare करता है, achievement के हिसाब से colour में।"),
 ]),
 dict(id='swr', opt={'do': [['click', 'Staff Work Report', 900]]}, lines=[
  ('Staff Work Report', "Staff Work Report imports each stylist's service, membership and product sales from Cradlee — the same way as the collection report, including auto-import from a folder.",
   "Staff Work Report, Cradlee से हर stylist की service, membership और product sales import करता है — collection report की तरह, folder से auto-import समेत।"),
 ]),
]

MODS['daily-incentive'] = [
 dict(id='top', lines=[
  ('Daily Incentive Sheet', "Daily Incentive records incentives and commissions paid day by day, mostly in cash.", "Daily Incentive रोज़ दिए गए incentives और commissions दर्ज करता है, ज़्यादातर cash में।"),
  ('Incentive Entries', "It has three tabs: Incentive Entries, Tip to Employee and Staff Overtime.", "इसके तीन tabs हैं: Incentive Entries, Tip to Employee और Staff Overtime।"),
 ]),
 dict(id='entries', lines=[
  ('SERVICE TYPE', "Each entry has the date, employee, service type, target, achieved, rate, incentive, mode and status.",
   "हर entry में तारीख, employee, service type, target, achieved, rate, incentive, mode और status है।"),
  (None, "Entries made in Daily Sales and Expenses — membership, product, service and target commission — appear here automatically.",
   "Daily Sales & Expenses में की गई entries — membership, product, service और target commission — यहाँ अपने-आप आती हैं।"),
  (None, "Example: Rahul Verma received three hundred rupees service commission on 6 September, entered in Daily Sales and Expenses.",
   "Example: Rahul Verma को 6 September को तीन सौ रुपये service commission मिला, जो Daily Sales & Expenses में दर्ज हुआ।"),
 ]),
 dict(id='add', lines=[
  ('+ Add Entry', "Add Entry records any other daily incentive directly.", "कोई और daily incentive सीधे दर्ज करने के लिए Add Entry दबाएँ।"),
  ('Sync Employees from Attendance', "Sync Employees from Attendance brings in the employees who were working this month.",
   "Sync Employees from Attendance इस महीने काम करने वाले employees ले आता है।"),
 ]),
 dict(id='tips', opt={'do': [['click', 'Tip to Employee', 800]]}, lines=[
  ('Tip to Employee', "Tip to Employee shows tips handed to staff from Daily Sales and Expenses, employee by employee.",
   "Tip to Employee, Daily Sales & Expenses से staff को दी गई tips, employee-wise दिखाता है।"),
 ]),
 dict(id='ot', opt={'do': [['click', 'Staff Overtime', 800]]}, lines=[
  ('Staff Overtime', "Staff Overtime shows overtime paid in cash day by day. Monthly overtime on hours is calculated in Incentive Working instead.",
   "Staff Overtime रोज़ cash में दिया overtime दिखाता है। घंटों पर आधारित monthly overtime Incentive Working में calculate होता है।"),
  (None, "Daily incentives count in the P&L under employee daily incentive, separately from the monthly incentive.",
   "Daily incentives P&L में employee daily incentive में गिने जाते हैं, monthly incentive से अलग।"),
 ]),
]

MODS['advance'] = [
 dict(id='top', lines=[
  ('Advance to Employees', "Advances records money given to staff ahead of salary, and how it is recovered.", "Advances staff को salary से पहले दिया गया पैसा, और उसकी वसूली दर्ज करता है।"),
  ('PENDING APPROVAL', "Cards show pending approval, total advanced, outstanding and recovered.", "Cards में pending approval, total advanced, outstanding और recovered दिखते हैं।"),
  ('🏦 Salary: ₹', "Outstanding is split between what is recovered from salary and from incentive.", "Outstanding को salary और incentive से होने वाली वसूली में बाँटकर दिखाया जाता है।"),
 ]),
 dict(id='types', lines=[
  (None, "There are two ways an advance is given. A cash advance is entered only in Daily Sales and Expenses, and appears here automatically.",
   "Advance दो तरह से दिया जाता है। Cash advance सिर्फ Daily Sales & Expenses में दर्ज होता है, और यहाँ अपने-आप आता है।"),
  ('+ New Advance (Bank)', "A bank transfer advance is recorded here with New Advance, including the bank reference.",
   "Bank transfer वाला advance यहाँ New Advance से दर्ज होता है, bank reference के साथ।"),
 ]),
 dict(id='request', opt={'do': [['click', '📝 Request Advance', 900]]}, lines=[
  ('@modal', "Request Advance is how staff ask for an advance against future salary: employee, amount, reason, monthly deduction and the month deduction starts.",
   "Request Advance से staff future salary के against advance माँगता है: employee, amount, reason, monthly deduction और कटौती किस महीने से शुरू।"),
  (None, "Generate builds a month-wise plan you can edit — skip a month or reduce an installment.", "Generate एक month-wise plan बनाता है जिसे edit कर सकते हैं — कोई महीना skip या किश्त कम।"),
  (None, "The request waits as Pending Approval until an ASM approves or rejects it.", "Request तब तक Pending Approval रहती है जब तक ASM approve या reject न करे।"),
 ]),
 dict(id='list', lines=[
  ('Imran Khan', "The list shows each advance — employee, date, amount, mode, monthly deduction, deduction from salary or incentive, outstanding and status.",
   "List में हर advance है — employee, तारीख, amount, mode, monthly deduction, salary या incentive से कटौती, outstanding और status।"),
  (None, "Example: Imran Khan, ten thousand on 5 August for a family function, two thousand five hundred a month from August. After September, five thousand is outstanding.",
   "Example: Imran Khan, 5 August को family function के लिए दस हज़ार, August से ढाई हज़ार महीना। September के बाद पाँच हज़ार बाकी।"),
 ]),
 dict(id='register', opt={'do': [['click', '📅 Register', 900]]}, lines=[
  ('📅 Register', "The Register shows the financial year month by month — advances given, deductions and the balance for each employee.",
   "Register financial year को महीने-दर-महीने दिखाता है — हर employee के advances, कटौतियाँ और balance।"),
 ]),
 dict(id='report', opt={'do': [['click', '📊 Report', 900]]}, lines=[
  ('📊 Report', "The Report lists outstanding and recovered advances for the period chosen, split by salary and incentive. Export Excel gives a colour-coded copy.",
   "Report चुनी गई period के outstanding और recovered advances दिखाता है, salary और incentive में बँटे हुए। Export Excel colour-coded copy देता है।"),
  (None, "Deductions flow automatically into Salary Working and Incentive Working every month until the advance is recovered.",
   "Advance वसूल होने तक कटौतियाँ हर महीने अपने-आप Salary Working और Incentive Working में जाती हैं।"),
 ]),
]

MODS['penalty'] = [
 dict(id='top', lines=[
  ('Penalty on Employees', "Penalties is the disciplinary deduction register.", "Penalties disciplinary कटौतियों का register है।"),
  ('Total Penalties', "Cards show the number of penalties, the total deducted and this month's total.", "Cards में penalties की गिनती, कुल कटौती और इस महीने का total है।"),
 ]),
 dict(id='list', lines=[
  ('EMPLOYEE', "Each penalty has the employee, date, type, amount, approved by, month and remarks.", "हर penalty में employee, तारीख, type, amount, approved by, महीना और remarks हैं।"),
  (None, "Example: Vikram Rao, two hundred rupees on 3 September for arriving forty-five minutes late, approved by Priya Sharma.",
   "Example: Vikram Rao, 3 September को पैंतालीस मिनट देर से आने पर दो सौ रुपये, Priya Sharma द्वारा approved।"),
 ]),
 dict(id='add', opt={'do': [['click', '+ Add Penalty', 900]]}, lines=[
  ('@modal', "Add Penalty: choose the employee, the type — late arrival, absent without notice, uniform, misconduct, damage, mobile misuse, customer complaint or other — and the amount.",
   "Add Penalty: employee, type — late arrival, absent without notice, uniform, misconduct, damage, mobile misuse, customer complaint या other — और amount चुनें।"),
  ('Mode of Recovery', "Choose who approved it, the deduction month and how it is recovered — from salary or incentive.",
   "किसने approve किया, कटौती का महीना और वसूली कैसे — salary से या incentive से, चुनें।"),
 ]),
 dict(id='flow', lines=[
  (None, "Penalties entered in Daily Sales and Expenses also appear here automatically. Each penalty is deducted in that month's Salary Working.",
   "Daily Sales & Expenses में दर्ज penalties भी यहाँ अपने-आप आती हैं। हर penalty उसी महीने की Salary Working में कटती है।"),
  ('⬇ Export Excel', "Edit or delete from the row, and Export Excel for a copy. Penalties cannot be changed in a locked month.",
   "Row से edit या delete करें, और copy के लिए Export Excel। Locked महीने में penalties नहीं बदली जा सकतीं।"),
 ]),
]
