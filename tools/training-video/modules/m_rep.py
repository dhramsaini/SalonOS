from modules._h import *
MODS = {}

MODS['outlet-dashboard'] = [
 dict(id='top', lines=[
  ('Outlet Dashboard — Glow Sector 21', "The Outlet Dashboard is the first screen of every outlet — its month in numbers and charts.",
   "Outlet Dashboard हर outlet की पहली screen है — उसका महीना numbers और charts में।"),
  ('September', "Choose the month and year at the top right. Share sends the dashboard as a report.", "ऊपर दाईं तरफ महीना और साल चुनें। Share dashboard को report की तरह भेजता है।"),
 ]),
 dict(id='cards', lines=[
  ('TOTAL REVENUE', "Total revenue, net profit, total expenses and gross margin, each with the change against last month.",
   "Total revenue, net profit, total expenses और gross margin, हर एक पिछले महीने से बदलाव के साथ।"),
  ('CASH COLLECTION', "Then cash, card and UPI collection, and staff with their attendance.", "फिर cash, card और UPI collection, और staff उनकी attendance के साथ।"),
  (None, "In this example September revenue is about eight lakh sixteen thousand, and net profit about four lakh twenty-eight thousand.",
   "इस example में September का revenue लगभग आठ लाख सोलह हज़ार है, और net profit लगभग चार लाख अट्ठाईस हज़ार।"),
 ]),
 dict(id='charts', opt={'do': [['scroll', 'Revenue Trend — Last 12 Months', 'start']]}, lines=[
  ('Revenue Trend — Last 12 Months', "The revenue trend shows the last twelve months — hover a bar for the month and amount. Collection Mix splits the month into cash, card and UPI.",
   "Revenue trend पिछले बारह महीने दिखाता है — bar पर hover करके महीना और amount देखें। Collection Mix महीने को cash, card और UPI में बाँटता है।"),
  ('Revenue Breakdown', "Revenue and expense breakdowns show where money comes from and goes — salaries, rent, products, electricity, marketing and more.",
   "Revenue और expense breakdown दिखाते हैं पैसा कहाँ से आता और कहाँ जाता है — salaries, rent, products, बिजली, marketing वगैरह।"),
 ]),
 dict(id='mom', opt={'do': [['click', 'Month-on-Month Comparison', 900]]}, lines=[
  ('Month-on-Month Comparison', "Month-on-Month Comparison puts any two months side by side with the change in every category.",
   "Month-on-Month Comparison किन्हीं दो महीनों को हर category के बदलाव के साथ साथ-साथ रखता है।"),
 ]),
 dict(id='pnl', opt={'do': [['click', 'P&L Statement', 900]]}, lines=[
  ('P&L Statement', "The P&L tab gives a short income and expense statement, and Period Reports show revenue trend and margins across months.",
   "P&L tab छोटा income और expense statement देता है, और Period Reports महीनों का revenue trend और margins दिखाते हैं।"),
 ]),
 dict(id='exp', opt={'do': [['click', 'Expenses Summary', 900]]}, lines=[
  ('Expenses Summary', "Expenses Summary rolls up Daily Sales and Expenses by expense row or by group, month by month.",
   "Expenses Summary, Daily Sales & Expenses को expense row या group के हिसाब से, महीने-दर-महीने जोड़ता है।"),
  (None, "Every number here comes from the real entries of the outlet, so keep the daily sheets up to date.",
   "यहाँ का हर आंकड़ा outlet की असली entries से आता है, इसलिए daily sheets up to date रखें।"),
 ]),
]

MODS['outlet-pnl'] = [
 dict(id='top', lines=[
  ('Monthly P&L — Glow Sector 21 — Gurgaon', "P&L Monthly is the profit and loss statement of one outlet for one month.",
   "P&L Monthly एक outlet के एक महीने का profit & loss statement है।"),
  (None, "It is built automatically — revenue from Collection Reco, costs from Daily Sales, Salary Working, Incentive Working, the Vendor Sheet, Recurring Expenses and depreciation.",
   "ये अपने-आप बनता है — revenue Collection Reco से, खर्चे Daily Sales, Salary Working, Incentive Working, Vendor Sheet, Recurring Expenses और depreciation से।"),
 ]),
 dict(id='cards', lines=[
  ('REVENUE', "Cards show revenue, gross profit, EBITDA and profit before tax, with margins and the change against the previous month.",
   "Cards में revenue, gross profit, EBITDA और profit before tax, margins और पिछले महीने से बदलाव के साथ।"),
  ('Compare with', "Compare with the previous month, the same month last year, or budget.", "पिछले महीने, पिछले साल के same महीने, या budget से compare करें।"),
 ]),
 dict(id='statement', opt={'do': [['click', 'Expand all', 700], ['scroll', 'PARTICULARS', 'start']]}, lines=[
  ('PARTICULARS', "The statement has revenue, direct cost of service, employee cost, operating expenses, and depreciation and interest. Expand all opens every line.",
   "Statement में revenue, direct cost of service, employee cost, operating expenses, और depreciation व interest हैं। Expand all हर line खोलता है।"),
  (None, "Revenue is the collection divided by one point zero five, to take out GST.", "Revenue collection को 1.05 से भाग देकर निकलता है, ताकि GST अलग हो जाए।"),
  (None, "Click any line to see exactly which entries make it up. Recurring lines show whether it is the actual bill, an estimate from the previous bill, or an adjustment.",
   "किसी भी line पर क्लिक करके देखें वो किन entries से बनी है। Recurring lines बताती हैं कि ये असली bill है, पिछले bill से estimate, या adjustment।"),
 ]),
 dict(id='example', lines=[
  ('REVENUE', "Example: September revenue eight lakh sixteen thousand; employee cost about one lakh ninety thousand; rent one lakh three hundred; profit before tax about four lakh twenty-eight thousand.",
   "Example: September revenue आठ लाख सोलह हज़ार; employee cost लगभग एक लाख नब्बे हज़ार; rent एक लाख तीन सौ; profit before tax लगभग चार लाख अट्ठाईस हज़ार।"),
  ('Break-even', "The break-even card tells you how far revenue is above or below break-even.", "Break-even card बताता है कि revenue break-even से कितना ऊपर या नीचे है।"),
 ]),
 dict(id='tabs', opt={'do': [['click', 'Variance Analysis', 900]]}, lines=[
  ('Variance Analysis', "Variance Analysis explains what changed against the comparison month, and Cash Flow and Compare give further views.",
   "Variance Analysis बताता है comparison महीने के मुकाबले क्या बदला, और Cash Flow व Compare और views देते हैं।"),
 ]),
 dict(id='final', lines=[
  ('✓ Mark as Final', "While you check it, the P&L shows DRAFT. When it is right, click Mark as Final.", "Check करते समय P&L पर DRAFT दिखता है। सही होने पर Mark as Final दबाएँ।"),
 ]),
 dict(id='final2', opt={'do': [['click', '✓ Mark as Final', 900]]}, lines=[
  ('FINAL', "Now the screen, Excel and PDF all show FINAL. Un-finalize puts it back to draft if a correction is needed.",
   "अब screen, Excel और PDF सब पर FINAL दिखता है। Correction की ज़रूरत हो तो Un-finalize इसे draft में वापस करता है।"),
 ]),
 dict(id='export', lines=[
  ('⬇ Excel with Formulas', "Export Excel gives the statement; Excel with Formulas gives a workbook where every total is a live formula, with working notes and notes to accounts. Share sends it.",
   "Export Excel statement देता है; Excel with Formulas ऐसी workbook देता है जिसमें हर total live formula है, working notes और notes to accounts के साथ। Share इसे भेजता है।"),
 ]),
]

MODS['previous-pnl'] = [
 dict(id='top', lines=[
  ('Previous Months P&L', "Previous Months P&L holds the months from before you started using SalonOS, so trends and comparisons cover the full history.",
   "Previous Months P&L में SalonOS शुरू होने से पहले के महीने रहते हैं, ताकि trends और comparisons पूरे history को cover करें।"),
 ]),
 dict(id='add', opt={'do': [['click', '+ Add Month', 900]]}, lines=[
  ('@modal', "Add Month: choose the year and month, then the revenue — cash, card and UPI sale and other income.",
   "Add Month: साल और महीना चुनें, फिर revenue — cash, card और UPI sale और other income।"),
  ('Operating Expenses — same lines as the real P&L', "Enter direct cost, employee cost and the operating expenses — the same lines as the live P&L — and depreciation and interest below EBITDA.",
   "Direct cost, employee cost और operating expenses डालें — live P&L जैसी ही lines — और EBITDA के नीचे depreciation और interest।"),
 ]),
 dict(id='bulk', lines=[
  ('⬇ Download Template', "To add years at once, download the template, fill one row per month and Bulk Import. SalonOS reports what was added and skipped.",
   "एक साथ कई साल जोड़ने के लिए template download करें, हर महीने की एक row भरें और Bulk Import करें। SalonOS बताता है क्या जुड़ा और क्या छूटा।"),
  (None, "These months appear in P&L Monthly, the dashboards and the P&L Statement. Edit them here, not in P&L Monthly.",
   "ये महीने P&L Monthly, dashboards और P&L Statement में दिखते हैं। इन्हें यहीं edit करें, P&L Monthly में नहीं।"),
 ]),
]

MODS['tally-export'] = [
 dict(id='top', lines=[
  ('Tally Integration', "Tally Export moves purchase invoices and bank transactions into Tally — live through the SalonOS Tally Connector, or as Tally import files.",
   "Tally Export, purchase invoices और bank transactions को Tally में भेजता है — SalonOS Tally Connector से live, या Tally import files के रूप में।"),
  ('Connected', "The status bar shows whether Tally is connected, the company open in Tally, the bank ledger and the last sync.",
   "Status bar दिखाता है Tally connected है या नहीं, Tally में खुली company, bank ledger और last sync।"),
 ]),
 dict(id='settings', opt={'do': [['click', 'Settings', 900]]}, lines=[
  ('Settings', "First, in Settings, install the SalonOS Tally Connector on the computer that runs Tally. Install Python from the link given, then paste the install command in Command Prompt.",
   "पहले Settings में, Tally वाले computer पर SalonOS Tally Connector install करें। दिए गए link से Python install करें, फिर install command Command Prompt में paste करें।"),
  (None, "The connector starts by itself every time the computer starts. SalonOS finds its address and token automatically. Tally must have its port enabled — the steps are shown.",
   "Connector हर बार computer चालू होने पर खुद start होता है। SalonOS उसका address और token खुद ढूँढ लेता है। Tally में port enabled होना चाहिए — steps दिखाए गए हैं।"),
 ]),
 dict(id='overview', lines=[
  ('PURCHASE VOUCHERS', "Overview counts purchase, payment, receipt and contra vouchers for the period, and what is not yet sent.",
   "Overview चुनी period के purchase, payment, receipt और contra vouchers, और जो अभी नहीं भेजे गए, गिनता है।"),
  ('This month', "Choose the period — this month, last month, this financial year, all, or your own dates.", "Period चुनें — this month, last month, this FY, all, या अपनी तारीखें।"),
 ]),
 dict(id='vouchers', opt={'do': [['click', 'Vouchers', 800]]}, lines=[
  ('Vouchers', "Vouchers lists every entry ready for Tally, with type, party ledger, against ledger, narration, amount and status — new, sent, changed or suspense.",
   "Vouchers में Tally के लिए तैयार हर entry है — type, party ledger, against ledger, narration, amount और status — new, sent, changed या suspense।"),
  ('$thead input[type=checkbox]', "Nothing is ever sent automatically. Select entries and click Move to Tally — a preview of every voucher appears, and only when you confirm are they posted.",
   "कुछ भी अपने-आप नहीं जाता। Entries चुनें और Move to Tally दबाएँ — हर voucher का preview दिखता है, और confirm करने पर ही post होते हैं।"),
 ]),
 dict(id='ledgers', opt={'do': [['click', 'Ledgers', 800]]}, lines=[
  ('Ledgers', "Ledgers maps each SalonOS ledger — vendors, expense heads, bank — to a ledger in Tally. Similar Tally ledgers are suggested for you.",
   "Ledgers हर SalonOS ledger — vendors, expense heads, bank — को Tally के ledger से map करता है। मिलते-जुलते Tally ledgers सुझाए जाते हैं।"),
  (None, "Show only those missing in Tally, and create any that are missing — again with a preview first. The bank ledger is set from your bank statement's account number.",
   "सिर्फ Tally में missing ledgers दिखाएँ, और missing ledgers बनाएँ — फिर से पहले preview के साथ। Bank ledger आपके bank statement के account number से set होता है।"),
 ]),
 dict(id='history', opt={'do': [['click', 'History', 800]]}, lines=[
  ('History', "History logs every sync — when, what was sent and any errors.", "History हर sync दर्ज करता है — कब, क्या भेजा और कोई error।"),
  ('⏏ Disconnect', "Disconnect stops SalonOS talking to Tally on this computer until you connect again.", "Disconnect इस computer पर SalonOS को Tally से बात करने से रोकता है, जब तक दोबारा connect न करें।"),
 ]),
]

MODS['reports'] = [
 dict(id='top', lines=[
  ('Cash Register', "Reports has the ready registers of the outlet: cash register, expense register, expenses summary, TDS, PF, ESIC and PT summaries, and fund position.",
   "Reports में outlet के तैयार registers हैं: cash register, expense register, expenses summary, TDS, PF, ESIC और PT summaries, और fund position।"),
  ('Total Cash Handed Over', "Cash Register shows every cash handover and cash received, person by person, from Daily Sales and Expenses.",
   "Cash Register, Daily Sales & Expenses से हर cash handover और cash received, व्यक्ति-वार दिखाता है।"),
 ]),
 dict(id='expreg', opt={'do': [['click', 'Expense Register', 900]]}, lines=[
  ('Expense Register', "Expense Register lists every expense entry with its date, head and description.", "Expense Register हर expense entry को तारीख, head और description के साथ दिखाता है।"),
 ]),
 dict(id='expsum', opt={'do': [['click', 'Expenses Summary', 900]]}, lines=[
  ('Expenses Summary', "Expenses Summary gives monthly and comparative totals by expense row or by group.", "Expenses Summary, expense row या group के हिसाब से monthly और comparative totals देता है।"),
 ]),
 dict(id='tds', opt={'do': [['click', 'TDS Summary', 900]]}, lines=[
  ('TDS Summary', "TDS Summary shows tax deducted from salaries and vendor payments, by section, ready for the challan and return.",
   "TDS Summary salaries और vendor payments से कटा tax, section-wise, challan और return के लिए तैयार दिखाता है।"),
 ]),
 dict(id='pf', opt={'do': [['click', 'PF Summary', 900]]}, lines=[
  ('PF Summary', "PF, ESIC and PT summaries show employee and employer contributions month by month from Salary Working.",
   "PF, ESIC और PT summaries, Salary Working से employee और employer contributions महीने-दर-महीने दिखाते हैं।"),
 ]),
 dict(id='fund', opt={'do': [['click', 'Fund Position', 900]]}, lines=[
  ('Fund Position', "Fund Position starts from the bank balance and takes off everything payable — salary, incentive, rent, electricity, products, TDS, ESIC, EPF and PT — to show the money truly free.", "Fund Position bank balance से शुरू करके हर देनदारी — salary, incentive, rent, बिजली, products, TDS, ESIC, EPF और PT — घटाता है, ताकि असल में बचा पैसा दिखे।"),
  (None, "Every report can be refreshed, shared, or exported to Excel.", "हर report refresh, share या Excel में export हो सकती है।"),
 ]),
]

MODS['audit-log'] = [
 dict(id='top', lines=[
  ('Audit Log', "The Audit Log records who changed what, and when — employees, vendor invoices and P&L overrides. It keeps the last five hundred events of the outlet.",
   "Audit Log दर्ज करता है किसने क्या और कब बदला — employees, vendor invoices और P&L overrides। ये outlet के आखिरी पाँच सौ events रखता है।"),
  ('WHEN', "Each event shows when, the user and role, the type, the action — added, edited or deleted — and the details.",
   "हर event में कब, user और role, type, action — added, edited या deleted — और details हैं।"),
 ]),
 dict(id='filter', lines=[
  ('All Types', "Filter by type, or search by name or user. Refresh loads the latest events.", "Type से filter करें, या नाम या user से search करें। Refresh नए events लाता है।"),
  (None, "Example: on 28 September the owner revised Karan Mehta's salary to seventeen thousand; on 30 September Priya Sharma entered UPI sales for the day.",
   "Example: 28 September को owner ने Karan Mehta की salary सत्रह हज़ार की; 30 September को Priya Sharma ने दिन की UPI sales डालीं।"),
  (None, "Use it when a number looks wrong — find who changed it and ask them.", "जब कोई आंकड़ा गलत लगे तब इसे इस्तेमाल करें — देखें किसने बदला और उनसे पूछें।"),
 ]),
]

MODS['import-center'] = [
 dict(id='top', lines=[
  ('Import Center', "The Import Center gathers every template download and bulk import in one place.", "Import Center हर template download और bulk import को एक जगह रखता है।"),
  ('Employee / Staff Master Import', "Each card explains one import and takes you to the sheet where it is done — staff master, vendor invoices, incentive rules, attendance, previous months P&L and more.",
   "हर card एक import समझाता है और उस sheet पर ले जाता है जहाँ वो होता है — staff master, vendor invoices, incentive rules, attendance, previous months P&L वगैरह।"),
 ]),
 dict(id='how', lines=[
  ('Go to Master Salary', "The steps are always the same: download the template, fill it in Excel without changing the columns, then upload it on that sheet.",
   "Steps हमेशा एक जैसे हैं: template download करें, columns बदले बिना Excel में भरें, फिर उसी sheet पर upload करें।"),
  (None, "SalonOS checks every row and tells you what was added, updated and skipped, and why.", "SalonOS हर row check करता है और बताता है क्या जुड़ा, क्या update हुआ और क्या छूटा, और क्यों।"),
  (None, "Outlets themselves are imported from Master Sheet in the sidebar, because they belong to the whole business.",
   "Outlets खुद sidebar के Master Sheet से import होते हैं, क्योंकि वो पूरे business के हैं।"),
 ]),
]
