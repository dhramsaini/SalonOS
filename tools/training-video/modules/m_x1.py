# Expansion scenes: worked tasks, connections, common questions and checklists.
from modules._h import *
from modules.m_front import MODS as F
from modules.m_rep import MODS as R
from modules.m_global import MODS as GL
MODS = {k: list(v) for d in (F, R, GL) for k, v in d.items()}
SEP = set_select('Oct', 'Sep')

MODS['inventory'] += [
 dict(id='receive', opt={'do': [['scroll', 'Reorder at', 'center'], click_in_row("L’Oréal Majirel", 'Receive'), ['wait', 700]]}, lines=[
  ('@modal', "Receive stock: when a delivery comes, click Receive on the item, enter the quantity received and the landed cost per unit, and Add to stock.",
   "Receive stock: delivery आने पर item के Receive पर क्लिक करें, आई हुई quantity और प्रति unit landed cost डालें, और Add to stock करें।"),
  (None, "Example: twenty tubes of Majirel at three hundred and forty each. On hand goes from three to twenty-three and the reorder flag clears.",
   "Example: Majirel की बीस tubes, तीन सौ चालीस रुपये प्रति tube। On hand तीन से तेईस हो जाता है और reorder flag हट जाता है।"),
 ]),
 dict(id='issue', opt={'do': [['scroll', 'Reorder at', 'center']]}, lines=[
  ('Issue 1', "Issue: each time a unit is opened for the backbar, click Issue 1. Units moved this month count up, so slow movers are easy to spot.",
   "Issue: हर बार backbar के लिए एक unit खुले, Issue 1 दबाएँ। इस महीने की moved units बढ़ती हैं, जिससे slow movers आसानी से दिखते हैं।"),
  ('SLOW MOVERS', "Slow movers are items with under five units moved this month — avoid reordering them, or run an offer on retail ones.",
   "Slow movers वो items हैं जिनकी इस महीने पाँच से कम units चलीं — इन्हें दोबारा न मँगवाएँ, या retail वालों पर offer चलाएँ।"),
 ]),
 dict(id='faq', lines=[
  ('$.attention-card', "Note: brand-new items cannot yet be added on this screen — only received or issued. Ask your Super Admin to add a new item.",
   "ध्यान दें: इस screen पर अभी बिल्कुल नए items नहीं जोड़े जा सकते — सिर्फ receive या issue। नया item जोड़ने के लिए Super Admin से कहें।"),
  ('Draft purchase order', "Weekly routine: filter low stock, draft the purchase order, send it to your supplier, and receive the stock when it arrives. The supplier's bill then goes into the Vendor Sheet.",
   "Weekly routine: low stock filter करें, purchase order draft करें, supplier को भेजें, और stock आने पर receive करें। Supplier का bill फिर Vendor Sheet में जाता है।"),
 ]),
]

MODS['clients'] += [
 dict(id='lapsed', opt={'do': [['click', 'Lapsed', 700]]}, lines=[
  ('Lapsed', "Example: filter Lapsed. These clients haven't visited in ninety days — the best list for a win-back offer.",
   "Example: Lapsed filter करें। ये clients नब्बे दिनों से नहीं आए — win-back offer के लिए सबसे अच्छी list।"),
  (None, "Open each one, choose the win-back message, copy it and send it on WhatsApp. Note in their profile what you offered.",
   "हर एक को खोलें, win-back message चुनें, copy करके WhatsApp पर भेजें। उनकी profile में note करें कि क्या offer दिया।"),
 ]),
 dict(id='vip', opt={'do': [['click', 'VIP', 700]]}, lines=[
  ('VIP', "VIP clients come most often. Keep their preferred stylist and usual service in mind when they book.",
   "VIP clients सबसे ज़्यादा आते हैं। उनकी booking पर उनका पसंदीदा stylist और usual service ध्यान में रखें।"),
  ('REPEAT RATE', "The repeat rate shows what share of clients come back. Raising it is usually cheaper than finding new clients.",
   "Repeat rate दिखाता है कितने clients दोबारा आते हैं। इसे बढ़ाना आमतौर पर नए clients ढूँढने से सस्ता है।"),
 ]),
 dict(id='notes', opt={'do': [['click', 'Anjali', 700]]}, lines=[
  ('Note:', "Notes keep important details — allergies, colour preferences, or a complaint to follow up — so every staff member knows.",
   "Notes ज़रूरी बातें रखते हैं — allergies, colour की पसंद, या follow up वाली शिकायत — ताकि हर staff को पता रहे।"),
  (None, "Example: Anjali prefers ammonia-free colour, and her birthday offer has been sent.", "Example: Anjali ammonia-free colour पसंद करती हैं, और उनका birthday offer भेजा जा चुका है।"),
 ]),
]

MODS['billing'] += [
 dict(id='view', opt={'do': [click_in_row('INV-1520', 'View'), ['wait', 800]]}, lines=[
  ('@modal', "View shows the full bill — date, who billed it, each item with rate, discount, GST and grand total.",
   "View पूरा bill दिखाता है — तारीख, किसने bill किया, हर item rate के साथ, discount, GST और grand total।"),
  ('🖨 Print / PDF', "Print or save it as a PDF to give the client. Edit corrects a mistake; Delete asks for confirmation.",
   "Client को देने के लिए print करें या PDF सेव करें। Edit गलती ठीक करता है; Delete confirmation माँगता है।"),
 ]),
 dict(id='split', opt={'do': [['click', '+ New Bill', 900]]}, lines=[
  ('Payment Mode', "Split payment: if a client pays partly by card and partly in cash, choose Split and enter each part.",
   "Split payment: अगर client कुछ card से और कुछ cash में दे, Split चुनें और हर हिस्सा डालें।"),
  ('Discount', "Discounts reduce the taxable value before GST. Give discounts only as your outlet's policy allows.",
   "Discount GST से पहले taxable value घटाता है। Discount सिर्फ outlet की policy के अनुसार दें।"),
 ]),
 dict(id='close', lines=[
  ("TODAY'S COLLECTION", "At closing, match today's collection here with the cash in the drawer and the card and UPI machines, then enter the day's sales in Daily Sales and Expenses.",
   "Closing पर यहाँ का आज का collection drawer के cash और card व UPI machines से मिलाएँ, फिर Daily Sales & Expenses में दिन की sales डालें।"),
  ('All Status', "Filter Unpaid to see bills awaiting payment, and collect them.", "Payment बाकी वाले bills देखने के लिए Unpaid filter करें, और वसूल करें।"),
 ]),
]

MODS['appointments'] += [
 dict(id='example', lines=[
  ('$.fd-appt, [class*=appt]', "Example: a hair spa booked by phone for 11 o'clock with Kavya Reddy. When the guest arrives, mark In chair; when finished, mark Done.",
   "Example: phone से 11 बजे Kavya Reddy के साथ hair spa booked। Guest आने पर In chair, और काम पूरा होने पर Done mark करें।"),
  (None, "If the guest doesn't come, mark No-show — it appears in the no-show card so the desk can call them.",
   "अगर guest नहीं आए, No-show mark करें — वो no-show card में दिखता है ताकि desk उन्हें call कर सके।"),
 ]),
 dict(id='staff', lines=[
  ('All', "Filter one stylist to see just their day — useful when a stylist asks for their schedule.",
   "किसी एक stylist का दिन देखने के लिए उसे filter करें — जब stylist अपना schedule पूछे तब काम का।"),
  ('EXPECTED REVENUE', "Expected revenue adds up the services booked today, and shows how much is already billed.", "Expected revenue आज booked services का total है, और दिखाता है कितना bill हो चुका।"),
 ]),
]

MODS['audit-log'] += [
 dict(id='types', opt={'do': [set_select('All Types', 'Employee')]}, lines=[
  ('All Types', "Example: filter type Employee to see every change to staff — added, edited, deactivated or deleted — with the person who did it.",
   "Example: Employee type filter करें, staff में हर बदलाव देखने के लिए — added, edited, deactivated या deleted — किसने किया उसके साथ।"),
  (None, "Filter Vendor Invoice to see bills added or edited, or P&L Override to see manual changes to P&L figures.",
   "Vendor Invoice filter करके जोड़े या बदले bills देखें, या P&L Override से P&L में हाथ से किए बदलाव।"),
 ]),
 dict(id='search', lines=[
  ('Search by name or user…', "Search by a person's name — the user who made the change, or the employee or vendor it was about.",
   "किसी नाम से search करें — बदलाव करने वाला user, या जिस employee या vendor के बारे में बदलाव था।"),
  ('⟳ Refresh', "The log keeps the last five hundred events of the outlet. Changes in a locked month are not possible, so they never appear.",
   "Log outlet के आखिरी पाँच सौ events रखता है। Locked महीने में बदलाव संभव नहीं, इसलिए वो कभी नहीं दिखते।"),
 ]),
 dict(id='why', lines=[
  ('Audit Log', "Why it matters: everyone signs in with their own login, so every change has a name. Never share logins — then the log tells the truth.",
   "ये क्यों ज़रूरी है: हर कोई अपने login से sign in करता है, इसलिए हर बदलाव का नाम होता है। Logins कभी share न करें — तभी log सच बताएगा।"),
  (None, "Monthly check: owners should scan the audit log for unexpected salary edits or deleted bills.", "Monthly check: owners को अचानक हुए salary edits या deleted bills के लिए audit log देखना चाहिए।"),
 ]),
]

MODS['import-center'] += [
 dict(id='cards', opt={'do': [['scroll', 'Vendor Invoice Import', 'center']]}, lines=[
  ('Vendor Invoice Import', "Vendor Invoice Import loads many bills into the Vendor Sheet. The template lists your exact vendor names to copy from.",
   "Vendor Invoice Import कई bills Vendor Sheet में डालता है। Template में आपके vendors के सही नाम होते हैं, जहाँ से copy करें।"),
  (None, "Other imports cover incentive rules, attendance for a whole month, previous months P&L, bank statements and collection reports.",
   "बाकी imports incentive rules, पूरे महीने की attendance, previous months P&L, bank statements और collection reports के लिए हैं।"),
 ]),
 dict(id='tips', lines=[
  ('Import Center', "Tips for clean imports: don't rename or move columns, keep dates as dates, use exact employee and vendor names, and import a small test first.",
   "साफ import के लिए tips: columns का नाम या जगह न बदलें, dates को date ही रखें, employee और vendor के सही नाम इस्तेमाल करें, और पहले छोटा test import करें।"),
  (None, "If rows are skipped, the message tells you the row and the reason — fix the file and import again; rows already imported are not duplicated.",
   "अगर rows छूटें, message row और कारण बताता है — file ठीक करके फिर import करें; पहले import हुई rows दोबारा नहीं बनतीं।"),
 ]),
 dict(id='month', lines=[
  ('Go to Master Salary', "Typical uses: onboarding a new outlet — staff master, opening vendor bills, previous months P&L — and month-end — attendance and staff work report.",
   "आम इस्तेमाल: नया outlet शुरू करते समय — staff master, opening vendor bills, previous months P&L — और महीने के अंत में — attendance और staff work report।"),
 ]),
]

MODS['previous-pnl'] += [
 dict(id='example', opt={'do': [['click', '+ Add Month', 900]]}, lines=[
  ('@modal', "Example: you started SalonOS in April 2026. Enter March 2026 from your accounts — cash, card and UPI sales, then each expense line.",
   "Example: आपने SalonOS April 2026 में शुरू किया। March 2026 अपने accounts से डालें — cash, card और UPI sales, फिर हर expense line।"),
  (None, "Gross profit and EBITDA are calculated for you, just like the live P&L.", "Gross profit और EBITDA आपके लिए calculate होते हैं, live P&L की तरह।"),
 ]),
 dict(id='where', lines=[
  ('+ Add Month', "Why it matters: Same month last year in P&L Monthly, the twelve-month revenue trend and the annual P&L Statement all use these months.",
   "ये क्यों ज़रूरी है: P&L Monthly का same month last year, बारह महीने का revenue trend और annual P&L Statement सब इन्हीं महीनों को इस्तेमाल करते हैं।"),
  (None, "Edit or remove a month from its row. A month entered here takes over that month in the P&L, so don't enter months you track live.",
   "Row से महीना edit या remove करें। यहाँ डाला महीना P&L में उस महीने की जगह ले लेता है, इसलिए live track होने वाले महीने यहाँ न डालें।"),
 ]),
]

MODS['reports'] += [
 dict(id='cash-example', lines=[
  ('Cash Register', "Example: if cash was handed over to the owner every evening, the cash register lists each handover with the person's name and the total for the month.",
   "Example: अगर हर शाम cash owner को handover हुआ, cash register हर handover को व्यक्ति के नाम और महीने के total के साथ दिखाता है।"),
  ('$select', "Filter by type and search by name to check one person's cash.", "किसी एक व्यक्ति का cash check करने के लिए type से filter और नाम से search करें।"),
 ]),
 dict(id='esic', opt={'do': [['click', 'ESIC Summary', 900]]}, lines=[
  ('ESIC Summary', "ESIC Summary lists each ESIC-covered employee, their wages and the employee and employer contribution — the figures for the ESIC challan.",
   "ESIC Summary हर ESIC वाले employee, उनकी wages और employee व employer contribution दिखाता है — ESIC challan के आंकड़े।"),
 ]),
 dict(id='pt', opt={'do': [['click', 'PT Summary', 900]]}, lines=[
  ('PT Summary', "PT Summary shows professional tax deducted, for states that levy it.", "PT Summary उन states के लिए professional tax दिखाता है जहाँ ये लगता है।"),
  (None, "Month-end: after salary is locked, download PF, ESIC, PT and TDS summaries and give them to whoever files your returns.",
   "महीने के अंत में: salary lock होने के बाद PF, ESIC, PT और TDS summaries download करके returns भरने वाले को दें।"),
 ]),
]

MODS['outlet-dashboard'] += [
 dict(id='reading', lines=[
  ('NET PROFIT', "How to read it: if revenue is up but net profit is down, check expenses; if attendance is low, check staffing; if UPI and card grow while cash falls, that's normal.",
   "कैसे पढ़ें: revenue बढ़ा पर net profit घटा, तो खर्चे देखें; attendance कम है, तो staffing देखें; UPI और card बढ़ें और cash घटे, तो ये सामान्य है।"),
  ('GROSS MARGIN', "Each card's change line compares with last month — green is better, red is worse.", "हर card की change line पिछले महीने से तुलना करती है — हरा बेहतर, लाल खराब।"),
 ]),
 dict(id='period', opt={'do': [['click', 'Period Reports', 900]]}, lines=[
  ('Period Reports', "Period Reports shows several months together — revenue trend, average revenue and average net margin.",
   "Period Reports कई महीने एक साथ दिखाता है — revenue trend, average revenue और average net margin।"),
 ]),
 dict(id='mom2', opt={'do': [['click', 'Month-on-Month Comparison', 900]]}, lines=[
  ('Month A:', "Choose Month A and Month B. Every category shows both months and the change — revenue, salaries, products, rent, electricity and net profit.",
   "Month A और Month B चुनें। हर category दोनों महीने और बदलाव दिखाती है — revenue, salaries, products, rent, बिजली और net profit।"),
 ]),
]

MODS['outlet-pnl'] += [
 dict(id='working', lines=[
  ('🔍 Summary of working', "Summary of working explains how each total was reached, with its source — Daily Sales, Vendor Sheet, Bank Statement or Recurring Expenses.",
   "Summary of working बताता है हर total कैसे बना, उसके source के साथ — Daily Sales, Vendor Sheet, Bank Statement या Recurring Expenses।"),
  (None, "Other income and a few lines can be overridden by hand when needed; every override is recorded in the Audit Log.",
   "ज़रूरत हो तो other income और कुछ lines हाथ से override हो सकती हैं; हर override Audit Log में दर्ज होता है।"),
 ]),
 dict(id='checklist', lines=[
  ('✓ Mark as Final', "Before marking final: import the month's collection and bank statement, lock salary and incentives, enter every vendor and recurring bill, and check the Collection Reco differences.",
   "Final करने से पहले: महीने का collection और bank statement import करें, salary और incentives lock करें, हर vendor और recurring bill डालें, और Collection Reco के differences check करें।"),
 ]),
]

MODS['tally-export'] += [
 dict(id='preview', lines=[
  (None, "What gets sent: purchase vouchers from vendor bills, payment vouchers from vendor and salary payments, receipt vouchers from settlements, and contra entries for cash deposits.",
   "क्या भेजा जाता है: vendor bills से purchase vouchers, vendor और salary payments से payment vouchers, settlements से receipt vouchers, और cash deposits के contra entries।"),
  (None, "If a voucher is changed in SalonOS after sending, it shows as Changed, so you can send the correction. Unmapped entries go to suspense until you map the ledger.",
   "अगर भेजने के बाद SalonOS में voucher बदले, वो Changed दिखता है, ताकि correction भेज सकें। बिना map वाली entries ledger map होने तक suspense में रहती हैं।"),
 ]),
 dict(id='files', opt={'do': [['click', 'Settings', 900]]}, lines=[
  ('Settings', "No connector? You can still download Tally import files and import them in Tally yourself.", "Connector नहीं है? फिर भी Tally import files download करके Tally में खुद import कर सकते हैं।"),
  (None, "Evening auto-sync, if switched on, still asks before sending anything.", "Evening auto-sync, अगर चालू हो, फिर भी कुछ भेजने से पहले पूछता है।"),
 ]),
 dict(id='routine', lines=[
  ('Tally Integration', "Routine: once a week, open Tally on the connected computer, check the Vouchers tab, map any new ledgers, preview and move. Month-end: make sure nothing is left as new.",
   "Routine: हफ्ते में एक बार connected computer पर Tally खोलें, Vouchers tab देखें, नए ledgers map करें, preview करके move करें। महीने के अंत में: देखें कोई entry New न बची हो।"),
 ]),
]

MODS['insights'] += [
 dict(id='scope', lines=[
  ('All outlets', "Choose all outlets or just one. If you have access to only some sheets of an outlet, you see only what you're allowed.",
   "सभी outlets या सिर्फ एक चुनें। अगर किसी outlet की कुछ ही sheets का access है, तो आपको सिर्फ वही दिखता है जिसकी अनुमति है।"),
  (None, "Owner routine: open Owner Insights every evening — check every outlet has entered sales, look at the forecast, and plan the bills due.",
   "Owner routine: हर शाम Owner Insights खोलें — देखें हर outlet ने sales डाली, forecast देखें, और due bills plan करें।"),
 ]),
]

MODS['dashboard'] += [
 dict(id='filters', opt={'do': [SEP, set_select('All Outlets', 'Glow Sector 21')]}, lines=[
  ('All Outlets', "Choose one outlet to see the year's figures for just that outlet.", "सिर्फ एक outlet के साल के आंकड़े देखने के लिए वो outlet चुनें।"),
  (None, "Use the dashboard monthly to spot an outlet whose margin or attendance is slipping, then open that outlet's P&L to find why.",
   "Dashboard हर महीने इस्तेमाल करें ताकि जिस outlet का margin या attendance गिर रहा हो वो पकड़ में आए, फिर कारण जानने के लिए उसका P&L खोलें।"),
 ]),
]

MODS['reports-hub'] += [
 dict(id='types', opt={'do': [SEP, ['scroll', 'Vendor Payables', 'center']]}, lines=[
  ('Vendor Payables', "Example: Vendor Payables lists what each outlet owes, with ageing, so you can plan payments across the business.",
   "Example: Vendor Payables हर outlet का बकाया, ageing के साथ, दिखाता है, ताकि पूरे business के payments plan हो सकें।"),
  ('Compliance Calendar', "Compliance Calendar brings PF, ESIC, GST and TDS dates together for all outlets.", "Compliance Calendar सभी outlets की PF, ESIC, GST और TDS की तारीखें एक साथ लाता है।"),
 ]),
]

MODS['pnl-statement'] += [
 dict(id='reading', lines=[
  ('AVG NET MARGIN', "Use it at year end and for the bank or investors: it shows seasonality, the best and worst months, and the average margin.",
   "इसे साल के अंत में और bank या investors के लिए इस्तेमाल करें: ये seasonality, सबसे अच्छे और खराब महीने, और average margin दिखाता है।"),
  (None, "Months not marked final in P&L Monthly can still change — mark each month final when it's checked.",
   "जो महीने P&L Monthly में final नहीं हैं, वो अभी बदल सकते हैं — check होने पर हर महीना final करें।"),
 ]),
]

MODS['review'] += [
 dict(id='tips', lines=[
  ('Review Centre', "Reviewer tips: check that sales, expenses and attendance are complete for the period before approving, and always write a clear comment when returning.",
   "Reviewer tips: approve करने से पहले period की sales, खर्चे और attendance पूरे हैं check करें, और return करते समय हमेशा साफ comment लिखें।"),
 ]),
]

MODS['settings'] += [
 dict(id='restore', lines=[
  ('⬆ Import Backup (JSON)', "Restoring replaces data with the backup file's contents, so take a fresh backup first. Use it only when advised.",
   "Restore data को backup file की सामग्री से बदल देता है, इसलिए पहले नया backup लें। इसे सिर्फ सलाह मिलने पर इस्तेमाल करें।"),
  (None, "These statutory switches apply company-wide; each outlet and employee also has its own PF, ESIC and PT settings.",
   "ये statutory switches पूरी company पर लागू होते हैं; हर outlet और employee की अपनी PF, ESIC और PT settings भी होती हैं।"),
 ]),
]
