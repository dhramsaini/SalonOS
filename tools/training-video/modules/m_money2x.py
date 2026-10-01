# Extra scenes (worked examples, links, tips) appended to the modules in m_money2.
from modules._h import *
from modules.m_money2 import MODS as BASE
MODS = {k: list(v) for k, v in BASE.items()}

MODS['vendors'] += [
 dict(id='example', opt={'do': [mark_row('LOR/26/4471', 'r1')]}, lines=[
  (D('r1'), "Example: L'Oréal bill number LOR 26 4471 dated 4 September. Taxable value twenty-four thousand, CGST and SGST two thousand one hundred and sixty each — total twenty-eight thousand three hundred and twenty rupees.",
   "Example: L'Oréal का bill number LOR 26 4471, तारीख 4 September। Taxable value चौबीस हज़ार, CGST और SGST दो हज़ार एक सौ साठ-साठ — total अट्ठाईस हज़ार तीन सौ बीस रुपये।"),
  (None, "Fifteen thousand was paid by NEFT on 20 September, so the balance of thirteen thousand three hundred and twenty is due on 4 October.",
   "20 September को NEFT से पंद्रह हज़ार दिए गए, इसलिए बाकी तेरह हज़ार तीन सौ बीस रुपये 4 October को due हैं।"),
 ]),
 dict(id='flows', lines=[
  ('Vendor Sheet', "Every bill entered here flows on automatically: into P&L Monthly by category and booking month, into Due Dates, into Bank Payment for vendor payments, into Tally Export as a purchase voucher, and into Fixed Assets for equipment.",
   "यहाँ दर्ज हर bill अपने-आप आगे जाता है: category और booking month के हिसाब से P&L Monthly में, Due Dates में, vendor payments के लिए Bank Payment में, purchase voucher के रूप में Tally Export में, और equipment हो तो Fixed Assets में।"),
 ]),
 dict(id='tips', lines=[
  ('+ Add Invoice', "Good habits: enter every bill the day it arrives, attach the copy, choose the right category, and record each payment on the day it is made.",
   "अच्छी आदतें: हर bill उसी दिन दर्ज करें जिस दिन आए, copy attach करें, सही category चुनें, और हर payment उसी दिन दर्ज करें।"),
  (None, "If a date falls in a locked month, SalonOS will not allow the change — ask the Super Admin to unlock the month first.",
   "अगर तारीख locked महीने में है, SalonOS बदलाव नहीं करने देगा — पहले Super Admin से महीना unlock करवाएँ।"),
 ]),
]

MODS['due-dates'] += [
 dict(id='statuses', lines=[
  ('Due Date Tracker', "Every item has a status: overdue in red, due soon in amber, on track in green, upcoming in blue, and done once it is paid.",
   "हर item का status होता है: overdue लाल, due soon पीला, on track हरा, upcoming नीला, और pay होने पर done।"),
  (None, "Auto items are recalculated live. When salary is locked in Salary Working, its disbursement and challan items appear here with the right amounts.",
   "Auto items live recalculate होते हैं। Salary Working में salary lock होते ही उसके disbursement और challan items सही amounts के साथ यहाँ आ जाते हैं।"),
 ]),
 dict(id='link', opt={'do': [['click', '✓ Mark Paid', 900], ['click', '🔗 Link with Bank Statement', 900]]}, lines=[
  ('@modal', "Link with Bank Statement lists unlinked debits from the bank statement, closest amount first. Select the right one and the amount, date and reference are filled in.",
   "Link with Bank Statement, bank statement की unlinked debits दिखाता है, सबसे करीब की amount पहले। सही वाली चुनें, amount, तारीख और reference भर जाते हैं।"),
  (None, "Click Confirm Payment. The item turns paid and shows a link to that bank transaction.",
   "Confirm Payment दबाएँ। Item paid हो जाता है और उस bank transaction का link दिखाता है।"),
 ]),
 dict(id='routine', lines=[
  ('Overdue', "A good routine: open Due Dates every Monday, clear everything overdue first, then plan the items due soon.",
   "अच्छा routine: हर सोमवार Due Dates खोलें, पहले overdue निपटाएँ, फिर due soon वाले items की planning करें।"),
  (None, "Remember the usual statutory dates — TDS by the 7th, PF and ESIC by the 15th of the following month — and add GST and professional tax as your own items.",
   "आम statutory तारीखें याद रखें — TDS अगले महीने की 7 तारीख तक, PF और ESIC 15 तारीख तक — और GST व professional tax अपने items के रूप में जोड़ें।"),
 ]),
]

MODS['recurring-expenses'] += [
 dict(id='enter', opt={'do': [['click', '➕ Enter bill', 900]]}, lines=[
  ('@modal', "This is the Enter bill form. Enter the bill number, bill date and booking date, the amount and the months the bill covers.",
   "यह Enter bill form है। Bill number, bill date और booking date, amount और bill कितने महीनों का है, डालें।"),
  ('📄 Read bill', "Read bill fills these for you from a photo or PDF, including the billing period printed on the bill.",
   "Read bill इन्हें photo या PDF से भर देता है, bill पर छपी billing period समेत।"),
  (None, "Saving creates the bill in the Vendor Sheet, ready to be paid.", "Save करते ही bill Vendor Sheet में बन जाता है, pay करने के लिए तैयार।"),
 ]),
 dict(id='register', opt={'do': [['click', '📒 Register', 1000]]}, lines=[
  ('@modal', "Example from this outlet: electricity is billed every two months, postpaid. The May to June bill was sixteen thousand eight hundred — eight thousand four hundred a month.",
   "इस outlet का example: बिजली का bill हर दो महीने में, postpaid आता है। May–June का bill सोलह हज़ार आठ सौ था — आठ हज़ार चार सौ महीना।"),
  (None, "July and August have no bill yet, so each month carries an estimate of eight thousand four hundred.",
   "July और August का bill अभी नहीं आया, इसलिए हर महीने आठ हज़ार चार सौ का estimate लगता है।"),
  (None, "If the July to August bill comes for eighteen thousand, that is nine thousand a month — so six hundred more per month, twelve hundred in all, is adjusted in the month the bill is booked.",
   "अगर July–August का bill अठारह हज़ार आता है, तो नौ हज़ार महीना — यानी हर महीने छह सौ ज़्यादा, कुल बारह सौ, उस महीने में adjust होगा जिसमें bill book हुआ।"),
 ]),
 dict(id='rent', opt={'do': [click_in_row('Shop Rent', 'Edit'), ['wait', 900]]}, lines=[
  ('@modal', "For rent, also record the agreement: rent start date, the increment schedule and percentage, and attach the agreement copy. SalonOS reminds you before each increment.",
   "Rent के लिए agreement भी दर्ज करें: rent start date, increment schedule और percentage, और agreement की copy attach करें। हर increment से पहले SalonOS याद दिलाता है।"),
  (None, "Royalty takes its condition and percentage; software takes its renewal date; marketing and dry-cleaning can carry a future amount from a set date.",
   "Royalty में उसकी condition और percentage; software में renewal date; marketing और dry-cleaning में किसी तारीख से नई amount रखी जा सकती है।"),
 ]),
]

MODS['fixed-assets'] += [
 dict(id='example', lines=[
  ('Hydraulic styling chairs (4)', "Example: Salon Furniture Co bill SFC 112 — four hydraulic chairs for sixty-four thousand and two mirror stations for thirty-two thousand.",
   "Example: Salon Furniture Co का bill SFC 112 — चार hydraulic chairs चौंसठ हज़ार की और दो mirror stations बत्तीस हज़ार के।"),
  ('Total Value', "With GST the bill is one lakh thirteen thousand two hundred and eighty. Sixty thousand is paid, so fifty-three thousand two hundred and eighty is outstanding.",
   "GST के साथ bill एक लाख तेरह हज़ार दो सौ अस्सी का है। साठ हज़ार paid हैं, इसलिए तिरपन हज़ार दो सौ अस्सी outstanding है।"),
  (None, "If the outlet cannot claim GST input credit, enter the GST-inclusive cost, because that GST becomes part of the asset's value.",
   "अगर outlet GST input credit claim नहीं कर सकता, तो GST सहित cost डालें, क्योंकि वो GST asset की value का हिस्सा बन जाता है।"),
 ]),
 dict(id='assign', opt={'do': [['click', 'Depreciation', 900]]}, lines=[
  ('— Assign Block —', "Assign each new asset bill a block — for example furniture and fittings — and it joins the depreciation schedule.",
   "हर नए asset bill को block assign करें — जैसे furniture and fittings — और वो depreciation schedule में जुड़ जाता है।"),
  ('Block-wise', "Under the Income Tax method, additions used for less than 180 days are shown separately, because they get only half the year's depreciation.",
   "Income Tax method में 180 दिन से कम इस्तेमाल हुए additions अलग दिखते हैं, क्योंकि उन्हें साल का सिर्फ आधा depreciation मिलता है।"),
 ]),
 dict(id='add', opt={'do': [['click', 'Depreciation', 900], ['click', '+ Add Opening Asset', 900]]}, lines=[
  ('@modal', "Add Opening Asset is for things you owned before SalonOS — enter the block, the financial year and the current written-down value.",
   "Add Opening Asset उन चीज़ों के लिए है जो SalonOS से पहले से थीं — block, financial year और current written-down value डालें।"),
  (None, "Add New Asset records a purchase not entered as a vendor bill, with cost and date of purchase. Dispose marks an asset sold or scrapped.",
   "Add New Asset उस purchase के लिए है जो vendor bill के रूप में दर्ज नहीं हुई, cost और purchase date के साथ। Dispose किसी asset को बेचा या scrap mark करता है।"),
 ]),
]
