# Third pass: worked examples and common questions for the shortest modules.
from modules._h import *
from modules.m_x1 import MODS as X1
from modules.m_x2 import MODS as X2
MODS = {k: list(v) for d in (X1, X2) for k, v in d.items()}
SEP = set_select('Oct', 'Sep')

MODS['reports-hub'] += [
 dict(id='salary', opt={'do': [SEP, ['scroll', 'Salary Register', 'center']]}, lines=[
  ('Salary Register', "Salary Register lists every employee of the chosen outlets with gross salary, PF, ESIC, advance deduction, penalty, net salary and status — one sheet for the whole business.",
   "Salary Register चुने गए outlets के हर employee को gross salary, PF, ESIC, advance deduction, penalty, net salary और status के साथ दिखाता है — पूरे business की एक sheet।"),
  ('Attendance Report', "Attendance Report shows present, absent, half days, loss-of-pay days and attendance percentage per employee.",
   "Attendance Report हर employee के present, absent, half days, loss-of-pay days और attendance percentage दिखाता है।"),
 ]),
 dict(id='faq', opt={'do': [SEP]}, lines=[
  ('Reports Hub', "Question: why does a report show zero? Usually the month chosen has no entries yet — check the month at the top, and that the outlet's daily data is entered.",
   "सवाल: report शून्य क्यों दिखा रही है? अक्सर चुने गए महीने में अभी entries नहीं हैं — ऊपर महीना check करें, और outlet का daily data डला है या नहीं।"),
  (None, "You only see outlets you have access to, so two people can see different totals in the Reports Hub.",
   "आपको सिर्फ वही outlets दिखते हैं जिनका access है, इसलिए दो लोगों को Reports Hub में अलग totals दिख सकते हैं।"),
 ]),
]

MODS['review'] += [
 dict(id='mine', lines=[
  ('Review Centre', "For outlet users, this page is My Submissions: submit the month's operations data, then watch its status change from submitted to under review, approved or returned.",
   "Outlet users के लिए ये page My Submissions है: महीने का operations data submit करें, फिर उसका status submitted से under review, approved या returned होते देखें।"),
  (None, "If it comes back returned, read the comment, correct the sheets mentioned, and submit again. Approved data should not be changed without telling the reviewer.",
   "Returned आए तो comment पढ़ें, बताई गई sheets ठीक करें, और फिर submit करें। Approved data reviewer को बताए बिना नहीं बदलना चाहिए।"),
 ]),
]

MODS['pnl-statement'] += [
 dict(id='example', lines=[
  ('ANNUAL REVENUE', "Example: for Glow Sector 21, April to September is live data, so the annual figures grow every month as the year goes on.",
   "Example: Glow Sector 21 के लिए April से September live data है, इसलिए साल के आंकड़े हर महीने बढ़ते जाते हैं।"),
  (None, "Compare outlets by switching the outlet at the top. For one month's detail, open that outlet's P&L Monthly.",
   "ऊपर outlet बदलकर outlets compare करें। एक महीने की detail के लिए उस outlet का P&L Monthly खोलें।"),
 ]),
]

MODS['settings'] += [
 dict(id='leave', opt={'do': [['scroll', 'Leave Policy', 'center']]}, lines=[
  ('Leave Policy', "Leave Policy records the casual and sick leave allowed in a year, as a reference for managers.",
   "Leave Policy साल में मिलने वाली casual और sick leave दर्ज करता है, managers के reference के लिए।"),
  (None, "Weekly routine for a Super Admin: take a backup, glance at storage, and make sure every outlet's month locks are as they should be.",
   "Super Admin का weekly routine: backup लें, storage देखें, और हर outlet के month locks सही हैं ये पक्का करें।"),
 ]),
]

MODS['dashboard'] += [
 dict(id='payroll', opt={'do': [SEP, ['scroll', 'Monthly Revenue Trend', 'center']]}, lines=[
  ('Monthly Revenue Trend', "The monthly revenue trend stacks the year so you can see seasonality — festive months, wedding season and quieter months.",
   "Monthly revenue trend पूरे साल को दिखाता है ताकि seasonality दिखे — त्योहार, शादियों का season और धीमे महीने।"),
  (None, "Question: why is an outlet's margin very high? Check whether all its bills — rent, electricity, products — have been entered for the month.",
   "सवाल: किसी outlet का margin बहुत ज़्यादा क्यों है? Check करें कि उस महीने के सभी bills — rent, बिजली, products — डाले गए हैं या नहीं।"),
 ]),
]

MODS['previous-pnl'] += [
 dict(id='template', lines=[
  ('⬇ Download Template', "The template has one row per month with year, month, sales, other income, direct cost, employee cost, every operating expense line, depreciation and interest.",
   "Template में हर महीने की एक row है — year, month, sales, other income, direct cost, employee cost, हर operating expense line, depreciation और interest।"),
  (None, "Fill it from your old Tally or accounts P&L, month by month, and bulk import.", "इसे अपने पुराने Tally या accounts के P&L से, महीने-दर-महीने, भरकर bulk import करें।"),
 ]),
]

MODS['insights'] += [
 dict(id='forecast2', opt={'do': [['scroll', '🔮 Forecast', 'start']]}, lines=[
  (None, "Example: if an outlet has done three lakh in the first ten days of a thirty-day month, the expected close is about nine lakh. Against a target of ten lakh, it shows you are short by about one lakh.",
   "Example: अगर किसी outlet ने तीस दिन के महीने के पहले दस दिनों में तीन लाख किए, तो expected close लगभग नौ लाख। दस लाख के target के मुकाबले, ये लगभग एक लाख की कमी दिखाता है।"),
 ]),
]

MODS['master-sheet'] += [
 dict(id='locks', opt={'do': [click_in_row('Glow Sector 21', '🔒 Months'), ['wait', 800]]}, lines=[
  ('@modal', "Month locks: after a month is closed and filed, lock it here. Attendance, salary, incentives, daily sales and bills for that month become read-only for everyone.",
   "Month locks: महीना close और file होने के बाद उसे यहाँ lock करें। उस महीने की attendance, salary, incentives, daily sales और bills सबके लिए read-only हो जाते हैं।"),
  (None, "Unlock only for a genuine correction, then lock again.", "सिर्फ असली correction के लिए unlock करें, फिर दोबारा lock करें।"),
 ]),
]

MODS['audit-log'] += [
 dict(id='example', lines=[
  ('WHEN', "Example: Amit from accounts added Kumar Traders' bill of four thousand nine hundred and fifty-six on 30 September — the log shows his name, role, the time and the amount.",
   "Example: accounts के Amit ने 30 September को Kumar Traders का चार हज़ार नौ सौ छप्पन का bill जोड़ा — log में उनका नाम, role, समय और amount दिखता है।"),
 ]),
]

MODS['reports'] += [
 dict(id='expsum2', opt={'do': [['click', 'Expenses Summary', 900]]}, lines=[
  (None, "Example: compare pantry and staff refreshment month by month — a sudden jump is worth a question to the outlet.",
   "Example: pantry और staff refreshment को महीने-दर-महीने compare करें — अचानक उछाल पर outlet से पूछना चाहिए।"),
  (None, "Switch between individual expense rows and expense groups, the same groups used in P&L Monthly.", "Individual expense rows और expense groups के बीच बदलें — वही groups जो P&L Monthly में हैं।"),
 ]),
]

MODS['users'] += [
 dict(id='roles2', lines=[
  ('Salon Manager', "Summary approvals: a Salon Manager or ASM who has no access to Salary Working still sees its tab — but only a read-only summary to approve or return.",
   "Summary approvals: जिस Salon Manager या ASM को Salary Working का access नहीं है, उसे भी tab दिखता है — पर सिर्फ approve या return करने के लिए read-only summary।"),
  (None, "Question: someone can't see an outlet? Check their outlet access. Can see it but not a sheet? Check that outlet's sheet matrix. Can see but not edit? The outlet or sheet is set to View Only.",
   "सवाल: किसी को outlet नहीं दिख रहा? उनका outlet access देखें। Outlet दिखता है पर sheet नहीं? उस outlet का sheet matrix देखें। दिखता है पर edit नहीं? Outlet या sheet View Only पर है।"),
 ]),
]

MODS['penalty'] += [
 dict(id='edit', opt={'do': [click_in_row('Vikram Rao', 'Edit'), ['wait', 800]]}, lines=[
  ('@modal', "Edit a penalty to correct the amount, type or month. If it was entered in Daily Sales and Expenses, correct it there instead, or it will be overwritten.",
   "Amount, type या महीना ठीक करने के लिए penalty edit करें। अगर Daily Sales & Expenses में डाली गई थी, तो वहीं ठीक करें, वरना overwrite हो जाएगी।"),
 ]),
]

MODS['daily-incentive'] += [
 dict(id='faq', lines=[
  ('Daily Incentive Sheet', "Question: an entry looks doubled? It was probably entered both here and in Daily Sales and Expenses — delete the one added here.",
   "सवाल: कोई entry दो बार दिख रही है? शायद यहाँ और Daily Sales & Expenses दोनों में डाली गई — यहाँ जोड़ी गई entry delete करें।"),
 ]),
]

MODS['clients'] += [
 dict(id='birthday', lines=[
  ('Clients', "Birthday routine: every Monday, find clients with birthdays this week and send the birthday message with an offer valid for the month.",
   "Birthday routine: हर सोमवार इस हफ्ते जिनका birthday है उन clients को ढूँढें और महीने भर valid offer के साथ birthday message भेजें।"),
 ]),
]
