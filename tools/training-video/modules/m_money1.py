from modules._h import *
OCT = {'mi': 6}
MODS = {}

MODS['daily-sales'] = [
 dict(id='overview', opt=OCT, lines=[
  ('Daily Expenses & Sales Sheet', "Daily Sales and Expenses is the day book of the outlet. Every cash expense, every sale and every cash movement of the day is entered here.",
   "Daily Sales & Expenses outlet की रोज़ की book है। दिन का हर cash खर्च, हर sale और cash का हर लेन-देन यहीं दर्ज होता है।"),
  ('$thead th:last-child', "Each column is one day. The last column, marked Today, is the one you can edit. Earlier days are view only.",
   "हर column एक दिन है। आखिरी column, जिस पर Today लिखा है, वही edit होता है। पिछले दिन सिर्फ देखे जा सकते हैं।"),
  ('Daily Expenses', "Rows are fixed expense heads, and the second column shows the expense group each row goes to in the P&L.",
   "Rows तय expense heads हैं, और दूसरा column बताता है कि वो row P&L के किस expense group में जाएगी।"),
  ('TOTAL', "The Total column adds up all days shown.", "Total column दिखाए गए सभी दिनों को जोड़ता है।"),
 ]),
 dict(id='toolbar', opt=OCT, lines=[
  ('View up to date:', "View up to date chooses the last day shown. Use the arrows for the previous or next day.",
   "View up to date से आखिरी दिखने वाला दिन चुनें। पिछले या अगले दिन के लिए arrows इस्तेमाल करें।"),
  ('$select', "Next to it, choose how many days to show — five days, more, or the full month.",
   "उसके बगल में चुनें कि कितने दिन दिखें — पाँच दिन, ज़्यादा, या पूरा महीना।"),
  ('⬇ Export Excel', "Export Excel and Export PDF download exactly what is on screen. Share sends it on WhatsApp or email.",
   "Export Excel और Export PDF वही download करते हैं जो screen पर है। Share से WhatsApp या email पर भेजें।"),
  ('📊 Monthly & Comparative Summary', "Monthly and Comparative Summary rolls the same figures up month by month.",
   "Monthly & Comparative Summary इन्हीं आंकड़ों को महीने-दर-महीने जोड़कर दिखाता है।"),
 ]),
 dict(id='cards', opt=OCT, lines=[
  ("TODAY'S TOTAL EXP", "The cards on top show today's total expense, the total for the period shown, the number of expense rows and the days shown.",
   "ऊपर के cards में आज का कुल खर्च, दिखाए गए period का total, expense rows की गिनती और दिखाए गए दिन हैं।"),
  ("Today's column (editable)", "The colour legend explains the cells: today's editable column, vendor-linked rows, previous month salary and employee rows.",
   "Colour legend cells को समझाता है: आज का editable column, vendor-linked rows, previous month salary और employee rows।"),
 ]),
 dict(id='desc-row', opt=dict(OCT, do=[click_in_row('Pentry Expenses', 'Add'), ['wait', 700]]), lines=[
  ('@modal', "Ordinary expense rows open a small form. Enter the amount and a description for each expense — a description is required.",
   "साधारण expense rows एक छोटा form खोलती हैं। हर खर्च की amount और description डालें — description ज़रूरी है।"),
  ('+ Add', "Spent twice on the same head today? Add another line. The cell shows the total of all lines.",
   "आज एक ही head पर दो बार खर्च हुआ? एक और line जोड़ें। Cell में सभी lines का total दिखता है।"),
  ('✓ Save Entries', "Click Save Entries to put the amount in today's cell.", "आज के cell में amount डालने के लिए Save Entries दबाएँ।"),
 ]),
 dict(id='emp-row', opt=dict(OCT, do=[click_in_row('Advance To Employees', 'Add'), ['wait', 700]]), lines=[
  ('@modal', "Rows with a person icon are employee rows — commissions, advance, previous month salary, tip, penalties and staff overtime.",
   "Person icon वाली rows employee rows हैं — commissions, advance, पिछले महीने की salary, tip, penalties और staff overtime।"),
  ('Employee Name', "Pick the employee and enter the amount. Only active employees are listed.",
   "Employee चुनें और amount डालें। सिर्फ active employees दिखते हैं।"),
  ('Recover Against', "For a cash advance, choose whether it is recovered from salary or incentive, and generate a month-wise deduction plan if you want.",
   "Cash advance के लिए चुनें कि वसूली salary से होगी या incentive से, और चाहें तो month-wise deduction plan generate करें।"),
  (None, "These entries flow automatically to the Advances, Penalties and Daily Incentive sheets — you never enter them twice.",
   "ये entries अपने-आप Advances, Penalties और Daily Incentive sheets में चली जाती हैं — दोबारा entry नहीं करनी पड़ती।"),
 ]),
 dict(id='inv-row', opt=dict(OCT, do=[click_in_row('Electricity Expenses', 'Add'), ['wait', 700]]), lines=[
  ('@modal', "Rows with a bill icon — rent, electricity, telephone, royalty and similar — are paid against a vendor invoice.",
   "Bill icon वाली rows — rent, बिजली, telephone, royalty वगैरह — vendor invoice के against pay होती हैं।"),
  (None, "Pick an outstanding invoice to pay it, or add a new invoice here. It is saved straight into the Vendor Sheet with the payment.",
   "किसी outstanding invoice को pay करने के लिए चुनें, या यहीं नया invoice जोड़ें। वो payment के साथ सीधे Vendor Sheet में सेव होता है।"),
 ]),
 dict(id='sales', opt=dict(OCT, do=[mark_row('Cash Sale', 'cs'), ['wait', 300]]), lines=[
  (D('cs'), "Below the expenses is Daily Sales and Collection. Enter cash, card, UPI and Luzo sales for the day.",
   "Expenses के नीचे Daily Sales & Collection है। दिन की cash, card, UPI और Luzo sales डालें।"),
  ('Outstanding Sale', "Outstanding Sale is a sale not yet paid — enter the invoice number and the client's name. When the money comes, record it as Outstanding Recovery against that invoice.",
   "Outstanding Sale वो sale है जिसका पैसा अभी नहीं आया — invoice number और client का नाम डालें। पैसा आने पर उसी invoice के against Outstanding Recovery दर्ज करें।"),
  ('Total Daily Sale', "Total Daily Sale and Total Collection are calculated for you.", "Total Daily Sale और Total Collection अपने-आप calculate होते हैं।"),
 ]),
 dict(id='cash', opt=dict(OCT, do=[mark_row('Opening Cash Balance', 'ob'), mark_row('Closing Cash Balance', 'cb'), ['wait', 300]]), lines=[
  (D('ob'), "Opening Cash Balance comes from yesterday's closing balance.", "Opening Cash Balance कल के closing balance से आता है।"),
  ('Bank Deposit', "Enter cash packet, cash handed over, bank deposit and cash received. Handover and received need the person's name.",
   "Cash packet, cash handover, bank deposit और cash received डालें। Handover और received में व्यक्ति का नाम ज़रूरी है।"),
  (D('cb'), "Closing Cash Balance should match the cash in the drawer. SalonOS blocks any entry that would make it negative.",
   "Closing Cash Balance drawer के cash से मिलना चाहिए। जो entry इसे negative करे, SalonOS उसे रोक देता है।"),
 ]),
 dict(id='register', opt=OCT, lines=[
  ('$thead th:last-child', "The clip icon on each day's header attaches a photo or PDF of the physical cash register for that day.",
   "हर दिन के header पर clip icon से उस दिन के cash register की photo या PDF attach करें।"),
  (None, "SalonOS reads the closing figure from the photo and compares it with the computed closing balance — and warns you of any shortage or excess.",
   "SalonOS photo से closing figure पढ़कर computed closing balance से मिलाता है — और कमी या ज़्यादा होने पर चेतावनी देता है।"),
 ]),
 dict(id='save', opt=OCT, lines=[
  ('💾 Save Today', "When the day is complete, click Save Today. Entries also save as you type, and sync to the cloud.",
   "दिन पूरा होने पर Save Today दबाएँ। Entries type करते-करते भी सेव होती हैं और cloud में sync होती हैं।"),
  ('Mark Month Final', "At month end the manager ticks Mark Month Final. The whole month is then locked for the manager's side.",
   "महीने के अंत में manager Mark Month Final tick करता है। फिर पूरा महीना manager की तरफ से lock हो जाता है।"),
  (None, "Days can also show Locked, when the month is locked in Salary Working, or Window Closed, when the date is outside the editing window set for the outlet.",
   "दिन Locked भी दिख सकते हैं, जब महीना Salary Working में lock हो, या Window Closed, जब तारीख outlet की editing window के बाहर हो।"),
 ]),
 dict(id='summary', opt=dict(OCT, do=[['click', '📊 Monthly & Comparative Summary', 900]]), lines=[
  ('@modal', "The Monthly and Comparative Summary shows each expense head month by month, so you can spot unusual spending quickly.",
   "Monthly & Comparative Summary हर expense head को महीने-दर-महीने दिखाता है, ताकि असामान्य खर्च जल्दी पकड़ में आए।"),
  (None, "Everything here also rolls into P&L Monthly automatically, by expense group.",
   "यहाँ की हर चीज़ expense group के हिसाब से अपने-आप P&L Monthly में जाती है।"),
 ]),
 dict(id='tips', opt=OCT, lines=[
  ('Daily Expenses & Sales Sheet', "Good habit: enter expenses as they happen, enter sales before closing, attach the cash register photo, then Save Today.",
   "अच्छी आदत: खर्च होते ही entry करें, बंद करने से पहले sales डालें, cash register की photo attach करें, फिर Save Today।"),
 ]),
]
