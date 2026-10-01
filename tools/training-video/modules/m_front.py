from modules._h import *
MODS = {}

MODS['appointments'] = [
 dict(id='top', lines=[
  ('Appointment Book', "The Appointment Book runs the day at the front desk. Each stylist is a column and each booking is a card at its time.",
   "Appointment Book front desk पर दिन चलाता है। हर stylist एक column है और हर booking अपने समय पर एक card है।"),
  ('Today', "Move to the previous or next day with the arrows, or jump back to Today. Filter one stylist from the list.",
   "Arrows से पिछले या अगले दिन जाएँ, या Today पर लौटें। List से किसी एक stylist को filter करें।"),
 ]),
 dict(id='cards', lines=[
  ('APPOINTMENTS', "The cards show today's appointments and how many were booked online, chair occupancy, expected revenue, and no-shows to follow up.",
   "Cards में आज के appointments और online bookings, chair occupancy, expected revenue, और follow up करने वाले no-shows हैं।"),
  ('CHAIR OCCUPANCY', "Chair occupancy is the share of stylist time that is booked — a quick measure of how busy the day is.",
   "Chair occupancy stylists के समय का booked हिस्सा है — दिन कितना busy है, इसका तुरंत अंदाज़ा।"),
 ]),
 dict(id='new', opt={'do': [['click', '+ New appointment', 900]]}, lines=[
  ('@modal', "To book, click an empty slot or New appointment. Enter the guest name and mobile, the service, the stylist and the start time.",
   "Booking के लिए खाली slot या New appointment पर क्लिक करें। Guest का नाम और mobile, service, stylist और start time डालें।"),
  ('Booked via', "Record how it was booked — phone, walk-in, WhatsApp or online. SalonOS shows how long the service takes and when it finishes, and won't let it run past closing.",
   "Booking कैसे हुई दर्ज करें — phone, walk-in, WhatsApp या online। SalonOS दिखाता है service कितनी देर की है और कब खत्म होगी, और closing के बाद तक नहीं जाने देता।"),
  ('Book appointment', "Click Book appointment.", "Book appointment दबाएँ।"),
 ]),
 dict(id='status', lines=[
  ('$.fd-appt, [class*=appt]', "Click a card to change its status: booked, confirmed, in chair, done, no-show or cancelled.",
   "Status बदलने के लिए card पर क्लिक करें: booked, confirmed, in chair, done, no-show या cancelled।"),
  (None, "When a guest is done, push the bill from the Billing tab.", "Guest का काम पूरा होने पर Billing tab से bill बनाएँ।"),
 ]),
 dict(id='wa', lines=[
  ('Send WhatsApp reminders', "Send WhatsApp reminders queues a reminder to every guest still pending today.", "Send WhatsApp reminders आज के हर pending guest को reminder भेजता है।"),
  (None, "Good habits: confirm tomorrow's bookings every evening, mark no-shows honestly, and follow them up — the no-show card tells you who.",
   "अच्छी आदतें: हर शाम कल की bookings confirm करें, no-shows सही mark करें, और उन्हें follow up करें — no-show card बताता है किसे।"),
 ]),
]

MODS['billing'] = [
 dict(id='top', lines=[
  ('Billing — Glow Sector 21', "Billing is the point of sale for the outlet. GST is applied at eighteen percent — nine percent CGST and nine percent SGST.",
   "Billing outlet का point of sale है। GST अठारह percent लगता है — नौ percent CGST और नौ percent SGST।"),
  ("TODAY'S COLLECTION", "Cards show today's collection, this month, the total invoices and pending dues.", "Cards में आज का collection, इस महीने का, कुल invoices और pending dues हैं।"),
 ]),
 dict(id='new', opt={'do': [['click', '+ New Bill', 900]]}, lines=[
  ('@modal', "New Bill: enter the customer name and phone, and the payment mode — cash, card, UPI or split.",
   "New Bill: customer का नाम और phone, और payment mode — cash, card, UPI या split — डालें।"),
  ('Add Service / Product', "Add services and products. Each line has quantity and rate; the subtotal, discount, taxable value, GST and grand total are calculated.",
   "Services और products जोड़ें। हर line में quantity और rate है; subtotal, discount, taxable value, GST और grand total अपने-आप बनते हैं।"),
  ('✓ Create Invoice', "Choose who billed it, then Create Invoice.", "किसने bill किया चुनें, फिर Create Invoice।"),
 ]),
 dict(id='example', opt={'do': [['click', '+ New Bill', 900]]}, lines=[
  (None, "Example: a women's haircut at eight hundred and a hair spa at fifteen hundred makes twenty-three hundred. GST of four hundred and fourteen brings the bill to two thousand seven hundred and fourteen.",
   "Example: women's haircut आठ सौ और hair spa पंद्रह सौ — कुल तेईस सौ। चार सौ चौदह GST के साथ bill दो हज़ार सात सौ चौदह का।"),
 ]),
 dict(id='list', lines=[
  ('INV-1520', "The list shows invoice number, date, customer, items, billed by, mode, status and amount.",
   "List में invoice number, तारीख, customer, items, billed by, mode, status और amount हैं।"),
  ('View', "View, print as an A4 invoice, edit or delete any bill. An unpaid bill shows payment due on the print.",
   "कोई भी bill view, A4 invoice में print, edit या delete करें। Unpaid bill की print पर payment due लिखा आता है।"),
 ]),
 dict(id='filters', lines=[
  ('Search invoice #, customer, phone…', "Search by invoice number, customer or phone, and filter by payment mode or status. Export PDF downloads the list.",
   "Invoice number, customer या phone से search करें, और payment mode या status से filter करें। Export PDF list download करता है।"),
  ('PENDING DUES', "Keep pending dues low: follow up unpaid bills the same week.", "Pending dues कम रखें: unpaid bills का उसी हफ्ते follow up करें।"),
 ]),
]

MODS['clients'] = [
 dict(id='top', lines=[
  ('Clients', "Clients is your client book: who they are, what they spend, and who has stopped coming back.",
   "Clients आपकी client book है: वो कौन हैं, कितना खर्च करते हैं, और कौन आना बंद कर चुका है।"),
  ('CLIENTS ON FILE', "Cards show clients on file and on membership, active clients in the last ninety days, lapsed clients worth a win-back, and the repeat rate with the average ticket.",
   "Cards में कुल clients और membership वाले, पिछले नब्बे दिनों के active clients, win-back लायक lapsed clients, और repeat rate व average ticket है।"),
 ]),
 dict(id='segments', lines=[
  ('VIP', "Segments: VIP for twelve or more visits, regular for four or more, new, and lapsed for anyone not seen in ninety days.",
   "Segments: बारह या ज़्यादा visits पर VIP, चार या ज़्यादा पर regular, new, और नब्बे दिनों से न आए clients lapsed।"),
  ('Search by name or mobile…', "Search by name or mobile number.", "नाम या mobile number से search करें।"),
 ]),
 dict(id='profile', opt={'do': [['click', 'Anjali', 700]]}, lines=[
  ('Lifetime spend', "Click a client to open their profile — lifetime spend, visits, average ticket, last visit, usual service, preferred stylist, membership, birthday and notes.",
   "Client पर क्लिक करके profile खोलें — lifetime spend, visits, average ticket, last visit, usual service, पसंदीदा stylist, membership, birthday और notes।"),
  ('Book appointment', "Book appointment takes you to the Appointment Book for them.", "Book appointment उनके लिए Appointment Book पर ले जाता है।"),
 ]),
 dict(id='wa', opt={'do': [['click', 'Anjali', 700]]}, lines=[
  ('WhatsApp', "WhatsApp prepares a message — win-back, reminder, birthday or membership offer. Copy it and paste it into WhatsApp.",
   "WhatsApp एक message तैयार करता है — win-back, reminder, birthday या membership offer। Copy करके WhatsApp में paste करें।"),
  (None, "Tip: each week, message lapsed clients with a small offer, and wish every client on their birthday.",
   "Tip: हर हफ्ते lapsed clients को एक छोटा offer भेजें, और हर client को birthday पर wish करें।"),
 ]),
]

MODS['inventory'] = [
 dict(id='top', lines=[
  ('Inventory', "Inventory tracks backbar consumption and retail stock, and tells you what to reorder.",
   "Inventory backbar की खपत और retail stock track करता है, और बताता है क्या मँगवाना है।"),
  ('STOCK VALUE', "Cards show the stock value, items below reorder level with the cost to restock, slow movers, and retail items.",
   "Cards में stock value, reorder level से नीचे के items और उन्हें भरने की लागत, slow movers, और retail items हैं।"),
 ]),
 dict(id='table', opt={'do': [['scroll', 'Reorder at', 'center']]}, lines=[
  ('Reorder', "Each item shows category, quantity on hand, reorder level, rate, stock value and units moved this month. Items at or below reorder level are flagged Reorder.",
   "हर item में category, on hand quantity, reorder level, rate, stock value और इस महीने इस्तेमाल हुई units हैं। Reorder level पर या नीचे वाले items पर Reorder flag लगता है।"),
  ('Issue 1', "Issue 1 records one unit taken to the backbar. Receive adds stock with the quantity and landed cost.",
   "Issue 1 backbar में ली गई एक unit दर्ज करता है। Receive quantity और landed cost के साथ stock जोड़ता है।"),
 ]),
 dict(id='po', lines=[
  ('Low stock only', "Low stock only shows just what needs ordering. Search finds any item.", "Low stock only सिर्फ मँगवाने वाले items दिखाता है। Search से कोई भी item ढूँढें।"),
  ('Draft purchase order', "Draft purchase order prepares an order for everything below reorder level.", "Draft purchase order reorder level से नीचे की हर चीज़ का order तैयार करता है।"),
  (None, "Example: L'Oréal Majirel shade five point three has three tubes against a reorder level of ten, so it is flagged and included in the order.",
   "Example: L'Oréal Majirel shade 5.3 की तीन tubes हैं जबकि reorder level दस है, इसलिए flag होकर order में शामिल होती है।"),
 ]),
]
