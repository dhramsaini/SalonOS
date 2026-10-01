from modules._h import *
MODS = {}

MODS['collection'] = [
 dict(id='top', lines=[
  ('Import Collection Data', "Collection Summary brings in the day-wise collection report from your billing software, Cradlee. This is the revenue that P&L Monthly uses.",
   "Collection Summary आपके billing software, Cradlee, से day-wise collection report लाता है। यही revenue P&L Monthly इस्तेमाल करता है।"),
  ('⬇ Download Template', "The report has a fixed format — centre name, invoice date, and cash, card, UPI, wallet, district, Luzo, online and total columns. Download Template shows it.",
   "Report का एक तय format है — centre name, invoice date, और cash, card, UPI, wallet, district, Luzo, online और total columns। Download Template यह दिखाता है।"),
 ]),
 dict(id='get', lines=[
  ('Get the Collection Report from Cradlee', "Step one: choose the period — yesterday, last seven days, this month, last month, this financial year, or your own dates.",
   "पहला कदम: period चुनें — yesterday, last 7 days, this month, last month, this FY, या अपनी तारीखें।"),
  ('🔗 Open Cradlee', "Step two: Open Cradlee. It opens in a new tab; log in there, open Reports, Collection Report, and export it as Excel or CSV. Your Cradlee password is typed only on Cradlee's own site.",
   "दूसरा कदम: Open Cradlee। ये नए tab में खुलता है; वहाँ login करें, Reports, Collection Report खोलें और Excel या CSV में export करें। आपका Cradlee password सिर्फ Cradlee की site पर डलता है।"),
  ('📄 Choose file', "Step three: Choose file. It opens Downloads; pick the export. Only the chosen period is kept, and rows already imported are skipped.",
   "तीसरा कदम: Choose file। Downloads खुलता है; export चुनें। सिर्फ चुनी गई period रखी जाती है, और पहले से import हुई rows छोड़ दी जाती हैं।"),
 ]),
 dict(id='auto', opt={'do': [['scroll', 'Auto-Import from a folder inside Downloads', 'center']]}, lines=[
  ('Auto-Import from a folder inside Downloads', "Even easier: connect a folder inside Downloads once. After that, every Cradlee export saved there is imported by itself when you open this tab.",
   "और आसान: Downloads के अंदर एक folder एक बार connect करें। उसके बाद वहाँ सेव हुआ हर Cradlee export, ये tab खोलते ही अपने-आप import हो जाता है।"),
  ('📂 Connect a folder inside Downloads', "This works on a computer in Chrome or Edge. On a phone, use the upload box instead.",
   "ये computer पर Chrome या Edge में चलता है। Phone पर upload box इस्तेमाल करें।"),
 ]),
 dict(id='upload', opt={'do': [['scroll', 'Upload Cradlee Collection Report', 'center']]}, lines=[
  ('Upload Cradlee Collection Report', "You can also drop the file in the upload box.", "File को upload box में भी डाल सकते हैं।"),
  ('➕ Append to existing data', "Append adds only new rows — duplicates are skipped. Upload fresh report replaces everything with this file, so use it only for a complete, correct report.",
   "Append सिर्फ नई rows जोड़ता है — duplicates छोड़ दिए जाते हैं। Upload fresh report सब कुछ इस file से बदल देता है, इसलिए इसे सिर्फ पूरी, सही report के लिए इस्तेमाल करें।"),
 ]),
 dict(id='preview', opt={'do': [['scroll', 'Imported Data Preview', 'start']]}, lines=[
  ('Imported Data Preview', "The Imported Data Preview shows every day's row. Each row's total is checked against cash plus card plus UPI and the rest.",
   "Imported Data Preview हर दिन की row दिखाता है। हर row का total, cash + card + UPI वगैरह से check होता है।"),
  ('Validation', "Validation marks rows whose total matches, and flags any mismatch in red.", "Validation match होने वाली rows mark करता है, और mismatch को लाल दिखाता है।"),
  ('Search centre or date…', "Search by centre or date, delete a wrong row, or Export Imported Data to Excel.",
   "Centre या तारीख से search करें, गलत row delete करें, या Export Imported Data से Excel में लें।"),
 ]),
 dict(id='example', opt={'do': [['scroll', 'Imported Data Preview', 'start']]}, lines=[
  ('Grand Total', "In this example, April to September is imported. September alone comes to about nine and a half lakh, which becomes the revenue in P&L after taking out GST.",
   "इस example में April से September import है। सिर्फ September लगभग साढ़े नौ लाख है, जो GST निकालने के बाद P&L में revenue बनता है।"),
  (None, "Import every day or at least every week, so Collection Reco and the P&L stay current.",
   "हर दिन या कम से कम हर हफ्ते import करें, ताकि Collection Reco और P&L up to date रहें।"),
 ]),
 dict(id='ai', opt={'do': [['scroll', '✨ Generate Reconciliation with AI', 'center']]}, lines=[
  ('✨ Generate Reconciliation with AI', "Generate Reconciliation with AI compares the bank credits with the collection, day by day, and marks each one matched or mismatched with a note.",
   "Generate Reconciliation with AI, bank credits को collection से दिन-ब-दिन मिलाता है और हर एक को matched या mismatched, note के साथ mark करता है।"),
  ('Clear Data', "Clear Data removes all imported collection — use it only if you want to start again.",
   "Clear Data सारा imported collection हटा देता है — इसे सिर्फ दोबारा शुरू करने के लिए इस्तेमाल करें।"),
 ]),
]

MODS['collection-sheet'] = [
 dict(id='top', lines=[
  ('Collection Reco', "Collection Reco is the daily check that every rupee billed actually reached you.", "Collection Reco रोज़ का check है कि bill हुआ हर रुपया सच में आपके पास पहुँचा।"),
  ('$thead', "For each day it puts three sources side by side — Cradlee, your counter report from Daily Sales and Expenses, and the bank statement.",
   "हर दिन के लिए ये तीन sources साथ रखता है — Cradlee, Daily Sales & Expenses की आपकी counter report, और bank statement।"),
 ]),
 dict(id='cols', lines=[
  ('CASH AS PER CRADLEE', "Cash as per Cradlee is compared with cash as per counter report.", "Cash as per Cradlee को cash as per counter report से मिलाया जाता है।"),
  ('CARD AS PER CRADLEE', "Card and UPI as per Cradlee are compared with the card and UPI settlements credited in the bank.",
   "Card और UPI as per Cradlee को bank में आए card और UPI settlements से मिलाया जाता है।"),
  ('DIFFERENCE', "Each comparison has its own difference column.", "हर मिलान का अपना difference column है।"),
 ]),
 dict(id='flag', lines=[
  ('Flag Diff over', "Flag Diff over sets the tolerance, for example two percent. Days above it are flagged and need a reason.",
   "Flag Diff over tolerance तय करता है, जैसे दो percent। उससे ज़्यादा वाले दिन flag होते हैं और उन्हें reason चाहिए।"),
  ('Card As Per Cradlee', "Choose which channels count as card — wallet, district, Luzo, online — to match how your bank settles them.",
   "चुनें कि card में कौन-से channels गिने जाएँ — wallet, district, Luzo, online — जैसे आपका bank उन्हें settle करता है।"),
 ]),
 dict(id='reason', opt={'do': [['scroll', 'Reason for Diff', 'center']]}, lines=[
  ('Reason for Diff', "Pick the reason for a difference: previous month collection, credit sale, short collection or excess collection, with the amount and a note.",
   "Difference का reason चुनें: previous month collection, credit sale, short collection या excess collection, amount और note के साथ।"),
  (None, "Example: if a client paid five thousand on card today for last month's service, choose previous month collection for five thousand.",
   "Example: अगर किसी client ने पिछले महीने की service के पाँच हज़ार आज card से दिए, तो पाँच हज़ार के लिए previous month collection चुनें।"),
  (None, "For a credit sale, SalonOS shows how much of last month's credit has been received and how much is still pending.",
   "Credit sale के लिए SalonOS दिखाता है कि पिछले महीने के credit में से कितना आया और कितना बाकी है।"),
 ]),
 dict(id='charges', opt={'do': [['scroll', 'Reco of Actual Bank Charges', 'center']]}, lines=[
  ('Reco of Actual Bank Charges', "At the bottom is the Reco of Actual Bank Charges. It starts from the total difference, takes out previous month and excess collection and tips, and adds back credit sales and short collection.",
   "नीचे Reco of Actual Bank Charges है। ये total difference से शुरू होकर previous month और excess collection और tips घटाता है, और credit sale व short collection जोड़ता है।"),
  ('Net Bank Charges', "What remains is the net bank charge, the card and UPI fees — and it goes to the Bank Charges line in P&L Monthly.",
   "जो बचता है वो net bank charge है, यानी card और UPI fees — और ये P&L Monthly की Bank Charges line में जाता है।"),
 ]),
 dict(id='links', lines=[
  ('📆 Daily Sales & Exp', "Jump buttons open Daily Sales and Expenses or the Bank Statement to fix the source entry. Refresh Bank Data reloads the bank side.",
   "Jump buttons Daily Sales & Expenses या Bank Statement खोलते हैं ताकि असली entry ठीक हो सके। Refresh Bank Data bank वाला हिस्सा दोबारा लोड करता है।"),
  ('⬆ Share', "Each column header has a filter like Excel. Share or export the reco as Excel or PDF.",
   "हर column header में Excel जैसा filter है। Reco को Excel या PDF में share या export करें।"),
 ]),
 dict(id='habit', lines=[
  ('Collection Reco', "Check it daily: a cash difference usually means a missed counter entry; a card or UPI difference usually means a settlement not yet credited or bank charges.",
   "रोज़ check करें: cash difference का मतलब अक्सर छूटी हुई counter entry; card या UPI difference का मतलब अक्सर settlement अभी नहीं आया या bank charges।"),
 ]),
]

MODS['bank-statement'] = [
 dict(id='top', lines=[
  ('Bank Statement', "Bank Statement imports your bank statement and classifies every line, so payments, settlements and charges reach the right sheets.",
   "Bank Statement आपका bank statement import करता है और हर line classify करता है, ताकि payments, settlements और charges सही sheets तक पहुँचें।"),
  ('Quick Access', "Quick Access lists the net-banking login pages of major banks — personal, corporate and business — for HDFC, ICICI, Axis, SBI, Kotak and more.",
   "Quick Access में बड़े banks — HDFC, ICICI, Axis, SBI, Kotak वगैरह — के personal, corporate और business net-banking login pages हैं।"),
 ]),
 dict(id='accounts', lines=[
  ('Other Bank', "Save your own accounts with their bank and login address. Get statement then asks for the account and the period.",
   "अपने accounts उनके bank और login address के साथ सेव करें। Get statement फिर account और period पूछता है।"),
  (None, "Open bank website opens your bank in a new tab. Log in there as usual — your bank password never enters SalonOS — and download the statement.",
   "Open bank website आपका bank नए tab में खोलता है। वहाँ हमेशा की तरह login करें — आपका bank password कभी SalonOS में नहीं जाता — और statement download करें।"),
  (None, "With a statements folder connected, SalonOS spots the new file within seconds and imports it. Excel, CSV and PDF statements are supported, including password-protected ones.",
   "Statements folder connect हो तो SalonOS नई file कुछ ही seconds में पहचानकर import कर लेता है। Excel, CSV और PDF statements चलते हैं, password वाले भी।"),
 ]),
 dict(id='import', lines=[
  ('⬇ Download Generic Template', "Choose your bank in the format list, or use the generic template. Only the chosen period is kept and duplicate lines are skipped.",
   "Format list में अपना bank चुनें, या generic template इस्तेमाल करें। सिर्फ चुनी गई period रखी जाती है और duplicate lines छोड़ दी जाती हैं।"),
 ]),
 dict(id='table', opt={'do': [['scroll', 'Nature', 'center']]}, lines=[
  ('Nature', "Every line gets a Nature — UPI settlement, card settlement, salary, advance, incentive, vendor payment, rent, electricity, bank charges, ESIC and so on.",
   "हर line को एक Nature मिलता है — UPI settlement, card settlement, salary, advance, incentive, vendor payment, rent, बिजली, bank charges, ESIC वगैरह।"),
  ('Date as per Cradlee', "For settlements, Date as per Cradlee is the sale day the money belongs to — usually the day before it reached the bank. This is what Collection Reco uses.",
   "Settlements के लिए Date as per Cradlee वो sale का दिन है जिसका पैसा है — अक्सर bank में आने से एक दिन पहले। Collection Reco यही इस्तेमाल करता है।"),
  ('Vendor Name', "Vendor payments are matched to a vendor, and the open invoices of that vendor are shown.",
   "Vendor payments किसी vendor से match होती हैं, और उस vendor के open invoices दिखते हैं।"),
 ]),
 dict(id='filters', opt={'do': [['scroll', '⚠️ Unclassified', 'center']]}, lines=[
  ('⚠️ Unclassified', "Quick filters show what still needs attention: unclassified lines, missing Cradlee date, no vendor match, and unlinked debits.",
   "Quick filters दिखाते हैं कि क्या बाकी है: unclassified lines, missing Cradlee date, no vendor match, और unlinked debits।"),
  ('💸 Debits Only', "Or show only debits, only credits, this month or last month.", "या सिर्फ debits, सिर्फ credits, this month या last month दिखाएँ।"),
 ]),
 dict(id='tools', lines=[
  ('Re-classify Nature & Dates', "Re-classify re-applies the rules to every line — careful, it also overwrites lines you set by hand.",
   "Re-classify हर line पर rules दोबारा लगाता है — ध्यान दें, ये हाथ से set की गई lines भी बदल देता है।"),
  ('Auto-Link Payments', "Auto-Link Payments links each vendor debit to the matching open invoice and records the payment in the Vendor Sheet.",
   "Auto-Link Payments हर vendor debit को matching open invoice से link करके Vendor Sheet में payment दर्ज करता है।"),
  ('AI: tag untagged', "AI tag untagged suggests a nature for lines the rules could not classify.", "AI tag untagged उन lines के लिए nature सुझाता है जिन्हें rules classify नहीं कर पाए।"),
 ]),
 dict(id='link', lines=[
  (None, "For a vendor debit with no bill yet, add the invoice right from the bank line — it is created in the Vendor Sheet and marked paid by this transaction.",
   "जिस vendor debit का bill अभी नहीं है, bank line से ही invoice जोड़ें — वो Vendor Sheet में बनकर इसी transaction से paid mark हो जाता है।"),
  (None, "For salary or incentive debits, split the amount across employees, and their payment status updates in Salary Working and Incentive Working.",
   "Salary या incentive debits के लिए amount employees में बाँटें, और उनका payment status Salary Working और Incentive Working में update होता है।"),
 ]),
 dict(id='export', lines=[
  ('⬇ Export Mapped Data', "Export Mapped Data downloads the statement with nature, Cradlee date and vendor. Due Dates and Tally Export also read from here.",
   "Export Mapped Data, statement को nature, Cradlee date और vendor के साथ download करता है। Due Dates और Tally Export भी यहीं से पढ़ते हैं।"),
  ('Clear Data', "Clear Data removes the imported statement — only for starting over.", "Clear Data imported statement हटाता है — सिर्फ दोबारा शुरू करने के लिए।"),
 ]),
]

MODS['bank-payment'] = [
 dict(id='top', lines=[
  ('Bank Payment', "Bank Payment makes a bulk NEFT, RTGS or IMPS file that you upload to your bank's bulk payment page — no typing of accounts one by one.",
   "Bank Payment एक bulk NEFT, RTGS या IMPS file बनाता है जिसे आप bank के bulk payment page पर upload करते हैं — accounts एक-एक करके type नहीं करने पड़ते।"),
 ]),
 dict(id='settings', lines=[
  ('Generic', "Choose your bank format — generic, HDFC, ICICI, SBI, Axis or Kotak — or a custom layout. Always check the column order with your bank before the first full batch.",
   "अपना bank format चुनें — generic, HDFC, ICICI, SBI, Axis या Kotak — या custom layout। पहले पूरे batch से पहले हमेशा bank से column order confirm करें।"),
  ('Auto (NEFT/RTGS by amount)', "Payment mode Auto picks NEFT below two lakh and RTGS at two lakh or more, for each payee separately.",
   "Payment mode Auto हर payee के लिए अलग से दो लाख से कम पर NEFT और दो लाख या ज़्यादा पर RTGS चुनता है।"),
  ('This outlet\'s own bank account', "Enter the outlet's debit account number and the value date.", "Outlet का debit account number और value date डालें।"),
 ]),
 dict(id='salary', lines=[
  ('Salary', "The Salary tab lists active employees with net pay for the month chosen — taken from Salary Working.",
   "Salary tab में चुने गए महीने के net pay वाले active employees हैं — Salary Working से।"),
  (None, "Anyone missing bank details is marked missing and left out. Add the bank name, account and IFSC in Master Salary first.",
   "जिसकी bank details नहीं हैं वो missing दिखता है और छूट जाता है। पहले Master Salary में bank name, account और IFSC डालें।"),
 ]),
 dict(id='incentive', opt={'do': [['click', 'Incentive', 700]]}, lines=[
  ('Incentive', "The Incentive tab does the same for employees with a payable incentive from Incentive Working.",
   "Incentive tab, Incentive Working से payable incentive वाले employees के लिए यही करता है।"),
 ]),
 dict(id='vendor', opt={'do': [['click', 'Vendor Payments', 700]]}, lines=[
  ('Vendor Payments', "Vendor Payments lists outstanding vendor invoices. Tick the ones to pay now.", "Vendor Payments में outstanding vendor invoices हैं। अभी जिन्हें pay करना है उन्हें tick करें।"),
  ('⬇ Generate Bank Payment File', "Generate Bank Payment File downloads the file. Upload it on your bank portal and approve the batch there.",
   "Generate Bank Payment File, file download करता है। उसे bank portal पर upload करके वहीं batch approve करें।"),
  (None, "After the bank processes it, import the bank statement — the debits link back and the salaries and bills show as paid.",
   "Bank के process करने के बाद bank statement import करें — debits वापस link होते हैं और salaries व bills paid दिखते हैं।"),
 ]),
]
