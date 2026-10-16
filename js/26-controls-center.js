// ═══════════════════════════════════════════════════════════════════════════════════════════
// Controls centre (Master Settings → 🎛 Controls) — every check and approval rule in one place,
// switched on or off for all outlets, with an outlet-wise override (On / Off / same as all).
//   controlOn(id, outletId)      → is this rule active for the outlet
//   controlLimit(id)             → the ₹ limit of a rule that has one
//   requireApproval({...})       → approval rules: true when the action may go ahead now
// Stored in one shared record (salonos_controls) so every user and device follows the same rules.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const CONTROL_DEFS=[
  {id:'billNeedsPo',group:'Entry checks',label:'A vendor bill above the limit needs an approved purchase order',hint:'Vendors: saving such a bill asks which approved PO of that vendor it is against (a bill more than 10% above the PO is confirmed).',def:false,limit:25000},
  {id:'dupInvoice',group:'Entry checks',label:'Block a vendor invoice number entered twice',hint:'Same vendor + same invoice no. (Vendors, Daily Sales & Exp, Bank Statement).',def:true},
  {id:'gstLock',group:'Entry checks',label:'Lock CGST/SGST or IGST by state',hint:'Outlet and vendor in the same state → only CGST + SGST; different states → only IGST.',def:true},
  {id:'idChecks',group:'Entry checks',label:'Check PAN, GSTN, IFSC, Aadhaar, UAN, ESIC, account no., phone & email',hint:'Wrong formats are stopped before saving employees and vendors.',def:true},
  {id:'bankAutoMapImport',group:'Bank mapping',label:'Map “sure” lines automatically when a bank statement is imported',hint:'Card settlements with the sale date, exact bill / salary matches and your rules are applied on import (each can be undone from the mapping pop-up); likely and guessed lines stay for review.',def:false},
  {id:'bankAutoRules',group:'Bank mapping',label:'Apply remembered mapping rules to new bank statement imports',hint:'Rules saved in the mapping pop-up (“Always map lines like … as …”) set the Nature on import; off = they are only suggested.',def:true},
  {id:'bankDupWarning',group:'Bank mapping',label:'Warn about possible duplicate bank lines while mapping',hint:'Same amount and payee (or reference) within 3 days — flagged, left out of Accept all, and confirmed before linking or paying.',def:true},
  {id:'mapApproval',group:'Bank mapping',label:'Mapping or changing a linked bank line above the limit needs Super Admin approval',hint:'In the mapping pop-up and in Bank Statement (changing the Nature, vendor or Cradlee date of a linked line, or unlinking it). Anyone else gets a request; bulk actions skip those lines.',def:false,limit:100000},
  {id:'mapReview',group:'Bank mapping',label:'Second-person review of mapped bank lines before Month Final',hint:'Each mapped bank line must be ticked “Checked” in the mapping pop-up (🔍 Review) by someone other than the person who mapped it; the month can be marked Final only when every line is checked.',def:false},
  {id:'bankExceptions',group:'Bank mapping',label:'Show the Exceptions list of unusual bank mappings',hint:'Mapping pop-up → ⚠ Exceptions: a vendor paid the same amount twice in a month, a payment far above the vendor’s usual, salary / advance to someone not on the rolls.',def:true},
  {id:'bankLockFinal',group:'Bank mapping',label:'Lock mapped bank lines once the month is Final',hint:'After P&L / Month Final (month locked) the Nature, vendor, Cradlee date and links of mapped lines cannot be changed or undone — a Super Admin can unlock with a reason (Audit Log).',def:false},
  {id:'bankAgeingBoard',group:'Bank mapping',label:'Show unmapped-line ageing and mapping productivity on the owner dashboard',hint:'Dashboard → 🏦 Bank Reco: unmapped bank lines by age (0–7, 8–30, over 30 days) per outlet, and lines mapped / suggestions accepted / lines checked per person.',def:true},
  {id:'billReverseMatch',group:'Bank mapping',label:'Vendors: find the bank payment that already paid an unpaid bill',hint:'Vendors shows unpaid bills whose exact balance was paid from the bank to that vendor (and not yet linked) — link each with one click.',def:true},
  {id:'bankReversalPairs',group:'Bank mapping',label:'Suggest pairing a reversal / refund credit with the debit it reverses',hint:'Same amount within 15 days, with a reversal word or the same payee — both lines are mapped as Refund so they cancel out (not in the P&L).',def:true},
  {id:'mdrCheck',group:'Bank mapping',label:'Flag card / UPI settlements whose charges are above your agreed rate',hint:'Exceptions list: the Cradlee sale total of the day less the settlement credit, as a % of sales, above the rate below. Needs the Exceptions list on.',def:false,limit:2,limitLabel:'Max charges %'},
  {id:'bankGstinCheck',group:'Bank mapping',label:'Flag payments for GST bills whose vendor GSTIN is missing or invalid',hint:'Exceptions list: a bank payment linked to a bill with GST, where the vendor has no valid GSTIN — the input credit would be at risk in Tally. Needs the Exceptions list on.',def:true},
  {id:'ruleAutoPause',group:'Bank mapping',label:'Stop auto-applying a rule that is often changed by hand',hint:'A rule changed 3 or more times and on over 30% of its lines is only suggested (“likely”), not applied on import or by Accept all.',def:true},
  {id:'crossOutletMap',group:'Bank mapping',label:'Offer to map the same narration in your other outlets',hint:'After you set a Nature in the mapping pop-up, unmapped look-alike lines in the other outlets you can see are offered for mapping in one click.',def:true},
  {id:'bankRecurringWatch',group:'Bank mapping',label:'Watch recurring payments and show the ones not seen this month',hint:'Mapping pop-up → 📅 Expected: payments made in at least 3 of the last 4 months with a steady amount (rent, electricity, EMIs, software) that have not appeared this month.',def:true},
  {id:'vagueNatureReason',group:'Bank mapping',label:'A reason is needed to map a large line as Other or Transfer',hint:'Above the limit, mapping a bank line as Other or Transfer asks “what is this payment?” — the note is kept with the line (bulk actions skip such lines).',def:false,limit:10000},
  {id:'mapRoleLimits',group:'Bank mapping',label:'Only Super Admin, Owner or Accountant can map salary, incentive and advance lines',hint:'Others can map every other Nature; salary / incentive / advance mapping, 👤 Pay and 💵 Advance are refused for them (mapping pop-up and Bank Statement).',def:false},
  {id:'tallyChangeGuard',group:'Bank mapping',label:'Changes after Tally: a bank line already sent to Tally can be changed only by a Super Admin',hint:'Others are stopped; a Super Admin is reminded to send it again (the line shows “Changed since sent”). Covers Nature, vendor, Cradlee date, links and undo.',def:false},
  {id:'bankUnmappedNudge',group:'Bank mapping',label:'WhatsApp nudge to the outlet for old unmapped bank lines',hint:'Dashboard → 🏦 Bank Reco shows 📲 Nudge for outlets with lines unmapped longer than the days below — it opens WhatsApp to the outlet phone with the count, amount and oldest date.',def:false,limit:7,limitLabel:'Older than (days)'},
  {id:'bankBalanceCheck',group:'Bank mapping',label:'Check the running balance of the bank statement',hint:'Opening balance + credits − debits must equal each line’s closing balance; a break means a missing or duplicated line — shown in Bank Statement and the ✅ Close tab.',def:true},
  {id:'statutoryBankCheck',group:'Bank mapping',label:'Check PF, ESIC, PT and TDS bank payments against the amounts due',hint:'✅ Close tab: last month’s dues (from Salary Working and vendor TDS) against bank lines mapped as PF / ESIC / PT Payment / TDS — not paid, short or late.',def:true},
  {id:'bankLearnPayees',group:'Bank mapping',label:'Learn employees and vendors from their account number / UPI ID',hint:'After a line is settled to one employee or linked to a vendor’s bills, the account number or UPI ID in the narration is remembered and used to match later lines.',def:true},
  {id:'vendorBankFromPayments',group:'Bank mapping',label:'Offer to save vendor bank details found in payments',hint:'An account number seen in two or more payments to a vendor (or a UPI ID / IFSC) is offered for saving on the vendor — 📊 Payees and ✅ Close tabs.',def:true},
  {id:'tallyNeedsReview',group:'Bank mapping',label:'Maker-checker: bank lines go to Tally only after they are checked',hint:'Lines not ticked “Checked” in 🔍 Review are held back from Send to Tally and Tally sync.',def:false},
  {id:'bankBigChangeAlert',group:'Bank mapping',label:'Alert the owner when a checked or Final bank line above the limit is changed',hint:'Changing, unlinking or undoing such a line is listed on Dashboard → 🏦 Bank Reco (and in the Audit Log) until a Super Admin marks it seen.',def:false,limit:50000},
  {id:'newPayeeAlert',group:'Bank mapping',label:'Flag the first payment to a new payee above the limit',hint:'Exceptions list: a debit whose payee (narration pattern, account or UPI ID) never appeared before. Needs the Exceptions list on.',def:false,limit:25000},
  {id:'roundOddFlags',group:'Bank mapping',label:'Flag large round-amount transfers and Sunday payments',hint:'Exceptions list: round amounts (multiples of ₹5,000 from the limit) mapped as Other / Transfer / Advance or not linked, and payments dated on a Sunday. Needs the Exceptions list on.',def:false,limit:20000,limitLabel:'Round amounts from ₹'},
  {id:'bankOnePagerReminder',group:'Bank mapping',label:'Remind to send the owner the monthly bank one-pager',hint:'From the 3rd of each month Dashboard → 🏦 Bank Reco reminds until last month’s one-pager is printed or shared.',def:false},
  {id:'cashForecastAlert',group:'Bank mapping',label:'Warn when the 30-day bank balance forecast goes below the limit',hint:'Forecast from the last closing balance, average daily settlements, regular payments and unpaid bills by due date — Dashboard → 🏦 Bank Reco.',def:false,limit:50000,limitLabel:'Warn below ₹'},
  {id:'bankMapTour',group:'Bank mapping',label:'Show the short guided tour the first time someone opens the mapping pop-up',hint:'Five steps: suggestions, mapping a line, review & exceptions, month close, the ⋯ More menu. Anyone can replay it from ⋯ More.',def:true},
  {id:'bankConflictWarn',group:'Bank mapping',label:'Warn when someone else has just mapped the same line on another device',hint:'Before a mapping is saved, the line is re-read; if another person mapped it meanwhile, you are asked before replacing their mapping.',def:true},
  {id:'billComboMatch',group:'Bank mapping',label:'Suggest one payment for several bills (and two payments for one bill)',hint:'A debit equal to 2–4 unpaid bills of the same vendor, or two debits within 15 days that together clear one bill, is suggested as “likely”.',def:true},
  {id:'aggregatorPayoutCheck',group:'Bank mapping',label:'Check aggregator payouts (Swiggy, Zomato …) against their payout reports',hint:'✅ Close tab: gross sales, commission, charges, TDS and the expected net payout from the payout reports against the settlements received in the bank.',def:true},
  {id:'loanEmiSplit',group:'Bank mapping',label:'Split loan EMIs into principal and interest',hint:'Loans entered in the mapping pop-up (⋯ More → 🏦 Loans) — a matching EMI debit is suggested as a split: interest on the outstanding principal, the rest principal.',def:true},
  {id:'pettyCashCheck',group:'Bank mapping',label:'Check cash withdrawals against the cash expenses entered',hint:'✅ Close tab: bank cash withdrawals (ATM / self cheque) of the month against the expenses in Daily Sales & Exp — the gap is cash not accounted for.',def:true},
  {id:'bankAuditorView',group:'Bank mapping',label:'Reviewers / CA can open the bank mapping read-only',hint:'Reports → Bank Mapping: review, exceptions, month close, payees and the certificate — nothing can be changed. Off = the tab is closed to them.',def:true},
  {id:'bankDailyDigest',group:'Bank mapping',label:'Bank lines in the 9 AM morning brief',hint:'Yesterday’s new bank lines and the lines still unmapped (over 7 days) per outlet, added to the morning brief email / WhatsApp. Needs the salonos-reports function redeployed.',def:false},
  {id:'ownTransferPairs',group:'Bank mapping',label:'Recognise transfers between your own accounts and group companies',hint:'Narrations naming your own company / outlets (or ⋯ More → 🏢 Own accounts) are suggested as Transfer; the matching line in your other outlet is mapped too.',def:true},
  {id:'newVendorFromNarration',group:'Bank mapping',label:'Offer to add an unknown payee as a vendor',hint:'A payee named in two or more NEFT / IMPS / UPI debits who is not a vendor yet is suggested as “+ New vendor” (name and IFSC taken from the narration).',def:true},
  {id:'bankChargeGst',group:'Bank mapping',label:'Separate the GST on bank charges (input credit)',hint:'GST lines on bank charges are suggested as “Bank Charges GST” (own Tally ledger); a charge “incl. GST” is split 100 : 18.',def:true},
  {id:'fdLines',group:'Bank mapping',label:'Recognise fixed deposits (booking, maturity, sweep) and FD interest',hint:'FD lines are suggested as Fixed Deposit (Tally: Fixed Deposits under Investments), FD interest as Interest.',def:true},
  {id:'mappingSla',group:'Bank mapping',label:'Mapping time target — lines mapped within the days below',hint:'On-time % per outlet on Dashboard → 🏦 Bank Reco and in the ✅ Close tab (a line mapped on import counts as on time).',def:false,limit:3,limitLabel:'Days to map'},
  {id:'clientFollowUps',group:'Clients & stock',label:'Client follow-ups in the Client CRM',hint:'📅 Follow-ups: repeat service due, birthdays this week, lapsed clients and memberships ending — each with a ready WhatsApp message.',def:true},
  {id:'membershipAtBilling',group:'Clients & stock',label:'Show membership and package balance when billing',hint:'Billing: the client found by phone, their membership and expiry, no-shows and package balance — with “pay from the package”.',def:true},
  {id:'noShowWarn',group:'Clients & stock',label:'Warn about past no-shows when booking',hint:'Appointment Book: the number of earlier no-shows on the phone number; 2 or more suggests asking for an advance.',def:true},
  {id:'smartReorder',group:'Clients & stock',label:'Reorder by days of stock left, not only the minimum',hint:'Inventory: items whose stock covers fewer days than the lead time below (from the last 60 days’ use) are added to the reorder list.',def:true,limit:7,limitLabel:'Lead time (days)'},
  {id:'paymentRun',group:'Approvals',label:'Payment run in Bank Payment → Vendor',hint:'Tick every bill due by a chosen date in one click; the bank file then pays them.',def:true},
  {id:'roleHomeScreens',group:'App',label:'Start each role on its own screen after signing in',hint:'Manager / ASM → outlet home, Data entry → Daily Sales, Accountant → Bank Statement, Owner / Reviewer → Owner Insights, Super Admin → Dashboard. Anyone can pin their own start page (📌 under their name).',def:true},
  {id:'appInstallPrompt',group:'App',label:'Offer to install SalonOS as an app',hint:'📲 Install button under the user name when the browser allows it (Chrome / Edge / Android); on iPhone a hint to Add to Home Screen.',def:true},
  {id:'phoneQuickAdd',group:'App',label:'＋ Quick add on phones',hint:'A ＋ in the bottom bar: add expense, mark attendance, new bill, vendor bill, record advance, map bank lines.',def:true},
  {id:'staffOffBlocking',group:'Front desk',label:'Block bookings on a stylist’s weekly off, absence or approved leave',hint:'Appointment Book greys those days out and refuses bookings for that stylist.',def:true},
  {id:'apptWaitlist',group:'Front desk',label:'Appointment waitlist',hint:'⏳ Waitlist in the Appointment Book; when a booking is cancelled or a no-show, the people waiting that day are pointed out.',def:true},
  {id:'billReducesStock',group:'Front desk',label:'Retail products sold on a bill come off stock',hint:'Matched to the stock item linked in the menu (or by name); logged as a sale.',def:true},
  {id:'autoIssueStdUsage',group:'Front desk',label:'Services on a bill issue their standard usage from stock',hint:'Inventory → Standard usage per service (e.g. colour: 1 tube) is issued automatically when billed — leave off if the back bar is issued by hand.',def:false},
  {id:'billingFeedsIncentive',group:'Front desk',label:'Send billed sales to Incentive Working',hint:'Billing → ↗ Sales to incentives fills each stylist’s service / product / membership sales for the month (used only where no staff work report is imported).',def:false},
  {id:'discountReason',group:'Front desk',label:'A reason is needed for a bill discount above the %',hint:'Billing asks for the reason before saving.',def:false,limit:10,limitLabel:'Discount above %'},
  {id:'discountApproval',group:'Front desk',label:'A bill discount above the % needs Super Admin approval',hint:'The person billing sends a request; the bill saves once approved.',def:false,limit:25,limitLabel:'Discount above %'},
  {id:'loyaltyPoints',group:'Front desk',label:'Loyalty points on client spend',hint:'Clients earn the % below of each bill as points (1 point = ₹1) and can redeem them on later bills.',def:false,limit:5,limitLabel:'Points % of spend'},
  {id:'lowRatingAlert',group:'Front desk',label:'Flag low client ratings (1–2 ★) in Billing',hint:'Ratings are recorded on the bill (View → Client rating); low ones are listed at the top of Billing until marked handled.',def:true},
  {id:'expiryAlerts',group:'Front desk',label:'Stock expiry alerts',hint:'Inventory: batches expiring within the days below (entered when receiving) are listed at the top.',def:true,limit:30,limitLabel:'Days before expiry'},
  {id:'billingFeedsDailySales',group:'Front desk',label:'Fill Daily Sales & Exp from Billing',hint:'Billing → 📅 Day-end → “Fill Daily Sales & Exp”: the day’s billed Cash / Card / UPI and tips go into Daily Sales (asks before replacing figures already entered; not for locked months).',def:false},
  {id:'creditLimit',group:'Front desk',label:'Credit limit per client for unpaid bills',hint:'An unpaid bill is refused when the client would owe more than the limit in all.',def:false,limit:5000},
  {id:'giftVouchers',group:'Front desk',label:'Gift vouchers',hint:'Billing → 🎁 Vouchers: sell a voucher (code, value, expiry); redeem it with the code in the bill form.',def:true},
  {id:'fyInvoiceSeries',group:'Front desk',label:'Bill numbers in a financial-year series (INV/2026-27/0001)',hint:'New bills restart at 0001 each April; credit notes use CN/2026-27/0001. Off = INV-0001 running number.',def:false},
  {id:'patchTestWarn',group:'Front desk',label:'Warn when a patch test is missing or old',hint:'Booking a service marked “patch test” in the menu warns when the client has no clear test within the days below.',def:true,limit:180,limitLabel:'Valid for (days)'},
  {id:'familySharing',group:'Front desk',label:'Family members share packages and memberships',hint:'Clients linked as family (client form → Family of) can use each other’s package balance and membership.',def:true},
  {id:'referralReward',group:'Front desk',label:'Referral reward when a referred client first pays',hint:'The referrer gets the amount below as package credit on the referred client’s first bill.',def:false,limit:200,limitLabel:'Reward ₹'},
  {id:'deviceBillSeries',group:'Front desk',label:'Each device numbers its own bills (INV-AB-0001)',hint:'Two devices billing at the same time (or one offline) never make the same bill number. Off = one running number, and the sync renames a clash.',def:true},
  {id:'billArchive',group:'Front desk',label:'Archive old bills to the cloud (Billing → 🗄 Archive)',hint:'Fully paid bills older than the months below move to the cloud archive by a Super Admin — they stay viewable, and devices stay fast and below their storage limit.',def:true,limit:3,limitLabel:'Keep months on device'},
  {id:'dayCloseLock',group:'Front desk',label:'Lock bills after the day is closed',hint:'Billing → 📅 Day-end → 🔒 Close day: bills of a closed day can then be edited, cancelled or refunded only by a Super Admin, with a reason (Audit Log).',def:false},
  {id:'cancelApproval',group:'Front desk',label:'Cancelling or refunding a bill above the limit needs Super Admin approval',hint:'A reason is always asked; above the limit the person sends a request instead.',def:false,limit:2000},
  {id:'staffChangeLock',group:'Front desk',label:'Only a Super Admin can change who did a service on a saved bill',hint:'Stops services being moved between stylists afterwards (changes are always kept in the bill’s edit history).',def:false},
  {id:'oldDuesAlert',group:'Front desk',label:'Flag client dues older than the days below',hint:'Shown at the top of Billing and on Dashboard → 🧾 Front desk.',def:true,limit:60,limitLabel:'Older than (days)'},
  {id:'maskClientPhones',group:'Front desk',label:'Hide client mobile numbers from junior staff',hint:'Only Super Admin, Owner, Salon Owner, Salon Manager, ASM and Accountant see full numbers in Clients and Billing.',def:false},
  {id:'requireMarketingConsent',group:'Front desk',label:'Campaigns go only to clients who agreed to offers',hint:'Client form → “Agreed to receive offers” (with date) — required under India’s data protection law for marketing messages.',def:false},
  {id:'waApiSend',group:'Front desk',label:'Send reminders and campaigns through the WhatsApp Business API',hint:'“Send all” buttons in Reminders and Campaigns use approved templates (names in Billing → ⚙ Menu & settings). Needs the whatsapp function redeployed.',def:false},
  {id:'productSuggestions',group:'Front desk',label:'Suggest products often bought with the services on a bill',hint:'From the outlet’s own past bills.',def:true},
  {id:'renewalOffer',group:'Front desk',label:'Membership renewal offer',hint:'Within 15 days of a membership ending, the bill form offers the % below off the renewal.',def:false,limit:10,limitLabel:'Renewal discount %'},
  {id:'bookingAdvance',group:'Front desk',label:'Take an advance with bookings',hint:'New appointment → “Advance taken”. It is adjusted in the bill, kept if the client does not come, or refunded on cancel. Above the ₹ limit (0 = never) the booking reminds you to ask for one.',def:true,limit:0,limitLabel:'Remind above ₹'},
  {id:'noShowFee',group:'Front desk',label:'No-show fee on the next bill',hint:'Marking a booking “No-show” (without an advance) adds the fee below to the client’s next bill; waiving it needs a Super Admin.',def:false,limit:200,limitLabel:'Fee ₹'},
  {id:'rebookPrompt',group:'Front desk',label:'Offer to book the next visit at checkout',hint:'After a bill, suggests a date from the service’s usual gap (set “rebook” days per service in ⚙ Menu).',def:true},
  {id:'lateArrival',group:'Front desk',label:'Flag late clients and suggest what to do',hint:'After the minutes below, the booking shows ⏰ and offers to shorten it, move it, or give it to a free stylist.',def:true,limit:15,limitLabel:'Late after (min)'},
  {id:'offPeakPricing',group:'Front desk',label:'Off-peak price',hint:'Bookings in the off-peak days / hours (⚙ Menu → Hours, GST) get the % below off services on the bill.',def:false,limit:15,limitLabel:'Off-peak discount %'},
  {id:'twoStaffServices',group:'Front desk',label:'Book an assistant with a service',hint:'New appointment → “+ assistant”: the second person is blocked for the same time.',def:true},
  {id:'combos',group:'Front desk',label:'Combos in the menu',hint:'A combo price is shared across its services, so each stylist’s sales and incentives stay right.',def:true},
  {id:'coupons',group:'Front desk',label:'Coupon codes',hint:'Billing → 🏷 Coupons: code, discount, minimum bill, expiry, total uses and one-per-client.',def:true},
  {id:'cashDrawer',group:'Front desk',label:'Cash drawer by shift',hint:'Open with a float, close with the counted cash — any shortage or excess is recorded against the shift.',def:false},
  {id:'pettyCash',group:'Front desk',label:'Petty cash from the counter',hint:'Billing → 🧾 Petty cash: small expenses with a bill photo, added to Daily Sales expenses.',def:true},
  {id:'offlineWarning',group:'Front desk',label:'Warn when offline or changes are waiting to sync',hint:'A banner on Billing and Appointments.',def:true},
  {id:'duplicateBillCheck',group:'Front desk',label:'Warn before a repeat bill',hint:'Same client and same items within the minutes below asks “make another one anyway?”.',def:false,limit:10,limitLabel:'Within (min)'},
  {id:'consultForm',group:'Clients & stock',label:'Consultation / allergy form',hint:'Asks for the signed form on a client’s first bill or booking, and again after the days below.',def:true,limit:365,limitLabel:'Renew after (days)'},
  {id:'colourFormula',group:'Clients & stock',label:'Colour formula card',hint:'Shade, developer and timing per visit — shown in the client and on colour bookings.',def:true},
  {id:'similarClientCheck',group:'Clients & stock',label:'Find look-alike client records',hint:'Clients → 🔍 Similar names: same name on different mobiles, with a merge.',def:true},
  {id:'visitGapWinback',group:'Clients & stock',label:'“Due back” by each client’s own visit gap',hint:'Clients → Due back: past the % below of their usual gap between visits (needs 3+ visits).',def:true,limit:150,limitLabel:'% of usual gap'},
  {id:'clientBalanceLink',group:'Clients & stock',label:'Send clients a balance link',hint:'A page with their package balance, points, memberships and upcoming bookings (a snapshot at the time of sending).',def:true},
  {id:'countVariance',group:'Clients & stock',label:'Show stock missing at counts',hint:'Inventory → Value & margin: value missing per item and month, repeated shortages flagged.',def:true},
  {id:'usageVsStandard',group:'Clients & stock',label:'Flag products used above the standard',hint:'Items used more than the % below above standard usage × services this month.',def:true,limit:20,limitLabel:'Above standard by %'},
  {id:'priceRiseAlert',group:'Clients & stock',label:'Confirm a supplier price rise',hint:'Receiving at a rate more than the % below above the last one asks to confirm and shows a cheaper supplier if listed.',def:true,limit:5,limitLabel:'Rise above %'},
  {id:'stockOutWarning',group:'Clients & stock',label:'Warn when a booked service lacks stock',hint:'Today’s and tomorrow’s bookings whose standard usage is not in stock.',def:true},
  {id:'fdRegisters',group:'Front desk',label:'Registers: date-wise, client-wise, client-wise membership',hint:'Billing → 📒 Registers (also in Clients), with Excel.',def:true},
  {id:'staffHours',group:'Front desk',label:'Working hours per staff member',hint:'Appointments → 🕘 Staff hours: start, end and a break per person — bookings outside them are refused.',def:true},
  {id:'apptChangeLog',group:'Front desk',label:'Keep a change log on bookings',hint:'Who booked, moved, changed status or handed over a booking, shown on the booking.',def:true},
  {id:'unconfirmedAlert',group:'Front desk',label:'List bookings not confirmed yet',hint:'Today’s “Booked” (not confirmed) appointments starting within the minutes below, with call / WhatsApp / ✓.',def:true,limit:120,limitLabel:'Starting within (min)'},
  {id:'addonSuggest',group:'Front desk',label:'Suggest add-on services while booking',hint:'From services the outlet’s clients usually take together.',def:true},
  {id:'busyHeatmap',group:'Front desk',label:'Busy-hours map',hint:'Appointments → 🔥 Busy hours: weekday × hour over the last 8 weeks.',def:true},
  {id:'bookingRequests',group:'Front desk',label:'Online booking requests into the app',hint:'The booking page sends requests to Appointments → 📥 Requests instead of only WhatsApp. Needs the “booking” function deployed; copy the booking link again after turning this on.',def:false},
  {id:'sessionPackages',group:'Front desk',label:'Session packages (e.g. 6 facials)',hint:'A package can carry a number of sessions of one service; the bill offers “Use 1 session”.',def:true},
  {id:'runningBills',group:'Front desk',label:'Running bills from the chair',hint:'“In chair” opens a running bill that stylists add to; reception closes it into the bill.',def:false},
  {id:'splitService',group:'Front desk',label:'Share a service between two stylists',hint:'Bill → “+ share”: the % below (default) of the service goes to the second person’s sales and incentive. An assistant booked with the service is shared automatically.',def:true,limit:50,limitLabel:'Default share %'},
  {id:'upiQr',group:'Front desk',label:'UPI QR for the exact amount',hint:'Set the UPI ID in ⚙ Menu & settings → Hours, GST. Shown in the bill form (📱 QR) and printed on unpaid / UPI bills.',def:true},
  {id:'scheduledPrices',group:'Front desk',label:'Scheduled price changes',hint:'⚙ Menu → 📅 Schedule prices: new prices switch on by themselves on the chosen date.',def:true},
  {id:'corporateAccounts',group:'Front desk',label:'Company / tie-up accounts',hint:'Billing → 🏢 Companies: bills on the company’s account, monthly statement, payments against the oldest bills.',def:true},
  {id:'clientPrefs',group:'Clients & stock',label:'Client preferences card',hint:'Drink, music, chat, best time — shown on bookings and the bill.',def:true},
  {id:'stylistHandover',group:'Clients & stock',label:'Hand over clients when a stylist leaves',hint:'Clients → 👋 Stylist left: regular clients, upcoming bookings, reassign and message.',def:true},
  {id:'birthdayVoucher',group:'Clients & stock',label:'Birthday wish with a one-time code',hint:'Clients shows today’s birthdays; one tap sends a wish with a ₹ code (below) valid this month, usable only by that client.',def:true,limit:300,limitLabel:'Code value ₹'},
  {id:'stylistScorecard',group:'Clients & stock',label:'Stylist scorecard',hint:'Appointments → 📊 Scorecard: clients, average bill, retail per client, came-back rate and ratings.',def:true},
  {id:'poReceiving',group:'Clients & stock',label:'Receive stock against purchase orders',hint:'Inventory → 📦 Receive PO: tick what arrived, part deliveries tracked, close a PO when the rest is not coming.',def:false},
  {id:'stockRequests',group:'Clients & stock',label:'Stock requests between outlets',hint:'Inventory → Transfer: ask another outlet for stock; they send or decline.',def:true},
  {id:'spotCheck',group:'Clients & stock',label:'Daily spot check',hint:'A few random items to count each day (number below), without showing the expected quantity.',def:true,limit:5,limitLabel:'Items a day'},
  {id:'barcodeLabels',group:'Clients & stock',label:'Barcode labels',hint:'Inventory → 🏷 Labels: give codes to items without one and print labels.',def:true},
  {id:'stockStatement',group:'Clients & stock',label:'Monthly stock statement',hint:'Opening + in − used − written off = closing, for the accountant (not posted to the P&L).',def:true},
  {id:'slowStock',group:'Clients & stock',label:'Slow or expiring stock to clear',hint:'Items not used for the days below, or expiring within 60 days, with a clearance price.',def:true,limit:90,limitLabel:'Not used for (days)'},
  {id:'payWorkbooks',group:'Data entry',label:'“Full workings” Excel for Salary and Incentive Working',hint:'Adds ⬇ Full workings (Excel) to both screens: every figure as a live formula, with the attendance, pay rules, PF / ESIC / PT slabs, advances, penalties, sales, targets and rate slabs it is worked out from, and a check against the app on each row.',def:true},
  {id:'backdateLock',group:'Data entry',label:'Block back-dated entries',hint:'Entries dated more than the days below before today cannot be added, changed or removed — Daily Sales & Exp, Attendance, Advances, Penalties, Vendor bills and Billing (bills, edits, cancellations, refunds). 0 = today only. A Super Admin is never blocked.',def:false,limit:3,limitLabel:'Allow entries up to (days back)'},
  {id:'compactToolbars',group:'Look & feel',label:'Tidy top bars with a “More ▾” menu',hint:'Appointments, Billing, Clients and Inventory keep the daily buttons visible; the rest are grouped under More (Money, Reports, Setup).',def:true},
  {id:'todayStrip',group:'Look & feel',label:'Today strip on front-desk tabs',hint:'Sales today, bookings still to come, client dues and low stock at the top of each tab.',def:true},
  {id:'keyboardShortcuts',group:'Look & feel',label:'Keyboard shortcuts and Ctrl + K search',hint:'Ctrl/⌘ + K finds clients, bills, mobiles and screens; Alt + 1…4 switch the front-desk tabs; in a bill F2 adds an item and Ctrl + Enter saves.',def:true},
  {id:'mobileLayout',group:'Look & feel',label:'Phone layout',hint:'One-column forms, full-width pop-ups and one stylist at a time in the appointment day (swipe for the next) on small screens.',def:true},
  {id:'calendarPolish',group:'Look & feel',label:'Calendar extras',hint:'Red “now” line, a colour per stylist and 🆕 first visit · ⭐ VIP · 💳 dues on booking cards; a hint on empty days.',def:true},
  {id:'billPrintDesign',group:'Look & feel',label:'New bill print layout',hint:'Centred header, cleaner table, choice of 58 mm / 80 mm thermal, A5 or A4 (⚙ Menu & settings → Hours, GST). Off = the old layout.',def:true},
  {id:'miniCharts',group:'Look & feel',label:'Mini charts',hint:'14-day sales trend on Billing, payment-mode ring on Day-end, bars in the date-wise register.',def:true},
  {id:'undoActions',group:'Look & feel',label:'Undo for deletes and cancellations',hint:'A 5-second “Undo” after cancelling a bill or booking, deleting a client or removing blocked time.',def:true},
  {id:'filterChips',group:'Look & feel',label:'Show active filters',hint:'Filters in Billing and Clients show as chips you can clear with one tap.',def:true},
  {id:'collRecoNeedsMapping',group:'Month close',label:'Collection Reco only after every bank credit of the month is mapped',hint:'Each credit line needs a Nature, and card / UPI settlements a Date as per Cradlee, before the month’s Collection Reco is shown or downloaded.',def:true},
  {id:'monthFinalNeedsMapping',group:'Month close',label:'Mark Month Final only after every bank line of the month is mapped',hint:'Debits need a Nature (vendor payments a vendor or linked bill); credits a Nature (card / UPI settlements a Date as per Cradlee). Applies to P&L Final and Daily Sales & Exp Month Final.',def:true},
  {id:'monthFinalRule',group:'Month close',label:'Mark Month Final only from the month’s last day',hint:'Daily Sales & Exp and Attendance cannot be finalised before the month ends.',def:true},
  {id:'poApproval',group:'Approvals',label:'Purchase order above the limit needs Super Admin approval',hint:'Inventory → 🧾 Purchase orders: a PO above the limit is sent for approval before it can be used for a bill.',def:false,limit:25000},
  {id:'invoiceApproval',group:'Approvals',label:'Vendor bill above the limit needs Super Admin approval',hint:'The person entering it sends a request; it saves once a Super Admin approves.',def:false,limit:50000},
  {id:'bankFileApproval',group:'Approvals',label:'Bank payment file above the limit needs Super Admin approval',hint:'Bank Payment → download of the bank upload file (total of the file).',def:false,limit:200000},
  {id:'deleteApproval',group:'Approvals',label:'Deleting a vendor bill or payment needs Super Admin approval',hint:'Anyone else gets a request instead; once approved they can delete that one entry.',def:false},
  {id:'vendorBankApproval',group:'Approvals',label:'Changing a vendor’s bank account needs Super Admin approval',hint:'Stops payments being redirected to a new account without a check.',def:false},
  {id:'payablesDueAlert',group:'Alerts',label:'Vendor bills overdue or due this week',hint:'A strip on Vendors with the overdue amount and what falls due in 7 days (⏱ Ageing has the list).',def:false},
  {id:'bankRecoAlert',group:'Alerts',label:'Bank lines left unexplained for over 7 days',hint:'A strip on Bank Statement counting lines with no Nature and no linked bill.',def:false},
  {id:'budgetAlert',group:'Alerts',label:'Spending ahead of budget this month',hint:'A strip on the Outlet Dashboard when an expense line runs more than 10% ahead of its budget pace (budgets in P&L → MTD).',def:false},
  {id:'missingSalesBanner',group:'Reminders',label:'Show days with no Daily Sales on the outlet screen',hint:'A red strip on Daily Sales & Exp listing this month’s missing days (the nightly 🔔 check is under Automation).',def:false},
  {id:'paidLeave',group:'Employees',label:'Paid leave balance',hint:'Leave earned each month (days below) for the financial year; in Attendance, absent days can be paid from it (Paid leave column).',def:false,limit:1,limitLabel:'Days a month'},
  {id:'leaveRequests',group:'Employees',label:'Leave requests from the staff phone screen',hint:'Staff ask for leave on Attendance → 📲 Staff phone screen; the manager approves in Attendance (📝 Leave requests) and the days are marked.',def:false},
  {id:'staffIncentiveView',group:'Employees',label:'Staff can see their own incentive on the phone screen',hint:'💰 My incentive: this month’s sales, target and expected incentive, behind a PIN (last 4 digits of the employee’s mobile).',def:false},
  {id:'advanceRecoveryPlan',group:'Employees',label:'Advance recovery plan on the Advances sheet',hint:'Outstanding, this month’s recovery and the payoff month for every employee with an advance.',def:true},
  {id:'advanceNetFloor',group:'Employees',label:'Warn when an advance recovery leaves too little net pay',hint:'Advance recovery plan: flagged when this month’s net pay is below the % of salary + incentive set here.',def:false,limit:40,limitLabel:'Keep at least %'},
  {id:'phoneCheckin',group:'Employees',label:'Phone check-in with selfie and location',hint:'Attendance → 📲 Check-in screen on the outlet phone; the manager marks check-in days Present. Distance allowed below.',def:false,limit:200,limitLabel:'Metres'},
  {id:'empStatement',group:'Employees',label:'Employee monthly statement on WhatsApp',hint:'Salary Working → Send Payslips adds days present, leave, advance balance and incentive to each message.',def:false},
];
const CONTROLS_KEY='salonos_controls';
function loadControls(){try{return JSON.parse(cachedLocalGet(CONTROLS_KEY)||'{}')||{};}catch(e){return{};}}
function saveControls(c){safeLocalSet(CONTROLS_KEY,JSON.stringify(c||{}));}
function controlDef(id){return CONTROL_DEFS.find(d=>d.id===id);}
// Outlet override wins; then the all-outlets switch; then the rule's default.
function controlOn(id,sid){
  const d=controlDef(id);if(!d)return true;
  const c=loadControls()[id]||{};
  if(sid!=null&&c.outlets&&typeof c.outlets[String(sid)]==='boolean')return c.outlets[String(sid)];
  return typeof c.on==='boolean'?c.on:d.def;
}
function controlLimit(id){const d=controlDef(id)||{};const c=loadControls()[id]||{};const v=Number(c.limit);return v>0?v:(d.limit||0);}

// ── Approvals ──
const APPROVALS_KEY='salonos_approvals';
function loadApprovals(){try{const a=JSON.parse(cachedLocalGet(APPROVALS_KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return[];}}
function saveApprovals(a){safeLocalSet(APPROVALS_KEY,JSON.stringify((a||[]).slice(-300)));}
const isSuperAdminUser=u=>!!u&&u.role==='Super Admin';
// key identifies the exact action (e.g. outlet|vendor|invoice no.|amount) so an approval is used once, for that action only.
function requireApproval({control,sid,key,summary}){
  if(!controlOn(control,sid))return true;
  const u=currentSessionUser();
  if(isSuperAdminUser(u))return true;
  const list=loadApprovals();const k=String(key);
  const ok=list.find(a=>a.control===control&&a.key===k&&a.status==='approved');
  if(ok){ok.status='used';ok.usedAt=new Date().toISOString();saveApprovals(list);return true;}
  const rej=list.filter(a=>a.control===control&&a.key===k&&a.status==='rejected').pop();
  if(list.some(a=>a.control===control&&a.key===k&&a.status==='pending')){window.alert('This is waiting for Super Admin approval:\n\n'+summary+'\n\nTry again once it is approved (Master Settings → 🎛 Controls → Approvals).');return false;}
  const d=controlDef(control)||{};
  if(!window.confirm((rej?'A Super Admin rejected this earlier'+(rej.note?' ('+rej.note+')':'')+'.\n\n':'')+d.label+'.\n\n'+summary+'\n\nSend it to a Super Admin for approval?'))return false;
  list.push({id:'AP'+Date.now()+Math.random().toString(36).slice(2,6),control,sid:sid==null?null:Number(sid),key:k,summary,by:(u&&(u.name||u.email))||'—',at:new Date().toISOString(),status:'pending'});
  saveApprovals(list);
  try{logAuditEvent(sid,{entity:'Approval',entityId:control,action:'Requested',summary});}catch(e){}
  window.alert('Sent for approval. Once a Super Admin approves it, do the same again and it will go through.');
  return false;
}
function decideApproval(id,status,note){
  const u=currentSessionUser();if(!isSuperAdminUser(u))return false;
  const list=loadApprovals();const a=list.find(x=>x.id===id);if(!a||a.status!=='pending')return false;
  a.status=status;a.decidedBy=u.name||u.email||'Super Admin';a.decidedAt=new Date().toISOString();if(note)a.note=note;saveApprovals(list);
  try{logAuditEvent(a.sid,{entity:'Approval',entityId:a.control,action:status==='approved'?'Approved':'Rejected',summary:a.summary+(note?' — '+note:'')});}catch(e){}
  return true;
}
function pendingApprovalsFor(u,salons){
  const vis=new Set((salonsForCurrentUser(salons)||[]).map(s=>String(s.id)));
  return loadApprovals().filter(a=>a.status==='pending'&&(a.sid==null||vis.has(String(a.sid))||isSuperAdminUser(u)));
}

// ── Master Settings card ──
function ControlsCenterCard({salons}){
  const h=React.createElement;const {toast}=useToast();
  const u=currentSessionUser();const canEdit=isSuperAdminUser(u);
  const [c,setC]=useState(()=>loadControls());const [open,setOpen]=useState(null);const [tab,setTab]=useState('rules');const [,tick]=useState(0);const [cq,setCq]=useState('');const [onlyOff,setOnlyOff]=useState(false);const [shut,setShut]=useState({});
  const outlets=(salons||[]).filter(s=>s&&s.id!=null&&s.status!=='Inactive');
  const upd=(id,patch)=>{if(!canEdit){toast('Only a Super Admin can change controls','error');return;}
    const n={...c,[id]:{...(c[id]||{}),...patch}};setC(n);saveControls(n);
    try{logAuditEvent(null,{entity:'Controls',entityId:id,action:'Changed',summary:(controlDef(id)||{}).label+' → '+JSON.stringify(patch)});}catch(e){}};
  const allOn=d=>typeof (c[d.id]||{}).on==='boolean'?c[d.id].on:d.def;
  const outletState=(d,sid)=>{const o=(c[d.id]||{}).outlets||{};return typeof o[String(sid)]==='boolean'?(o[String(sid)]?'on':'off'):'same';};
  const setOutlet=(d,sid,v)=>{const o={...((c[d.id]||{}).outlets||{})};if(v==='same')delete o[String(sid)];else o[String(sid)]=v==='on';upd(d.id,{outlets:o});};
  const pend=loadApprovals().filter(a=>a.status==='pending');const recent=loadApprovals().filter(a=>a.status!=='pending').slice(-15).reverse();
  const sname=sid=>{const s=(salons||[]).find(x=>String(x.id)===String(sid));return s?String(s.name).split('—')[0].trim():'All outlets';};
  const decide=(a,st)=>{let note='';if(st==='rejected'){note=window.prompt('Reason for rejecting (shown to the person who asked):','');if(note==null)return;}
    else if(!window.confirm('Approve?\n\n'+a.summary))return;
    if(decideApproval(a.id,st,note)){toast(st==='approved'?'Approved — they can now go ahead':'Rejected','success');tick(x=>x+1);}};
  const ctlVis=d=>(!cq.trim()||(d.label+' '+(d.hint||'')+' '+d.group).toLowerCase().includes(cq.trim().toLowerCase()))&&(!onlyOff||!allOn(d));
  const groups=[...new Set(CONTROL_DEFS.map(d=>d.group))];
  const sw=(on,onClick,dis)=>h('div',{className:'toggle-switch '+(on?'on':''),style:{flexShrink:0,opacity:dis?.5:1,cursor:dis?'not-allowed':'pointer'},onClick:dis?undefined:onClick,role:'switch','aria-checked':on});
  return h('div',{className:'card',style:{marginBottom:16}},
    h('div',{className:'card-title'},'🎛 Controls'),
    h('div',{style:{fontSize:12,color:'var(--text3)',marginBottom:10,lineHeight:1.6}},'Switch each check or approval rule on or off for all outlets, then open “Outlet-wise” to set a different choice for any outlet. '+(canEdit?'':'Only a Super Admin can change these.')),
    h('div',{className:'tab-bar',style:{marginBottom:10}},[['rules','Rules'],['checkup','Bank mapping check-up'],['appr','Approvals'+(pend.length?' ('+pend.length+')':'')]].map(([k,l])=>h('button',{key:k,className:'tab-btn '+(tab===k?'active':''),onClick:()=>setTab(k)},l))),
    tab==='rules'&&h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',margin:'0 0 8px'}},h('input',{className:'form-control',style:{flex:'1 1 220px'},placeholder:'Search '+CONTROL_DEFS.length+' switches…',value:cq,onChange:e=>setCq(e.target.value)}),
      h('label',{style:{fontSize:12.5,display:'flex',gap:5,alignItems:'center'}},h('input',{type:'checkbox',checked:onlyOff,onChange:e=>setOnlyOff(e.target.checked)}),'Only switched off'),
      h('button',{className:'btn btn-ghost btn-sm',onClick:()=>setShut(Object.keys(shut).length?{}:Object.fromEntries(groups.map(g=>[g,1])))},Object.keys(shut).length?'Expand all':'Collapse all')),
    tab==='rules'&&!groups.some(g=>CONTROL_DEFS.some(d=>d.group===g&&ctlVis(d)))&&h('div',{style:{fontSize:12.5,color:'var(--text3)'}},'No switch matches.'),
    tab==='rules'&&groups.filter(g=>CONTROL_DEFS.some(d=>d.group===g&&ctlVis(d))).map(g=>h('div',{key:g,style:{marginBottom:10}},
      h('div',{style:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'8px 0 2px',cursor:'pointer'},onClick:()=>setShut(x=>{const n={...x};if(n[g])delete n[g];else n[g]=1;return n;})},(shut[g]&&!cq.trim()?'▸ ':'▾ ')+g+' ('+CONTROL_DEFS.filter(d=>d.group===g&&ctlVis(d)).length+')'),
      (!shut[g]||cq.trim())&&CONTROL_DEFS.filter(d=>d.group===g&&ctlVis(d)).map(d=>{const over=outlets.filter(s=>outletState(d,s.id)!=='same').length;
        return h('div',{key:d.id,style:{borderBottom:'1px solid var(--border)',padding:'10px 0'}},
          h('div',{style:{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}},
            h('div',{style:{flex:'1 1 240px',minWidth:0}},h('div',{style:{fontSize:13,color:'var(--text)',fontWeight:500}},d.label),h('div',{style:{fontSize:11.5,color:'var(--text3)'}},d.hint)),
            d.limit!=null&&h('label',{style:{fontSize:11.5,color:'var(--text3)',display:'flex',alignItems:'center',gap:4}},d.limitLabel||'Limit ₹',h('input',{type:'number',min:0,className:'form-control',style:{width:100,padding:'3px 6px'},disabled:!canEdit,value:(c[d.id]||{}).limit!=null?c[d.id].limit:d.limit,onChange:e=>upd(d.id,{limit:e.target.value})})),
            h('button',{className:'btn btn-ghost btn-sm',style:{whiteSpace:'nowrap'},onClick:()=>setOpen(open===d.id?null:d.id)},'Outlet-wise'+(over?' ('+over+')':'')+(open===d.id?' ▴':' ▾')),
            h('span',{style:{fontSize:11,color:'var(--text3)',width:62,textAlign:'right'}},'All outlets'),sw(allOn(d),()=>upd(d.id,{on:!allOn(d)}),!canEdit)),
          open===d.id&&h('div',{style:{marginTop:8,background:'var(--bg3)',borderRadius:'var(--r)',padding:'6px 10px'}},
            !outlets.length&&h('div',{style:{fontSize:12,color:'var(--text3)'}},'No outlets.'),
            outlets.map(s=>{const st=outletState(d,s.id);const eff=st==='same'?allOn(d):st==='on';
              return h('div',{key:s.id,style:{display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:12.5}},
                h('span',{style:{flex:1}},String(s.name).split('—')[0].trim()),
                h('span',{style:{fontSize:11,color:eff?'var(--green)':'var(--text3)',width:28}},eff?'On':'Off'),
                [['same','Same as all'],['on','On'],['off','Off']].map(([v,l])=>h('button',{key:v,disabled:!canEdit,className:'btn btn-sm '+(st===v?'btn-primary':'btn-ghost'),style:{padding:'2px 8px'},onClick:()=>setOutlet(d,s.id,v)},l)));})));}))),
    tab==='checkup'&&(()=>{const defs=CONTROL_DEFS.filter(d=>d.group==='Bank mapping'||d.group==='Month close');
      const eff=(d,s)=>{const st=outletState(d,s.id);return st==='same'?allOn(d):st==='on';};
      const off=defs.reduce((t,d)=>t+outlets.filter(s=>eff(d,s)!==d.def).length,0);
      const useRec=()=>{if(!canEdit){toast('Only a Super Admin can change controls','error');return;}if(!window.confirm('Set every bank-mapping and month-close switch to the recommended setting for all outlets (outlet-wise choices are cleared; limits stay)?'))return;
        const n={...c};defs.forEach(d=>{n[d.id]={...(n[d.id]||{}),on:d.def,outlets:{}};});setC(n);saveControls(n);try{logAuditEvent(null,{entity:'Controls',entityId:'bank-checkup',action:'Recommended settings applied',summary:defs.length+' switches'});}catch(e){}toast('Recommended settings applied','success');};
      return h('div',null,
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}},
          h('div',{style:{fontSize:12.5,color:off?'var(--orange)':'var(--green)'}},off?off+' outlet setting(s) differ from the recommended one (shaded below).':'✓ Every outlet uses the recommended settings.'),
          canEdit&&h('button',{className:'btn btn-primary btn-sm',onClick:useRec},'Use recommended for all outlets')),
        h('div',{className:'table-wrap'},h('table',null,
          h('thead',null,h('tr',null,h('th',null,'Switch'),h('th',null,'Recommended'),outlets.map(s=>h('th',{key:s.id,style:{textAlign:'center'}},String(s.name).split('—')[0].trim())))),
          h('tbody',null,defs.map(d=>h('tr',{key:d.id},h('td',{style:{fontSize:12.5}},d.label),h('td',{style:{fontSize:12,color:'var(--text3)'}},d.def?'On':'Off'),
            outlets.map(s=>{const v=eff(d,s);return h('td',{key:s.id,style:{textAlign:'center',fontSize:12,fontWeight:600,color:v?'var(--green)':'var(--text3)',background:v!==d.def?'rgba(224,138,18,0.12)':undefined}},v?'On':'Off');})))))),
        h('div',{style:{fontSize:11.5,color:'var(--text3)',marginTop:6}},'Recommended = suggestions and flags on, rules that stop people off. Change any switch on the Rules tab.'));})(),
    tab==='appr'&&h('div',null,
      !pend.length&&h('div',{style:{fontSize:12.5,color:'var(--text3)',padding:'6px 0'}},'Nothing waiting for approval.'),
      pend.map(a=>h('div',{key:a.id,style:{display:'flex',gap:10,alignItems:'center',borderBottom:'1px solid var(--border)',padding:'8px 0'}},
        h('div',{style:{flex:1,fontSize:12.5}},h('b',null,(controlDef(a.control)||{}).label||a.control),h('div',{style:{whiteSpace:'pre-wrap'}},a.summary),
          h('div',{style:{fontSize:11,color:'var(--text3)'}},sname(a.sid)+' · asked by '+a.by+' · '+new Date(a.at).toLocaleString('en-IN'))),
        canEdit&&h('button',{className:'btn btn-primary btn-sm',onClick:()=>decide(a,'approved')},'Approve'),
        canEdit&&h('button',{className:'btn btn-ghost btn-sm',style:{color:'var(--red)'},onClick:()=>decide(a,'rejected')},'Reject'))),
      recent.length>0&&h('div',{style:{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',margin:'14px 0 4px'}},'Decided recently'),
      recent.map(a=>h('div',{key:a.id,style:{fontSize:12,color:'var(--text2)',padding:'3px 0'}},
        h('span',{style:{fontWeight:600,color:a.status==='rejected'?'var(--red)':'var(--green)'}},a.status==='rejected'?'Rejected':a.status==='used'?'Approved · used':'Approved'),' — ',a.summary.split('\n')[0],' · ',sname(a.sid),' · by ',a.decidedBy||'—'))));
}
// Strip shown to a Super Admin on every page while requests wait.
function PendingApprovalsStrip({salons,onOpen}){
  const h=React.createElement;const u=currentSessionUser();
  if(!isSuperAdminUser(u))return null;
  const n=loadApprovals().filter(a=>a.status==='pending').length;
  if(!n)return null;
  return h('div',{style:{background:'rgba(224,165,48,0.12)',border:'1px solid rgba(224,165,48,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,display:'flex',alignItems:'center',gap:10}},
    h('span',null,'⏳ ',h('b',null,n),' request'+(n===1?'':'s')+' waiting for your approval'),
    onOpen&&h('button',{className:'btn btn-ghost btn-sm',onClick:onOpen},'Open approvals'));
}
// Vendor bill above the approval limit — new bills, or an edit that changes the amount.
function invoiceApprovalOk(sid,vendorKey,vendorName,invoiceNo,amount,origAmount){
  if(!controlOn('invoiceApproval',sid))return true;
  const amt=Math.round(Number(amount)||0),lim=controlLimit('invoiceApproval');
  if(amt<=lim||(origAmount!=null&&Math.round(Number(origAmount)||0)===amt))return true;
  return requireApproval({control:'invoiceApproval',sid,key:sid+'|'+vendorKey+'|'+String(invoiceNo||'').trim().toUpperCase()+'|'+amt,
    summary:'Vendor bill '+(invoiceNo||'—')+' of '+(vendorName||'vendor')+' for ₹'+amt.toLocaleString('en-IN')+' (limit ₹'+lim.toLocaleString('en-IN')+')'});
}
// Vendor bank account / IFSC changed on an existing vendor.
function vendorBankChangeOk(sid,before,after){
  const norm=v=>String(v||'').replace(/\s+/g,'').toUpperCase();
  if(!before||(!norm(before.accountNo)&&!norm(before.ifsc)))return true; // first time bank details are added
  if(norm(before.accountNo)===norm(after.accountNo)&&norm(before.ifsc)===norm(after.ifsc))return true;
  return requireApproval({control:'vendorBankApproval',sid,key:sid+'|'+before.id+'|'+norm(after.accountNo)+'|'+norm(after.ifsc),
    summary:'Bank account of '+(after.name||before.name||'vendor')+' changed from '+(norm(before.accountNo)||'—')+' / '+(norm(before.ifsc)||'—')+' to '+(norm(after.accountNo)||'—')+' / '+(norm(after.ifsc)||'—')});
}
// Bank upload file whose total is above the limit.
function bankFileApprovalOk(sid,total,count,label){
  if(!controlOn('bankFileApproval',sid))return true;
  const amt=Math.round(Number(total)||0),lim=controlLimit('bankFileApproval');
  if(amt<=lim)return true;
  return requireApproval({control:'bankFileApproval',sid,key:sid+'|'+(label||'')+'|'+count+'|'+amt,
    summary:'Bank payment file'+(label?' ('+label+')':'')+': '+count+' payment'+(count===1?'':'s')+', total ₹'+amt.toLocaleString('en-IN')+' (limit ₹'+lim.toLocaleString('en-IN')+')'});
}
