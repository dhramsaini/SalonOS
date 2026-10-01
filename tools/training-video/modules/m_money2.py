from modules._h import *
MODS = {}

MODS['vendors'] = [
 dict(id='top', lines=[
  ('Vendor Sheet', "The Vendor Sheet is the register of every supplier, every bill and every payment of the outlet.",
   "Vendor Sheet outlet के हर supplier, हर bill और हर payment का register है।"),
  ('Total Outstanding', "The cards show total vendors, total outstanding, the overdue amount and what was paid this month.",
   "Cards में total vendors, total outstanding, overdue amount और इस महीने का payment दिखता है।"),
  ('🧾 Invoices & Payments', "There are five tabs: Invoices and Payments, Outstanding Invoices, Performa Invoice, Dashboard and the Master Vendor List.",
   "पाँच tabs हैं: Invoices & Payments, Outstanding Invoices, Performa Invoice, Dashboard और Master Vendor List।"),
 ]),
 dict(id='list', opt={'do': [['click', '📋 Master Vendor List', 700]]}, lines=[
  ('📋 Master Vendor List', "Start with the Master Vendor List. It holds name, GST number, category, contact, payment terms and status.",
   "शुरुआत Master Vendor List से करें। इसमें नाम, GST number, category, contact, payment terms और status रहते हैं।"),
  ('+ Add Vendor', "Add Vendor opens the vendor form. Edit or delete a vendor from the row.", "Add Vendor से vendor form खुलता है। Row से vendor edit या delete करें।"),
 ]),
 dict(id='vform', opt={'do': [['click', '+ Add Vendor', 800]]}, lines=[
  ('@modal', "Enter the vendor name, address, GST number, contact person, mobile and payment terms. SalonOS checks the GSTIN and mobile number format for you.",
   "Vendor का नाम, address, GST number, contact person, mobile और payment terms डालें। SalonOS GSTIN और mobile number का format check करता है।"),
  ('Bank Details', "Add bank details so payments can go through Bank Payment, and tick TDS if tax is to be deducted, with the section and rate.",
   "Bank details डालें ताकि Bank Payment से payment जा सके, और अगर TDS कटना है तो section और rate के साथ tick करें।"),
 ]),
 dict(id='invoices', lines=[
  ('INVOICE NO', "Invoices and Payments lists every bill with its document type, vendor, dates, amount, paid and balance.",
   "Invoices & Payments में हर bill उसके document type, vendor, तारीखों, amount, paid और balance के साथ है।"),
  ('Search vendor or invoice no…', "Search by vendor or invoice number, or filter one vendor.", "Vendor या invoice number से search करें, या एक vendor filter करें।"),
  ('$thead input[type=checkbox]', "Tick bills to mark them paid in full together, or delete the selected ones.",
   "कई bills tick करके एक साथ Mark Paid in Full करें, या selected bills delete करें।"),
 ]),
 dict(id='add-inv', opt={'do': [['click', '+ Add Invoice', 900]]}, lines=[
  ('@modal', "Add Invoice first asks for the bill itself. Drop the PDF, Word file or photo — SalonOS reads the GSTIN, invoice number, date and amount and matches the vendor.",
   "Add Invoice पहले bill माँगता है। PDF, Word file या photo डालें — SalonOS GSTIN, invoice number, तारीख और amount पढ़कर vendor मिलाता है।"),
  ('Skip — enter manually', "Or skip and type it in. The bill is read in your browser — nothing is uploaded anywhere.",
   "या skip करके खुद type करें। Bill आपके browser में ही पढ़ा जाता है — कहीं upload नहीं होता।"),
 ]),
 dict(id='inv-form', opt={'do': [['click', '+ Add Invoice', 900], ['click', 'Skip — enter manually', 900]]}, lines=[
  ('Vendor *', "Choose the vendor, or add a new one right here, then the document type — Tax Invoice, Invoice or Performa Invoice.",
   "Vendor चुनें, या यहीं नया vendor जोड़ें, फिर document type — Tax Invoice, Invoice या Performa Invoice।"),
  ('Category *', "The category decides the P&L line. Choose Fixed Assets for equipment — you then list each asset on the bill.",
   "Category तय करती है कि P&L की कौन-सी line बनेगी। Equipment के लिए Fixed Assets चुनें — फिर bill के हर asset की list दें।"),
  ('Invoice Date *', "Enter the invoice date, booking date and due date. The booking date decides the month the expense is booked in.",
   "Invoice date, booking date और due date डालें। Booking date तय करती है कि खर्च किस महीने में book होगा।"),
  ('IGST (₹)', "Enter the taxable value and GST; the invoice total is calculated.", "Taxable value और GST डालें; invoice total अपने-आप बनता है।"),
 ]),
 dict(id='inv-form2', opt={'do': [['click', '+ Add Invoice', 900], ['click', 'Skip — enter manually', 900], ['scroll', 'Bill covers more than one month', 'center']]}, lines=[
  ('Bill covers more than one month', "If one bill covers several months, tick this box and choose the months. The amount is split equally in the P&L, with an optional different first month.",
   "अगर एक bill कई महीनों का है, यह box tick करें और महीने चुनें। Amount P&L में बराबर बँटता है, चाहें तो पहले महीने की amount अलग रखें।"),
  ('Attach Invoice / Voucher Copy', "Attach the bill copy. Some outlets make the attachment compulsory.",
   "Bill की copy attach करें। कुछ outlets में attachment ज़रूरी होता है।"),
 ]),
 dict(id='payments', opt={'do': [mark_row('LOR/26/4471', 'r1')]}, lines=[
  (D('r1'), "Open a bill to record payments — amount, date, mode such as NEFT, RTGS, UPI or cheque, and the reference.",
   "Payment दर्ज करने के लिए bill खोलें — amount, तारीख, mode जैसे NEFT, RTGS, UPI या cheque, और reference।"),
  (None, "Cash payments made from Daily Sales and Expenses appear here automatically. A bill above the outlet's approval limit must be approved by a Super Admin before it can be paid.",
   "Daily Sales & Expenses से cash में दिए payments यहाँ अपने-आप आते हैं। Outlet की approval limit से ऊपर का bill pay होने से पहले Super Admin approve करता है।"),
 ]),
 dict(id='outstanding', opt={'do': [['click', '⏳ Outstanding Invoices', 700]]}, lines=[
  ('⏳ Outstanding Invoices', "Outstanding Invoices shows only unpaid bills, with the overdue amount highlighted.",
   "Outstanding Invoices में सिर्फ unpaid bills हैं, overdue amount highlight के साथ।"),
 ]),
 dict(id='pi', opt={'do': [['click', '📝 Performa Invoice', 700]]}, lines=[
  ('📝 Performa Invoice', "Performa Invoice tracks proforma or advance bills. When the tax invoice arrives, book it against the PI and the PI shows as settled.",
   "Performa Invoice, proforma या advance bills track करता है। Tax invoice आने पर उसे PI के against book करें, PI settled दिखेगा।"),
 ]),
 dict(id='dash', opt={'do': [['click', '📊 Dashboard', 700]]}, lines=[
  ('📊 Dashboard', "The Dashboard shows top vendors by outstanding balance, payments over six months, vendors by category and the invoice status breakdown.",
   "Dashboard में outstanding के हिसाब से top vendors, छह महीने के payments, category-wise vendors और invoice status है।"),
 ]),
 dict(id='bulk', lines=[
  ('📥 Bulk Import Invoices', "To load many bills, download the Import Template, fill it and use Bulk Import. WhatsApp bills imports bills sent to your WhatsApp number.",
   "कई bills एक साथ डालने के लिए Import Template download करें, भरें और Bulk Import करें। WhatsApp bills, आपके WhatsApp number पर भेजे bills import करता है।"),
 ]),
]

MODS['due-dates'] = [
 dict(id='top', lines=[
  ('Due Date Tracker', "Due Dates is the compliance and payment calendar of the outlet.", "Due Dates outlet का compliance और payment calendar है।"),
  ('Total Items', "Cards show total items, overdue, due soon and completed.", "Cards में total items, overdue, due soon और completed हैं।"),
 ]),
 dict(id='auto', lines=[
  ('Salary Disbursement', "Items marked AUTO are created by SalonOS from Salary Working and the Vendor Sheet — salary disbursement, PF and ESIC challans, TDS and vendor payments.",
   "AUTO वाले items SalonOS खुद Salary Working और Vendor Sheet से बनाता है — salary disbursement, PF और ESIC challan, TDS और vendor payments।"),
  ('Overdue', "Filter all, overdue, due soon, completed or upcoming. Overdue items are red.", "All, overdue, due soon, completed या upcoming filter करें। Overdue items लाल होते हैं।"),
 ]),
 dict(id='paid', opt={'do': [['click', '✓ Mark Paid', 900]]}, lines=[
  ('@modal', "Mark Paid asks for the payment date and the UTR reference. Link it with the matching bank statement debit and SalonOS fills these in.",
   "Mark Paid payment date और UTR reference माँगता है। Bank statement की matching debit से link करें, SalonOS ये भर देता है।"),
  (None, "For salary, untick any employee not yet paid — their payment status in Salary Working changes too.",
   "Salary में जिस employee को अभी pay नहीं हुआ, उसे untick करें — उसका payment status Salary Working में भी बदल जाता है।"),
 ]),
 dict(id='add', opt={'do': [['click', '+ Add Due Date', 800]]}, lines=[
  ('@modal', "Add Due Date adds your own item — GST filing, PT payment, maintenance or anything else — with the amount and due date.",
   "Add Due Date से अपना item जोड़ें — GST filing, PT payment, maintenance या कुछ भी — amount और due date के साथ।"),
 ]),
 dict(id='export', lines=[
  ('⬇ Export Excel', "Export Excel downloads the list, and Bank Statement jumps straight to the bank lines.", "Export Excel list download करता है, और Bank Statement सीधे bank lines पर ले जाता है।"),
  ('↩ Unmark Paid', "If something was marked paid by mistake, Unmark Paid reverses it.", "अगर गलती से paid mark हो गया, तो Unmark Paid उसे वापस करता है।"),
 ]),
]

MODS['recurring-expenses'] = [
 dict(id='top', lines=[
  ('Recurring Expenses', "Recurring Expenses holds every standing bill — rent, electricity, telephone, royalty, software and more.",
   "Recurring Expenses में हर standing bill है — rent, बिजली, telephone, royalty, software वगैरह।"),
  ('Monthly Commitment', "Cards show active items, the monthly and annual commitment, and what is due within seven days.",
   "Cards में active items, monthly और annual commitment, और सात दिन में due चीज़ें दिखती हैं।"),
  ('🔄 Sync to Vendor List', "Every payee is kept in the Vendor List automatically. Sync fixes anything out of step.",
   "हर payee अपने-आप Vendor List में रहता है। Sync कोई भी गड़बड़ ठीक करता है।"),
 ]),
 dict(id='table', opt={'do': [mark_row('Shop Rent', 'rent')]}, lines=[
  (D('rent'), "Each row shows the expense type, payee, frequency, amount, GST, TDS, payable amount and the monthly equivalent.",
   "हर row में expense type, payee, frequency, amount, GST, TDS, payable amount और monthly equivalent है।"),
  (None, "A fixed item creates its bill in the Vendor Sheet automatically every period.", "Fixed item हर period Vendor Sheet में अपना bill अपने-आप बनाता है।"),
 ]),
 dict(id='add', opt={'do': [['click', '+ Add Recurring Expense', 900]]}, lines=[
  ('@modal', "Add Recurring Expense: choose the expense type, the payee, the frequency — monthly, bi-monthly, quarterly, half-yearly or yearly — the due day and start date.",
   "Add Recurring Expense: expense type, payee, frequency — monthly, bi-monthly, quarterly, half-yearly या yearly — due day और start date चुनें।"),
  ('Fixed — same every period', "Choose Fixed if the amount is the same every time, or Variable if a new bill comes every period.",
   "अगर amount हर बार same है तो Fixed चुनें, या हर period नया bill आता है तो Variable।"),
 ]),
 dict(id='variable', opt={'do': [['click', '+ Add Recurring Expense', 900], ['click', 'Variable — actual bill each period', 500]]}, lines=[
  ('Variable — actual bill each period', "For a variable bill, choose prepaid — billed in advance — or postpaid, and how many months each bill covers.",
   "Variable bill के लिए prepaid — advance में bill — या postpaid चुनें, और हर bill कितने महीनों का है।"),
  ('Months covered by each bill:', "Each bill is then split equally over the months it covers.", "फिर हर bill उन महीनों में बराबर बँट जाता है।"),
  (None, "GST, reverse charge and TDS are set in the details section, along with the agreement, rent increments and payment links.",
   "GST, reverse charge और TDS details section में set होते हैं, साथ में agreement, rent increments और payment links।"),
 ]),
 dict(id='pending', lines=[
  ('pending — enter the invoice:', "When a variable bill is due, a pending banner appears. Click it, or Enter bill on the row.",
   "Variable bill due होने पर pending banner दिखता है। उस पर, या row के Enter bill पर क्लिक करें।"),
  ('➕ Enter bill', "Enter the bill number, date, amount and the months it covers. Read bill fills these from a photo or PDF of the bill.",
   "Bill number, तारीख, amount और कितने महीनों का है, डालें। Read bill इन्हें bill की photo या PDF से भर देता है।"),
 ]),
 dict(id='accrual', lines=[
  (None, "Until a bill arrives, the P&L carries an estimate based on the previous bill. You can edit the estimate.",
   "Bill आने तक P&L में पिछले bill के आधार पर estimate रहता है। Estimate edit किया जा सकता है।"),
  (None, "When the actual bill comes, the difference against what was already claimed is adjusted in that month.",
   "असली bill आने पर, पहले claim की गई amount से difference उसी महीने में adjust होता है।"),
  ('📒 Register', "The Register shows it month by month: previous bill, estimate, actual bill, amount already claimed, adjustment and net expense. Bills and estimates can be edited or deleted there.",
   "Register सब कुछ महीने-दर-महीने दिखाता है: पिछला bill, estimate, असली bill, पहले claim की amount, adjustment और net expense। वहाँ bills और estimates edit या delete हो सकते हैं।"),
 ]),
 dict(id='payonline', lines=[
  ('💳', "For electricity and telephone, save the consumer number and payment link. Pay online copies the number and opens the payment site.",
   "बिजली और telephone के लिए consumer number और payment link सेव करें। Pay online number copy करके payment site खोलता है।"),
  ('Edit', "Edit or delete any item from its row, or tick rows to mark them active or inactive.", "Row से कोई भी item edit या delete करें, या rows tick करके active या inactive करें।"),
 ]),
]

MODS['fixed-assets'] = [
 dict(id='top', lines=[
  ('Fixed Assets', "Fixed Assets has two parts — the Assets register and Depreciation.", "Fixed Assets के दो हिस्से हैं — Assets register और Depreciation।"),
  ('Total Assets Booked', "The register fills itself from the Vendor Sheet: every bill booked with the category Fixed Assets appears here.",
   "Register Vendor Sheet से अपने-आप भरता है: Fixed Assets category वाला हर bill यहाँ दिखता है।"),
  ('Hydraulic styling chairs (4)', "Each asset line shows the vendor, invoice, booking date, value, amount paid, balance and payment status.",
   "हर asset line में vendor, invoice, booking date, value, paid amount, balance और payment status है।"),
  ('🔗 Vendors', "The Vendors link opens the bill itself. Export Excel downloads the register.",
   "Vendors link से bill खुलता है। Export Excel register download करता है।"),
 ]),
 dict(id='dep', opt={'do': [['click', 'Depreciation', 900]]}, lines=[
  ('Depreciation — Fixed Asset Register', "Depreciation calculates the yearly depreciation. The method comes from the outlet's firm category — Companies Act or Income Tax blocks.",
   "Depreciation साल का depreciation निकालता है। Method outlet की firm category से आता है — Companies Act या Income Tax blocks।"),
  ('Needs Block Assignment', "New asset bills from the Vendor Sheet wait here until you assign them a block or category.",
   "Vendor Sheet से आए नए asset bills यहाँ तब तक रहते हैं जब तक आप उन्हें block या category assign न करें।"),
  ('Asset-wise', "View the schedule asset-wise or block-wise, and month-wise, for the financial year chosen.",
   "चुने गए financial year के लिए schedule asset-wise या block-wise, और month-wise देखें।"),
  (None, "Add opening assets you already owned at their current value, record a disposal when an asset is sold, and depreciation flows into the P&L.",
   "पहले से मौजूद assets उनकी current value पर opening asset के रूप में जोड़ें, बेचने पर disposal दर्ज करें, और depreciation P&L में जाता है।"),
 ]),
]
