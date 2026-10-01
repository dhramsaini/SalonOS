# Expansion scenes for payroll, money and admin modules.
from modules._h import *
from modules.m_pay import MODS as P
from modules.m_money3 import MODS as M3
MODS = {k: list(v) for d in (P, M3) for k, v in d.items()}

MODS['penalty'] += [
 dict(id='example2', opt={'do': [['click', '+ Add Penalty', 900]]}, lines=[
  ('Penalty Type', "Worked example: Sunita Devi came without uniform on 17 September. Choose her name, type Uniform violation, amount one hundred, approved by Priya Sharma, deduction month September, recovery from salary.",
   "Worked example: Sunita Devi 17 September को बिना uniform आईं। उनका नाम, type Uniform violation, amount सौ, approved by Priya Sharma, deduction month September, वसूली salary से चुनें।"),
  (None, "For Other, type what happened, for example left workstation unattended.", "Other के लिए लिखें क्या हुआ, जैसे workstation बिना किसी के छोड़ दिया।"),
 ]),
 dict(id='policy', lines=[
  ('THIS MONTH', "Keep penalties fair and documented: tell the employee, note the reason in remarks, and make sure a manager approves it.",
   "Penalties को fair और दर्ज रखें: employee को बताएँ, reason remarks में लिखें, और manager से approve करवाएँ।"),
  (None, "Penalties appear in the employee's Salary Working row and payslip, so they can see exactly what was deducted and why.",
   "Penalties employee की Salary Working row और payslip में दिखती हैं, ताकि उन्हें पता हो क्या कटा और क्यों।"),
  ('⟳ Sync Employees from Attendance', "Sync Employees from Attendance refreshes the employee list from this month's attendance.", "Sync Employees from Attendance इस महीने की attendance से employee list refresh करता है।"),
 ]),
 dict(id='nonperf', lines=[
  (None, "Note: this is different from the non-performance penalty in Incentive Working, which reduces incentive for missing targets.",
   "ध्यान दें: ये Incentive Working की non-performance penalty से अलग है, जो target पूरा न होने पर incentive घटाती है।"),
 ]),
]

MODS['advance'] += [
 dict(id='bank', opt={'do': [['click', '+ New Advance (Bank)', 900]]}, lines=[
  ('@modal', "New Advance by bank transfer: employee, date, amount, the bank reference — which is required — reason, approved by, and the recovery plan.",
   "Bank transfer से New Advance: employee, तारीख, amount, bank reference — जो ज़रूरी है — reason, approved by, और वसूली plan।"),
  ('Recover Against', "Choose to recover from salary or incentive, the monthly deduction and the start month, then Generate the month-wise schedule.",
   "Salary या incentive से वसूली, monthly deduction और शुरुआत का महीना चुनें, फिर month-wise schedule Generate करें।"),
 ]),
 dict(id='approve', lines=[
  ('PENDING APPROVAL', "Approving requests: an ASM opens Pending Approval and clicks Approve or Reject on each request. Only approved advances are deducted.",
   "Requests approve करना: ASM Pending Approval खोलकर हर request पर Approve या Reject दबाता है। सिर्फ approved advances की कटौती होती है।"),
  (None, "Example: Neha Singh asked for four thousand for a medical need on 10 September, two thousand a month from September — approved by Priya Sharma.",
   "Example: Neha Singh ने 10 September को medical ज़रूरत के लिए चार हज़ार माँगे, September से दो हज़ार महीना — Priya Sharma ने approve किया।"),
 ]),
 dict(id='rules', lines=[
  ('Advance to Employees', "Rules to remember: cash advances only through Daily Sales and Expenses; bank advances only here; and an advance synced from Daily Sales must be edited there, not here.",
   "याद रखें: cash advance सिर्फ Daily Sales & Expenses से; bank advance सिर्फ यहाँ; और Daily Sales से sync हुआ advance वहीं edit करें, यहाँ नहीं।"),
  (None, "An advance with no schedule deducts its flat monthly amount every month until recovered.", "बिना schedule वाला advance वसूल होने तक हर महीने अपनी fixed monthly amount काटता है।"),
 ]),
]

MODS['daily-incentive'] += [
 dict(id='addform', opt={'do': [['click', '+ Add Entry', 900]]}, lines=[
  ('@modal', "Add Entry: date, employee, the service type, target and achieved amounts, rate and incentive, and how it was paid.",
   "Add Entry: तारीख, employee, service type, target और achieved amounts, rate और incentive, और कैसे pay हुआ।"),
  (None, "Example: a five hundred rupee target commission paid in cash to Imran Khan when he crossed his daily target.",
   "Example: Imran Khan को daily target पार करने पर पाँच सौ रुपये target commission cash में दिया गया।"),
 ]),
 dict(id='flow', lines=[
  ('Incentive Entries', "Where it goes: daily incentives count as employee daily incentive in P&L Monthly, separate from the monthly incentive in Incentive Working.",
   "ये कहाँ जाता है: daily incentives P&L Monthly में employee daily incentive में गिने जाते हैं, Incentive Working के monthly incentive से अलग।"),
  (None, "To avoid double entry, record cash commissions in Daily Sales and Expenses — they appear here by themselves. Use Add Entry only for others.",
   "दोहरी entry से बचने के लिए cash commissions Daily Sales & Expenses में दर्ज करें — वो यहाँ खुद आ जाते हैं। Add Entry सिर्फ बाकी के लिए।"),
  (None, "At month end, check each employee's total here before generating incentives.", "महीने के अंत में incentive generate करने से पहले यहाँ हर employee का total check करें।"),
 ]),
]

MODS['attendance'] += [
 dict(id='statuses', lines=[
  ('Employees', "What each status means for pay: present and weekly off are paid; half day pays half; absent is unpaid; holiday is paid; not joined and left are outside employment.",
   "हर status का pay पर असर: present और weekly off paid; half day आधा; absent unpaid; holiday paid; not joined और left employment के बाहर।"),
  (None, "Extra days are worked weekly offs, and the adjustment balances allowed weekly offs against those taken.", "Extra days काम किए गए weekly offs हैं, और adjustment allowed weekly offs को लिए गए offs से balance करता है।"),
 ]),
 dict(id='newjoin', lines=[
  (None, "New joiners: days before the joining date show as not joined. Leavers: after the leaving date, days show as left — set these dates in Master Salary.",
   "नए joiners: joining date से पहले के दिन not joined दिखते हैं। छोड़ने वाले: leaving date के बाद left — ये तारीखें Master Salary में डालें।"),
  ('LOP DAYS', "Example: Anjali Gupta's three loss-of-pay days reduce her September salary by three-thirtieths.", "Example: Anjali Gupta के तीन loss-of-pay days उनकी September salary को तीस में से तीन हिस्से कम करते हैं।"),
 ]),
 dict(id='sw', lines=[
  ('Full Register', "When attendance is final, go to Salary Working and generate salary — it warns you if any day is still unmarked.",
   "Attendance final होने पर Salary Working में जाकर salary generate करें — कोई दिन unmarked हो तो वो चेतावनी देता है।"),
 ]),
]

MODS['master-salary'] += [
 dict(id='view', opt={'do': [click_in_row('Rahul Verma', 'View'), ['wait', 800]]}, lines=[
  ('@modal', "View shows the full record — personal info, documents, employment, salary breakdown and bank details — on one screen.",
   "View पूरा record एक screen पर दिखाता है — personal info, documents, employment, salary breakdown और bank details।"),
  ('✏ Edit Employee', "Edit Employee opens the same three steps to change anything, such as a salary revision.", "Edit Employee वही तीन steps खोलता है कुछ भी बदलने के लिए, जैसे salary revision।"),
 ]),
 dict(id='revision', lines=[
  (None, "Salary revision: edit the salary amounts, then refresh Salary Working for the month so the new figures are used. Do revisions before the month is locked.",
   "Salary revision: salary amounts edit करें, फिर उस महीने की Salary Working refresh करें ताकि नए आंकड़े लगें। Revision महीना lock होने से पहले करें।"),
  (None, "PF: SalonOS works the employer contribution on the actual basic or the wage ceiling, as set for the employee. ESIC applies to those earning up to twenty-one thousand gross.",
   "PF: SalonOS employer contribution employee की setting के अनुसार actual basic या wage ceiling पर निकालता है। ESIC इक्कीस हज़ार gross तक वालों पर लागू होता है।"),
 ]),
 dict(id='check', lines=[
  ('Master Salary Sheet', "Checklist for every new joiner: billing ID, Aadhaar copy, department and designation, weekly off, salary split, PF and ESIC ticks, and bank details with proof.",
   "हर नए joiner के लिए checklist: billing ID, Aadhaar copy, department और designation, weekly off, salary split, PF और ESIC ticks, और proof के साथ bank details।"),
 ]),
]

MODS['salary-working'] += [
 dict(id='pt', lines=[
  (None, "Professional tax is applied automatically in states that levy it, using slabs you can review and edit. TDS on salary is entered per employee when applicable.",
   "Professional tax उन states में अपने-आप लगता है जहाँ लागू है, slabs के साथ जिन्हें review और edit कर सकते हैं। Salary पर TDS लागू हो तो हर employee के लिए डाला जाता है।"),
  (None, "Example: Rahul Verma's gross of thirty-two thousand is prorated by his days payable, incentive added, PF and ESIC as applicable deducted, giving his net salary.",
   "Example: Rahul Verma का बत्तीस हज़ार gross उनके payable दिनों के हिसाब से prorate होता है, incentive जुड़ता है, लागू PF और ESIC कटते हैं, और net salary बनती है।"),
 ]),
 dict(id='routine', lines=[
  ('🧮 Generate Salary', "Month-end order: finalise attendance; lock Incentive Working; generate salary; review each row; approve all; lock; then payslips, challans and payment.",
   "महीने के अंत का क्रम: attendance final करें; Incentive Working lock करें; salary generate करें; हर row review करें; approve all; lock; फिर payslips, challans और payment।"),
  ('⟳ Refresh', "Refresh pulls the latest attendance, advances and penalties if anything changed after generating.", "Generate के बाद कुछ बदला हो तो Refresh नई attendance, advances और penalties लाता है।"),
  ('⬇ Export Excel', "Export Excel gives the full sheet with every column.", "Export Excel हर column के साथ पूरी sheet देता है।"),
 ]),
]

MODS['incentive-working'] += [
 dict(id='nonperf', lines=[
  (None, "Deductions: a non-performance penalty and any advance recovered from incentive reduce the incentive. Net incentive is never below zero.",
   "Deductions: non-performance penalty और incentive से वसूला advance incentive घटाते हैं। Net incentive कभी शून्य से कम नहीं होता।"),
  (None, "Click any employee's figure to see the working — target, achieved, times of target and rate.", "किसी employee के figure पर क्लिक करके working देखें — target, achieved, target के गुणज और rate।"),
 ]),
 dict(id='payment', opt={'do': [['click', 'Incentive Payment', 900]]}, lines=[
  ('Incentive Payment', "Incentive Payment lists each employee's total incentive with bank details, ready to export or pay through Bank Payment.",
   "Incentive Payment हर employee का total incentive bank details के साथ दिखाता है, export या Bank Payment से pay करने के लिए तैयार।"),
 ]),
 dict(id='routine', lines=[
  ('🧮 Generate Incentive', "Month-end order: import the Staff Work Report, check achieved figures and overtime hours, generate, review, approve, lock — then generate salary.",
   "महीने के अंत का क्रम: Staff Work Report import करें, achieved figures और OT hours check करें, generate, review, approve, lock — फिर salary generate करें।"),
 ]),
]

MODS['collection'] += [
 dict(id='format', lines=[
  ('Required Cradlee Format', "If an import fails, check the format: the file needs Center Name and Invoice Date columns, one row per day. Summary or total lines are ignored.",
   "Import fail हो तो format check करें: file में Center Name और Invoice Date columns चाहिए, हर दिन की एक row। Summary या total lines छोड़ दी जाती हैं।"),
  (None, "Dates can be day-month or month-day; SalonOS works out which, as long as the whole file is consistent.", "Dates day-month या month-day हो सकती हैं; SalonOS समझ लेता है, बशर्ते पूरी file एक जैसी हो।"),
 ]),
]

MODS['collection-sheet'] += [
 dict(id='example', lines=[
  ('CASH AS PER COUNTER REPORT', "Example: on a day Cradlee shows card sales of twenty thousand but the bank credits nineteen thousand six hundred, the four hundred difference is usually card fees — it flows into net bank charges.",
   "Example: किसी दिन Cradlee में card sales बीस हज़ार और bank में उन्नीस हज़ार छह सौ, तो चार सौ का difference आमतौर पर card fees है — ये net bank charges में जाता है।"),
  (None, "If cash as per Cradlee is more than the counter report, a cash sale was not entered in Daily Sales, or cash is short — investigate the same day.",
   "अगर Cradlee का cash counter report से ज़्यादा है, तो कोई cash sale Daily Sales में नहीं डली, या cash कम है — उसी दिन जाँच करें।"),
 ]),
]

MODS['bank-statement'] += [
 dict(id='example', opt={'do': [['scroll', 'Nature', 'center']]}, lines=[
  (None, "Example: the line NEFT Sharma Properties rent September for one lakh three hundred is tagged Vendor Payment, matched to Sharma Properties, and linked to the September rent bill — which is then marked paid.",
   "Example: NEFT Sharma Properties rent September की एक लाख तीन सौ वाली line Vendor Payment tag होती है, Sharma Properties से match होकर September के rent bill से link होती है — जो फिर paid हो जाता है।"),
  (None, "A UPI settlement on 2 August is given the Cradlee date of 1 August, so it matches 1 August's UPI sales in Collection Reco.",
   "2 August का UPI settlement 1 August की Cradlee date पाता है, ताकि Collection Reco में 1 August की UPI sales से मिले।"),
 ]),
 dict(id='routine', lines=[
  ('🔗 Unlinked Debits', "Weekly routine: import the statement, clear unclassified lines, link unlinked debits to bills or salaries, and check the missing Cradlee dates.",
   "Weekly routine: statement import करें, unclassified lines निपटाएँ, unlinked debits को bills या salaries से link करें, और missing Cradlee dates check करें।"),
 ]),
]

MODS['bank-payment'] += [
 dict(id='example', lines=[
  ('Salary', "Example: for September salaries, choose HDFC format, Auto mode, the outlet's account and value date 7 October. Every employee with bank details is listed with their net pay.",
   "Example: September salaries के लिए HDFC format, Auto mode, outlet का account और value date 7 October चुनें। Bank details वाला हर employee net pay के साथ दिखता है।"),
  (None, "Tick the ones to pay, generate the file, and upload it in HDFC's bulk upload. Payments above two lakh would go by RTGS automatically.",
   "जिन्हें pay करना है tick करें, file generate करें, और HDFC के bulk upload में डालें। दो लाख से ऊपर की payments अपने-आप RTGS से जाएँगी।"),
 ]),
 dict(id='safety', lines=[
  ('⟳ Refresh', "Safety tips: always check the total against Salary Working before uploading; never edit the file by hand; and test a new bank format with a small batch first.",
   "Safety tips: upload से पहले total को Salary Working से मिलाएँ; file हाथ से कभी edit न करें; और नए bank format को पहले छोटे batch से test करें।"),
  (None, "Missing bank details? The Go to Vendors and Go to Master Salary buttons take you to fix them.", "Bank details नहीं हैं? Go to Vendors और Go to Master Salary buttons उन्हें ठीक करने ले जाते हैं।"),
 ]),
]
