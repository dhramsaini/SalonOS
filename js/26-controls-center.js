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
  {id:'dupEmployee',group:'Entry checks',label:'Duplicate employee',hint:'Warns when the PAN, Aadhaar, UAN, ESIC number or mobile of an employee being saved is already on another employee — in any outlet, including people who have left.',def:true},
  {id:'sharedBankAccount',group:'Entry checks',label:'Shared bank account',hint:'Warns when one bank account number is used by two employees, or by an employee and a vendor (any outlet), or by two vendors.',def:true},
  {id:'dupVendor',group:'Entry checks',label:'Duplicate vendor',hint:'Warns when a vendor has the same GSTIN (or the same PAN inside the GSTIN) as another vendor, or a near-identical name (e.g. “Loreal India” and “L\'Oreal India Pvt Ltd”).',def:true},
  {id:'sameBillNewNumber',group:'Entry checks',label:'Same vendor bill under a new number',hint:'Warns when a bill from the same vendor for the same amount is already entered within the days below under a different invoice number.',def:true,limit:3,limitLabel:'Within (days)'},
  {id:'repeatExpense',group:'Entry checks',label:'Repeat expense in Daily Sales & Exp',hint:'Warns when the same amount (₹1,000 or more) is entered under the same expense head within the days below, or the same description and amount is entered again.',def:true,limit:3,limitLabel:'Within (days)'},
  {id:'crossEntryExpense',group:'Entry checks',label:'Expense entered twice in different places',hint:'Warns when a cash expense in Daily Sales & Exp matches a vendor bill of the same amount within 3 days (or the other way round) — the same expense counted twice. Bills paid in cash from Daily Sales & Exp itself are not flagged.',def:true},
  {id:'dupAdvancePenalty',group:'Entry checks',label:'Duplicate advance or penalty',hint:'Warns when an advance to the same employee for the same amount is entered within 3 days (by hand or from Daily Sales & Exp), a bank reference is used twice, or a penalty for the same employee, day and type is entered again.',def:true},
  {id:'importSeen',group:'Entry checks',label:'File already imported',hint:'Warns when the same file is imported again — bank statement, collection report, staff work report, attendance, vendor bills, employee list, membership (Rule C) or aggregator payouts — and shows when and by whom it was imported.',def:true},
  {id:'stockTwice',group:'Entry checks',label:'Stock received twice',hint:'Warns when the same quantity of an item is received again within 2 days, a purchase order line already fully received is received again, or the same quantities are received against a purchase order twice in a day.',def:true},
  {id:'doubleSaveGuard',group:'Entry checks',label:'Double click / double save',hint:'The same entry saved again within 3 seconds (a double click) is ignored — vendor bills, vendors, employees, advances and penalties.',def:true},
  {id:'extraZeroCheck',group:'Entry checks',label:'Extra-zero check',hint:'Warns when a Daily Sales or expense figure, a description entry or a vendor bill is more than the times below its usual amount (30-day average, or the vendor’s last bills) — e.g. 50,000 typed for 5,000.',def:true,limit:5,limitLabel:'Flag above (× the usual)'},
  {id:'modeVsBilling',group:'Entry checks',label:'Payment modes: Daily Sales vs Billing',hint:'On Daily Sales & Exp, lists days where Cash, Card or UPI differs from the Billing totals of that day by more than ₹ below. Only days with bills.',def:true,limit:100,limitLabel:'Allowed difference (₹)'},
  {id:'dseVsBilling',group:'Entry checks',label:'Daily Sales total vs Billing',hint:'On Daily Sales & Exp, lists days where the day’s total sale differs from the Billing total (less package and voucher redemptions) by more than ₹ below.',def:true,limit:100,limitLabel:'Allowed difference (₹)'},
  {id:'depositVsBank',group:'Entry checks',label:'Cash deposits vs the bank statement',hint:'On Daily Sales & Exp, lists Bank Deposit entries with no matching cash deposit in the bank statement within 4 days, and cash deposits in the bank not entered in Daily Sales.',def:true},
  {id:'gstMathCheck',group:'Entry checks',label:'GST arithmetic on vendor bills',hint:'Warns when CGST and SGST are not equal, or the GST is not a GST rate (5%, 12%, 18%, 28% …) of the taxable value.',def:true},
  {id:'dateSenseCheck',group:'Entry checks',label:'Date sense check',hint:'Warns when a vendor bill’s invoice date is in the future or over 6 months old, the due or booking date is before the invoice date, or a payment is dated before the bill or in the future.',def:true},
  {id:'futureLock',group:'Entry checks',label:'Block future-dated entries',hint:'Entries dated after today cannot be added or changed — Daily Sales & Exp, Attendance, Advances, Penalties, Vendor bills and Billing. A Super Admin is never blocked.',def:false},
  {id:'attendanceSense',group:'Entry checks',label:'Attendance sense check',hint:'Attendance shows (and Mark Month Final asks about) days marked present before joining or after leaving, future days marked present, work on the weekly off, and — with phone check-in on — present days with no check-in.',def:true},
  {id:'salaryChangeReason',group:'Entry checks',label:'Salary master changes need a reason',hint:'When an employee’s gross pay changes by more than the % below, a reason is needed to save it (recorded in the Audit Log).',def:false,limit:20,limitLabel:'Ask above (% change)'},
  {id:'wageSenseCheck',group:'Entry checks',label:'Salary master sense check',hint:'Warns when Basic is below half of gross (Labour Codes), gross is below the ₹ below, PF is ticked with no Basic, or the leaving date is before the joining date.',def:true,limit:10000,limitLabel:'Minimum gross (₹)'},
  {id:'negativeStockBlock',group:'Entry checks',label:'Block negative stock',hint:'Stock cannot go below zero: issuing more than is in stock is blocked, and a bill with more of a retail product than in stock cannot be saved (with “Retail products sold on a bill come off stock” on).',def:false},
  {id:'proofAboveLimit',group:'Entry checks',label:'Proof above a limit',hint:'Vendor bills of the ₹ below or more cannot be saved without the bill copy attached, and Daily Sales & Exp expenses of that much need a narration.',def:false,limit:5000,limitLabel:'From (₹)'},
  {id:'dataQualityBoard',group:'Entry checks',label:'Data-quality score',hint:'Dashboard → 🧹 Data quality: a score per outlet for the last 7 days (possible duplicates, corrections, late edits, warnings overridden, bills without proof, days without Daily Sales), with a WhatsApp summary for the owner.',def:true},
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
  {id:'payWbPools',group:'Data entry',label:'Full workings: membership pool, manager pool and week-offs as formulas',hint:'Adds a Mem Pool sheet (membership Rule A/B/C worked out), works the manager incentive pool out from the month’s collection, target and tiers, and counts allowed week-offs from each employee’s weekly-off day and joining / leaving date.',def:true},
  {id:'payWbWhatIf',group:'Data entry',label:'Full workings: what-if columns',hint:'Yellow cells to try a different salary, payable days or TDS (Salary) or an extra service sale (Incentive) — the what-if columns show the new figure and the change without touching the real ones.',def:true},
  {id:'payWbPayslips',group:'Data entry',label:'Full workings: Payslips sheet',hint:'One printable payslip per employee, linked to Salary Working.',def:true},
  {id:'payWbBank',group:'Data entry',label:'Full workings: Bank Transfer sheet',hint:'Beneficiary name, account, IFSC and net salary for the bank upload, linked to Salary Working.',def:true},
  {id:'payWbStatutory',group:'Data entry',label:'Full workings: PF / ESIC / PT sheet',hint:'PF ECR (EPF, EPS 8.33%, employer EPF, EDLI and admin charges with the ₹500 minimum), ESIC and Professional Tax, linked to Salary Working with a check on each row.',def:true},
  {id:'payWbCompare',group:'Data entry',label:'Full workings: last month and year to date',hint:'Adds “vs Last Month” (with what changed) and “Year to Date” (from April) sheets.',def:true},
  {id:'payWbCtc',group:'Data entry',label:'Full workings: Cost to Company sheet',hint:'Gross + tea + employer PF + employer ESIC + monthly incentive per employee.',def:true},
  {id:'payWbExceptions',group:'Data entry',label:'Full workings: Exceptions sheet',hint:'Lists what to look at before approving — days not marked, PF / ESIC / PT / incentive typed in by hand, TDS, net below the % below, large advance recovery, no bank account, not approved. Names link to the row.',def:true,limit:50,limitLabel:'Flag net salary below (% of salary)'},
  {id:'payWbReco',group:'Data entry',label:'Full workings: Reconciliation sheet',hint:'Due vs paid by bank (linked bank lines) and in cash (Daily Sales & Exp), and a tie to the P&L Employee Cost lines.',def:true},
  {id:'payWbTrail',group:'Data entry',label:'Full workings: Approval Trail sheet',hint:'Each employee’s approval and payment status, the summary approval and reviews, and the incentive plan’s approval.',def:true},
  {id:'payWbIntegrity',group:'Data entry',label:'Full workings: change check and download code',hint:'The About sheet shows a control figure that turns to “⚠ Figures changed after download” if anyone edits the workbook, and a download code that is also recorded in the Audit Log.',def:true},
  {id:'payWbChooser',group:'Data entry',label:'Full workings: choose sheets and employees before download',hint:'Opens a small window to pick the extra sheets and the employees. Off = downloads everything straight away (only the employees ticked on the screen, if any).',def:true},
  {id:'payWbAllOutlets',group:'Data entry',label:'Full workings: all outlets in one workbook',hint:'Adds ⬇ Salary workings — all outlets to the Reports Hub: one Summary sheet plus each outlet’s sheets.',def:true},
  {id:'payWorkbookEmail',group:'Data entry',label:'Full workings: email',hint:'Adds 📧 Email to the download window, and emails the salary full workings to the outlet’s report recipients once, automatically, when the month auto-locks after every employee is approved. Needs the updated email function deployed.',def:false},
  {id:'payWbProtected',group:'Data entry',label:'Full workings: protected copy',hint:'Offers a protected copy in the download window — formulas visible but cells locked, only the yellow what-if cells can be typed in.',def:false},
  {id:'backdateLock',group:'Data entry',label:'Block back-dated entries',hint:'Entries dated more than the days below before today cannot be added, changed or removed — Daily Sales & Exp, Attendance, Advances, Penalties, Vendor bills and Billing (bills, edits, cancellations, refunds). 0 = today only. A Super Admin is never blocked.',def:false,limit:3,limitLabel:'Allow entries up to (days back)'},
  {id:'ctlOutletView',group:'Controls page',label:'Outlet view',hint:'Rules tab: pick one outlet to see every switch as it applies there, and switch it for that outlet directly.',def:true},
  {id:'ctlCompare',group:'Controls page',label:'Outlet comparison grid',hint:'Check-up tab: switches × outlets for each area, differences shaded; click a cell to change that outlet.',def:true},
  {id:'ctlHealth',group:'Controls page',label:'Health check for every area',hint:'Check-up tab: % of switches at the recommended setting per outlet, with a Fix button.',def:true},
  {id:'ctlLinks',group:'Controls page',label:'Linked switches',hint:'Shows when a switch needs another one (e.g. the Full-workings options need the main switch) and offers to turn it on; a switch that can’t work is greyed.',def:true},
  {id:'ctlShowMe',group:'Controls page',label:'“Show me” on each switch',hint:'A button that opens the screen where the switch applies, and a sample of the message staff see.',def:true},
  {id:'ctlLastChanged',group:'Controls page',label:'Last changed by, with undo',hint:'Each switch shows who changed it last and when, with one-click undo.',def:true},
  {id:'ctlHistory',group:'Controls page',label:'History tab',hint:'Every change to Controls, filterable by date, person and area, with revert.',def:true},
  {id:'ctlOwnerAlert',group:'Controls page',label:'Alert the owner when a safety rule is turned off',hint:'When a rule labelled “Stops an entry” or “Needs approval” is switched off (for all or any outlet), Super Admins and owners see an alert on every page with 📲 WhatsApp to the owner; it is also emailed to the report recipients once the email function is updated.',def:true},
  {id:'ctlTwoPerson',group:'Controls page',label:'Second Super Admin to switch off a safety rule',hint:'Switching off a rule labelled “Stops an entry” (for all or any outlet, including temporarily) waits until a different Super Admin approves it.',def:false},
  {id:'ctlLocks',group:'Controls page',label:'Locked switches',hint:'A Super Admin can lock a switch (🔒); changing or unlocking it then needs the authenticator code again.',def:false},
  {id:'ctlSets',group:'Controls page',label:'Ready-made and saved sets',hint:'Sets tab: Strict / Balanced / Light, or your own saved set, applied to all outlets or chosen ones.',def:true},
  {id:'ctlCopyOutlet',group:'Controls page',label:'Copy settings from another outlet',hint:'Sets tab: give one or more outlets the same switches and limits as another outlet.',def:true},
  {id:'ctlOutletLimits',group:'Controls page',label:'Outlet-wise limits',hint:'A different limit per outlet (in Outlet-wise), not only on/off. Blank = same as all outlets.',def:true},
  {id:'ctlTemporary',group:'Controls page',label:'Temporary switches',hint:'⏱ on a switch: on or off for a date range (all or one outlet), going back by itself afterwards.',def:true},
  {id:'ctlRoleRules',group:'Controls page',label:'Role-wise rules',hint:'👤 on a switch: apply it only to chosen roles, or not to named people. Others are treated as switched off.',def:true},
  {id:'ctlHitStats',group:'Controls page',label:'How often each check fires',hint:'Each check shows the last 30 days’ warnings, overrides and blocks, with filters for noisy checks and ones that never fire.',def:true},
  {id:'ctlWhatsNew',group:'Controls page',label:'New badge and What’s new',hint:'Switches added in the last 30 days are marked New, and the What’s new tab lists them.',def:true},
  {id:'ctlExport',group:'Controls page',label:'Export, policy print and backup',hint:'Sets tab: Controls as Excel, a printable controls policy for the CA / auditors, and a backup file to restore.',def:true},
  {id:'geminiModelList',group:'App',label:'Gemini: list the models your key can use',hint:'Master Settings → AI Assistant → Gemini key: a “⟳ Models for this key” button asks Google which Gemini models the key can use, so you pick one that works. Needs the updated ai-settings cloud function.',def:true},
  {id:'dmyDates',group:'Look & feel',label:'Date boxes in DD/MM/YYYY',hint:'Every date box shows and takes the date as DD/MM/YYYY (type it, or pick it with 📅), whatever the phone or computer’s language. Off = the browser’s own date box, which follows the device’s format.',def:true},
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
  {id:'aadhaarRequired',group:'Employees',label:'Aadhaar copy required in Master Salary',hint:'On: an employee cannot be saved in Master Salary without the Aadhaar card copy attached. Off: attaching it is optional.',def:false},
  {id:'salaryRevisions',group:'Employees',label:'Master Salary changes ask “with effect from”',hint:'Any change in Master Salary (pay, designation, department, weekly off, PF / ESIC, bank details …) asks from which month it applies. Each employee keeps a history: every month uses the details in force then, locked months never change, and a future change can be entered now — it applies by itself when its month comes. Name, contact, PAN / Aadhaar, documents and joining / leaving dates are corrections and apply to every month.',def:true},
  {id:'salaryArrears',group:'Employees',label:'Arrears for back-dated pay changes',hint:'When a pay change goes back into months already locked, those months keep the old pay and the difference — (new − old) ÷ days in month × payable days — is added as Arrears to the first open month’s salary. Off: no arrears are worked out.',def:true},
  {id:'payHold',group:'Employees',label:'Salary hold',hint:'🧰 Pay tools → Hold & extras: hold one employee’s salary with a reason; they are left out of the Salary Payment bank list until released.',def:true},
  {id:'payOvertime',group:'Employees',label:'Overtime from check-ins',hint:'Overtime pay from phone check-out times past the shift end (per-minute pay × the multiplier in Pay tools), from the hours below.',def:false,limit:1,limitLabel:'Count from (hours past shift)'},
  {id:'payLateEarly',group:'Employees',label:'Late / early deduction from check-ins',hint:'Deduct for late check-in and early check-out beyond the grace minutes below, capped at the days’ pay set in Pay tools.',def:false,limit:15,limitLabel:'Grace (minutes)'},
  {id:'payOneOffs',group:'Employees',label:'Bonus and one-off earnings',hint:'Add festival / referral / performance bonus or reimbursements to an employee’s month; included in net pay and the payslip.',def:true},
  {id:'payProvisions',group:'Employees',label:'Statutory bonus and gratuity provisions',hint:'Monthly provision per employee — bonus 8.33% of basic up to the ceiling below (salary up to ₹21,000), gratuity 4.81% of basic — shown in Pay tools and as provision lines in the P&L.',def:false,limit:7000,limitLabel:'Bonus ceiling (₹)'},
  {id:'payFnF',group:'Employees',label:'Full and final for leavers',hint:'Pay tools → Leavers F&F: salary, leave encashment, notice shortfall, incentive, advance still due and gratuity for everyone leaving that month, printable.',def:true},
  {id:'payLeaveEncash',group:'Employees',label:'Leave encashment',hint:'Pay unused leave days at basic ÷ days in month, entered per employee in Pay tools.',def:true},
  {id:'payChangePreview',group:'Employees',label:'Changes before approval',hint:'Pay tools → Changes: net pay changed by more than the % below from last month, with the reason; “Approve all” asks first.',def:true,limit:20,limitLabel:'Flag above (% change)'},
  {id:'paySplit',group:'Employees',label:'Bank and cash split',hint:'Pay part of the salary in cash; Salary Payment and the bank list show only the bank part.',def:true},
  {id:'ipWords',group:'Employees',label:'Incentive Plan in plain words',hint:'The Monthly Plan opens with each rule written out in sentences, with ₹ examples worked out from your own staff salaries.',def:true},
  {id:'ipPeriod',group:'Employees',label:'Dates the plan applies to',hint:'Shows the dates the plan covers, whether Incentive Working uses it yet, and when it locks.',def:true},
  {id:'ipDiff',group:'Employees',label:'Changes from last month',hint:'Lists only the rules that differ from last month’s approved plan, old → new.',def:true},
  {id:'ipGroups',group:'Employees',label:'Who is on which plan',hint:'One card per plan or designation, listing its employees and their rules. Warns when an employee is assigned to a plan but that category isn’t split by designation, so the assignment does nothing.',def:true},
  {id:'ipTimeline',group:'Employees',label:'Plan status steps',hint:'Prepare → Sent for approval → Approved (or Returned), with a log of who did each step and when.',def:true},
  {id:'ipDrift',group:'Employees',label:'Warn when rules change after approval',hint:'Warns on the Monthly Plan and on Incentive Working when ⚙ Incentive Rules & Settings have been edited since the plan was approved, and lists what changed (the month still uses the approved plan).',def:true},
  {id:'ipInUse',group:'Employees',label:'“Plan in use” label on Incentive Working',hint:'Incentive Working shows which plan it is using: the approved plan, one waiting for approval, or the current rules.',def:true},
  {id:'ipWizard',group:'Employees',label:'Step-by-step preparing (required)',hint:'A ticked step list for preparing the plan: start, check each category, look at the cost and give reasons. Submitting is blocked until every step is ticked.',def:false},
  {id:'ipCost',group:'Employees',label:'Cost estimate before submitting',hint:'Works out what the plan would have paid on last month’s sales, compared with last month’s own plan. Flags a rise above the % below.',def:true,limit:10,limitLabel:'Flag a rise above (%)'},
  {id:'ipChecklist',group:'Employees',label:'Approver checklist (required)',hint:'Before approving, the approver ticks that they have seen the changes, the cost estimate and the reasons. Also adds quick remarks for returning a plan.',def:false},
  {id:'ipNotes',group:'Employees',label:'Reason for each change',hint:'The person preparing the plan can give a one-line reason for each change. The approver sees the reasons beside the changes.',def:true},
  {id:'ipStaffSheet',group:'Employees',label:'Plan sheet for each employee',hint:'Print a one-page plan for each employee (targets and slabs in ₹, with a signature line), or send it on WhatsApp.',def:true},
  {id:'ipStaffPhone',group:'Employees',label:'My plan on the staff phone',hint:'Under 💰 My incentive, staff also see their own plan and how much more service takes them to the next slab.',def:true},
  {id:'ipReminder',group:'Employees',label:'Reminder when next month’s plan isn’t approved',hint:'From the day below, the Owner / ASM see a note at the top of every page until next month’s plan is approved.',def:true,limit:25,limitLabel:'From day of month'},
  {id:'incRulesGuide',group:'Employees',label:'Incentive Rules made easy',hint:'Incentive Rules & Settings opens with a step bar to jump to each part, a plain-words summary of how incentive is worked out with ₹ examples, and a “Try it” calculator. Nothing changes in the calculation.',def:true},
  {id:'incSimpleView',group:'Employees',label:'Simple / Detailed view on Incentive Working',hint:'A Simple view — Stylist, Service, Membership, Product (sale, target, %), each incentive, deductions and total — next to today’s Detailed table; the choice is remembered on each device.',def:true},
  {id:'incBreakdown',group:'Employees',label:'Breakdown per stylist',hint:'Simple view: click a stylist to see every step — sales, target, ×times, slab, each incentive, deductions and adjustments — to the total.',def:true},
  {id:'incProgress',group:'Employees',label:'Progress bars',hint:'Simple view: a bar under each % of target, coloured by how close it is.',def:true},
  {id:'incWhyZero',group:'Employees',label:'Why ₹0',hint:'Simple view: the reason under any ₹0 total (no salary, no sales, below the first slab, all taken by penalty / advance …).',def:true},
  {id:'incSourceLabel',group:'Employees',label:'Data source label',hint:'Simple view: 📄 CRADLE report or ✍ typed on each row, and a warning when the month is over with no report imported.',def:true},
  {id:'incDeltaLM',group:'Employees',label:'Change against last month',hint:'Simple view: ↑ / ↓ ₹ against last month’s total for each stylist.',def:true},
  {id:'incStatement',group:'Employees',label:'Incentive statement per stylist',hint:'From the breakdown: a statement set out like a payslip, as PDF or on WhatsApp to the stylist.',def:true},
  {id:'incPools',group:'Employees',label:'Pool lines',hint:'Above the Simple view: the manager pool and membership pool totals with each manager’s share.',def:true},
  {id:'incTieOut',group:'Employees',label:'Tie-out with the outlet’s sales',hint:'Stylists’ total sales compared with the outlet’s (Billing, or Daily Sales); flagged above the % below, and “Approve all” asks first.',def:true,limit:5,limitLabel:'Flag above (% difference)'},
  {id:'incProRata',group:'Employees',label:'Pro-rata targets',hint:'Targets × payable days ÷ days in the month, so a mid-month joiner or someone on leave isn’t measured against a full month.',def:false},
  {id:'incProgressive',group:'Employees',label:'Progressive service slabs',hint:'Each service rate applies only to the part of the sale inside its slab (like tax slabs), instead of the whole sale taking the rate of the slab reached.',def:false},
  {id:'incCompWeight',group:'Employees',label:'Complementary sale counted in Service',hint:'How much of the complementary sale counts as service achieved. 50% is how it has always worked.',def:true,limit:50,limitLabel:'Count (% of complementary)'},
  {id:'incRoundTotal',group:'Employees',label:'Round once on the total',hint:'Keep paise in each incentive amount and round only the total, instead of rounding every amount.',def:false},
  {id:'incTracker',group:'Employees',label:'Live incentive target tracker',hint:'Incentive Working → Pay tools: each stylist’s service progress this month, amount needed a day and the next slab, with a WhatsApp summary.',def:true},
  {id:'incSimulator',group:'Employees',label:'Incentive simulator',hint:'Try a different service target or rate on last month’s sales and see the cost before changing the rule.',def:true},
  {id:'incTeam',group:'Employees',label:'Team incentive',hint:'A pool shared by the team (by days worked or equally) when the outlet’s monthly sales target is reached; added to Incentive Working.',def:true},
  {id:'incFeedback',group:'Employees',label:'Client feedback on incentive',hint:'Incentive reduced by the % below when a stylist’s average client rating is below 3.5★ (5+ ratings in the month).',def:false,limit:10,limitLabel:'Reduce by (%)'},
  {id:'incClawback',group:'Employees',label:'Clawback for refunds and cancellations',hint:'Incentive on bills from earlier months that are refunded or cancelled this month is taken back, bill by bill.',def:false},
  {id:'incCap',group:'Employees',label:'Incentive cap',hint:'Total incentive limited to the % of salary below.',def:false,limit:100,limitLabel:'Cap (% of salary)'},
  {id:'incFloor',group:'Employees',label:'Incentive floor for new joiners',hint:'At least the ₹ below as incentive in the first 3 months after joining.',def:false,limit:2000,limitLabel:'Floor (₹)'},
  {id:'incMixCheck',group:'Employees',label:'Product vs service mix check',hint:'Flags stylists whose product sale is more than the % below of their service sale (and over ₹5,000), before approval.',def:true,limit:40,limitLabel:'Flag above (% of service)'},
  {id:'payMakerChecker',group:'Employees',label:'Maker-checker on Salary / Incentive Working',hint:'Each row has to be checked (Pay tools → Checking) by someone other than the person approving it.',def:false},
  {id:'payChangeLog',group:'Employees',label:'Change log for Salary / Incentive Working',hint:'Every change on a row (status, PF / ESIC / PT / TDS typed in, payment …) is recorded with old → new, who and when (Pay tools → Change log).',def:true},
  {id:'payCompare',group:'Employees',label:'Month comparison',hint:'Pay tools → Changes / Compare months: headcount, gross, net and incentive against last month and the same month last year.',def:true},
  {id:'payBudget',group:'Employees',label:'Salary and incentive budget',hint:'Monthly budget (set outlet-wise if needed); the sheets show when net salary + incentive is over it, and “Approve all” asks first. 0 = no budget.',def:true,limit:0,limitLabel:'Budget (₹ a month)'},
  {id:'payYearly',group:'Employees',label:'Employee yearly view',hint:'Pay tools → Yearly view: one employee’s financial year month by month, as PDF.',def:true},
  {id:'paidLeave',group:'Employees',label:'Paid leave balance',hint:'Leave earned each month (days below) for the financial year; in Attendance, absent days can be paid from it (Paid leave column).',def:false,limit:1,limitLabel:'Days a month'},
  {id:'leaveRequests',group:'Employees',label:'Leave requests from the staff phone screen',hint:'Staff ask for leave on Attendance → 📲 Staff phone screen; the manager approves in Attendance (📝 Leave requests) and the days are marked.',def:false},
  {id:'staffIncentiveView',group:'Employees',label:'Staff can see their own incentive on the phone screen',hint:'💰 My incentive: this month’s sales, target and expected incentive, behind a PIN (last 4 digits of the employee’s mobile).',def:false},
  {id:'advanceRecoveryPlan',group:'Employees',label:'Advance recovery plan on the Advances sheet',hint:'Outstanding, this month’s recovery and the payoff month for every employee with an advance.',def:true},
  {id:'advanceNetFloor',group:'Employees',label:'Warn when an advance recovery leaves too little net pay',hint:'Advance recovery plan: flagged when this month’s net pay is below the % of salary + incentive set here.',def:false,limit:40,limitLabel:'Keep at least %'},
  {id:'advEligibility',group:'Employees',label:'Eligibility check when giving an advance',hint:'The New Advance and Request windows show net pay, what is already owed, the monthly recovery and how long it takes; saving warns when recovery takes more months than below, is more than net pay, or the employee has a leaving date.',def:true,limit:6,limitLabel:'Warn above (months to recover)'},
  {id:'advServiceLimit',group:'Employees',label:'Limit advances by service and salary',hint:'No advance in the first 3 months; up to half of the limit for 3–12 months’ service; up to the limit (× monthly gross, below) after a year — counting what is already owed.',def:false,limit:1,limitLabel:'Limit (× monthly gross)'},
  {id:'advOneOpen',group:'Employees',label:'One open advance at a time',hint:'Warns when someone is given a new advance while an earlier one is still being recovered.',def:true},
  {id:'advPhoneRequest',group:'Employees',label:'Advance request from the staff phone',hint:'Staff ask for an advance on the phone screen (PIN = last 4 digits of their mobile); it waits as Pending Approval on the Advances sheet, and the decision can be sent to them on WhatsApp.',def:true},
  {id:'advAck',group:'Employees',label:'Signed acknowledgement',hint:'⋯ on an advance: print a one-page acknowledgement with the recovery plan to sign, and attach the signed copy.',def:true},
  {id:'advPullConfirm',group:'Employees',label:'Confirm before “Adjust now” pulls next month’s advance',hint:'On Salary Working, “Adjust now” under Next Month Adv shows which advances would be pulled into this month and asks for confirmation before taking them off this month’s salary.',def:true},
  {id:'advPullNote',group:'Employees',label:'Mark advances pulled forward',hint:'Under Adv Adj on Salary Working, a note “incl. ₹… pulled forward from <next month>” when “Adjust now” was used.',def:true},
  {id:'advSkipMonth',group:'Employees',label:'Skip a month',hint:'⋯ on an advance: move one month’s instalment to the next month, with a reason.',def:true},
  {id:'advChangePlan',group:'Employees',label:'Change the plan mid-way',hint:'⋯ on an advance: a new monthly amount from a chosen month; the remaining months are worked out again and the old plan is kept.',def:true},
  {id:'advPartRecovery',group:'Employees',label:'Part-recovery when pay is short',hint:'If net pay can’t cover the instalment, only what the pay can bear is recovered and the rest moves to the next month automatically.',def:true},
  {id:'advRepaid',group:'Employees',label:'Repaid by the employee',hint:'⋯ on an advance: record money paid back in cash, UPI or bank; it lowers the balance and shortens the plan.',def:true},
  {id:'advSplit',group:'Employees',label:'Split between salary and incentive',hint:'⋯ on an advance: recover it partly from salary and partly from incentive (two linked records).',def:true},
  {id:'advLeavers',group:'Employees',label:'Full and final for leavers',hint:'Advance tools → Leavers: everyone with a leaving date who still owes, with one click to recover the whole balance in the final pay.',def:true},
  {id:'advStatement',group:'Employees',label:'Advance statement per employee',hint:'Month-by-month given, recovered and balance — on screen, as PDF, or on WhatsApp to the employee.',def:true},
  {id:'advRegister',group:'Employees',label:'Advance register with ageing (all outlets)',hint:'Dashboard → 💰 Advances and Advance tools: outstanding by age, more than one open advance, leavers with dues and recoveries behind plan.',def:true},
  {id:'advOverdue',group:'Employees',label:'Recovery behind plan',hint:'Advance tools → Behind plan: advances where a month passed without the planned recovery.',def:true},
  {id:'advTieOut',group:'Employees',label:'Month-end tie-out for advances',hint:'Checks cash advances against Daily Sales, bank advances against linked bank lines, recoveries against approved Salary / Incentive Working, and the balance roll-forward.',def:true},
  {id:'advTally',group:'Employees',label:'Advance journal for Tally',hint:'Advance tools → Tally journal: given, recovered, repaid and written off as vouchers (debit / credit ledger) in Excel.',def:true},
  {id:'advFee',group:'Employees',label:'Fee or interest on advances',hint:'⋯ on an advance: add a fee (% of the balance or flat ₹); it is added to the balance and the plan.',def:false},
  {id:'advWriteOff',group:'Employees',label:'Write off an advance (with approval)',hint:'⋯ on an advance: write off what can’t be recovered — needs Super Admin approval, records the reason and shows as “Advances Written Off” in the P&L.',def:true},
  {id:'phoneCheckin',group:'Employees',label:'Phone check-in with selfie and location',hint:'Attendance → 📲 Check-in screen on the outlet phone; the manager marks check-in days Present. Distance allowed below.',def:false,limit:200,limitLabel:'Metres'},
  {id:'empStatement',group:'Employees',label:'Employee monthly statement on WhatsApp',hint:'Salary Working → Send Payslips adds days present, leave, advance balance and incentive to each message.',def:false},
];
const CONTROLS_KEY='salonos_controls';
function loadControls(){try{return JSON.parse(cachedLocalGet(CONTROLS_KEY)||'{}')||{};}catch(e){return{};}}
function saveControls(c){safeLocalSet(CONTROLS_KEY,JSON.stringify(c||{}));}
function controlDef(id){return CONTROL_DEFS.find(d=>d.id===id);}
// Outlet override wins; then the all-outlets switch; then the rule's default.
// Role-wise rule (only for chosen roles / not for exempt people) → a temporary switch → outlet
// override → all-outlets switch → default. The first two need Controls → ctlRoleRules / ctlTemporary.
function controlRawOn(id){const d=controlDef(id);const c=loadControls()[id]||{};return typeof c.on==='boolean'?c.on:(d?d.def:true);}
function controlTempFor(c,sid){
  if(!Array.isArray(c.temp)||!c.temp.length||!controlRawOn('ctlTemporary'))return null;const t=localIsoOf(new Date());
  const act=c.temp.filter(x=>x&&(!x.from||x.from<=t)&&(!x.to||t<=x.to));
  return act.find(x=>sid!=null&&x.sid!=null&&String(x.sid)===String(sid))||act.find(x=>x.sid==null)||null;
}
function controlOn(id,sid){
  const d=controlDef(id);if(!d)return true;
  const c=loadControls()[id]||{};
  if(((c.roles&&c.roles.length)||(c.exempt&&c.exempt.length))&&controlRawOn('ctlRoleRules')){const u=currentSessionUser();
    if(u){if(c.roles&&c.roles.length&&!c.roles.includes(u.role))return false;if(c.exempt&&c.exempt.some(x=>x&&(x===u.email||x===u.name)))return false;}}
  const tmp=controlTempFor(c,sid);if(tmp)return !!tmp.on;
  if(sid!=null&&c.outlets&&typeof c.outlets[String(sid)]==='boolean')return c.outlets[String(sid)];
  return typeof c.on==='boolean'?c.on:d.def;
}
// The outlet on screen, for limits read without an outlet.
function controlCtxSid(){try{const n=window.__salonosNav;return n&&n.selectedSalon?n.selectedSalon.id:null;}catch(e){return null;}}
// Outlet-wise limit (Controls → ctlOutletLimits) → all-outlets limit → default.
function controlOutletLimitRaw(id,sid){if(sid==null)sid=controlCtxSid();if(sid==null||!controlRawOn('ctlOutletLimits'))return null;const ol=(loadControls()[id]||{}).outletLimits||{};const v=ol[String(sid)];return v===undefined||v===null||v===''?null:v;}
function controlLimit(id,sid){const d=controlDef(id)||{};const c=loadControls()[id]||{};const o=Number(controlOutletLimitRaw(id,sid));if(o>0)return o;const v=Number(c.limit);return v>0?v:(d.limit||0);}

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
  if(typeof controlHit==='function')controlHit(control,sid,'b');
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

// ── How the Rules tab is arranged: areas (left menu) → sub-sections. A switch not listed here
// still shows, under "More" in the area its group belongs to. ──
const CONTROL_AREAS=[
  {key:'frontdesk',icon:'🧾',title:'Front desk',groups:['Front desk'],subs:[
    ['Billing',['billReducesStock','autoIssueStdUsage','billingFeedsIncentive','billingFeedsDailySales','fyInvoiceSeries','deviceBillSeries','duplicateBillCheck','runningBills','splitService','upiQr','billArchive']],
    ['Discounts, cancellations & dues',['discountReason','discountApproval','cancelApproval','staffChangeLock','dayCloseLock','creditLimit','oldDuesAlert']],
    ['Appointments',['staffOffBlocking','apptWaitlist','bookingRequests','bookingAdvance','noShowWarn','noShowFee','lateArrival','rebookPrompt','addonSuggest','twoStaffServices','unconfirmedAlert','apptChangeLog','busyHeatmap','staffHours','patchTestWarn']],
    ['Offers, packages & loyalty',['membershipAtBilling','sessionPackages','familySharing','loyaltyPoints','giftVouchers','coupons','combos','offPeakPricing','scheduledPrices','referralReward','renewalOffer','birthdayVoucher','productSuggestions','corporateAccounts']],
    ['Counter cash',['cashDrawer','pettyCash']],
    ['Messages & privacy',['waApiSend','requireMarketingConsent','maskClientPhones','clientBalanceLink','lowRatingAlert']],
    ['Registers & sync',['fdRegisters','offlineWarning']]]},
  {key:'clients',icon:'👥',title:'Clients',groups:[],subs:[
    ['Client records',['similarClientCheck','clientFollowUps','visitGapWinback','consultForm','colourFormula','clientPrefs']],
    ['Stylists',['stylistScorecard','stylistHandover']]]},
  {key:'stock',icon:'📦',title:'Stock',groups:['Clients & stock'],subs:[
    ['Buying & receiving',['smartReorder','poReceiving','priceRiseAlert','stockRequests']],
    ['Counting & usage',['spotCheck','countVariance','usageVsStandard','stockOutWarning','expiryAlerts','slowStock']],
    ['Labels & statements',['barcodeLabels','stockStatement']]]},
  {key:'checks',icon:'🛡',title:'Entry checks',groups:['Entry checks'],subs:[
    ['Duplicates',['dupEmployee','sharedBankAccount','dupVendor','dupInvoice','sameBillNewNumber','repeatExpense','crossEntryExpense','dupAdvancePenalty','importSeen','stockTwice','doubleSaveGuard']],
    ['Wrong figures',['extraZeroCheck','modeVsBilling','dseVsBilling','depositVsBank','gstMathCheck','gstLock','idChecks','wageSenseCheck','attendanceSense']],
    ['Dates',['backdateLock','futureLock','dateSenseCheck']],
    ['Rules that stop an entry',['salaryChangeReason','negativeStockBlock','proofAboveLimit','billNeedsPo']],
    ['Overview',['dataQualityBoard']]]},
  {key:'bank',icon:'🏦',title:'Bank mapping',groups:['Bank mapping'],subs:[
    ['Import & automatic mapping',['bankAutoMapImport','bankAutoRules','ruleAutoPause','bankLearnPayees','crossOutletMap','newVendorFromNarration','vendorBankFromPayments','bankConflictWarn','bankMapTour']],
    ['Matching help',['billReverseMatch','billComboMatch','bankReversalPairs','ownTransferPairs','loanEmiSplit','fdLines','bankChargeGst','aggregatorPayoutCheck']],
    ['Checks & flags',['bankDupWarning','bankExceptions','bankBalanceCheck','mdrCheck','bankGstinCheck','statutoryBankCheck','bankRecurringWatch','newPayeeAlert','roundOddFlags','pettyCashCheck','vagueNatureReason']],
    ['Review, approval & locks',['mapApproval','mapReview','mapRoleLimits','bankLockFinal','tallyNeedsReview','tallyChangeGuard','bankBigChangeAlert','bankAuditorView']],
    ['Dashboards & reminders',['bankAgeingBoard','mappingSla','bankUnmappedNudge','bankDailyDigest','bankOnePagerReminder','cashForecastAlert']]]},
  {key:'staff',icon:'💼',title:'Salary & staff',groups:['Employees','Data entry'],subs:[
    ['Employees',['aadhaarRequired','phoneCheckin','paidLeave','leaveRequests','staffIncentiveView','empStatement']],
    ['Pay changes',['salaryRevisions','salaryArrears']],
    ['Salary Working tools',['payHold','payOneOffs','payOvertime','payLateEarly','payLeaveEncash','payFnF','paySplit','payProvisions','payChangePreview']],
    ['Incentive Working tools',['incRulesGuide','incTracker','incSimulator','incTeam','incFeedback','incClawback','incCap','incFloor','incMixCheck']],
    ['Incentive Working view',['incSimpleView','incBreakdown','incProgress','incWhyZero','incSourceLabel','incDeltaLM','incStatement','incPools','incTieOut']],
    ['Incentive calculation',['incProRata','incProgressive','incCompWeight','incRoundTotal']],
    ['Incentive Plan',['ipWords','ipPeriod','ipDiff','ipGroups','ipTimeline','ipDrift','ipInUse','ipWizard','ipCost','ipChecklist','ipNotes','ipStaffSheet','ipStaffPhone','ipReminder']],
    ['Both sheets',['payMakerChecker','payChangeLog','payCompare','payBudget','payYearly']],
    ['Advances — giving',['advanceRecoveryPlan','advanceNetFloor','advEligibility','advServiceLimit','advOneOpen','advPhoneRequest','advAck']],
    ['Advances — recovering',['advPullConfirm','advPullNote','advSkipMonth','advChangePlan','advPartRecovery','advRepaid','advSplit','advLeavers']],
    ['Advances — reports & accounts',['advStatement','advRegister','advOverdue','advTieOut','advTally','advFee','advWriteOff']],
    ['Full workings Excel',['payWorkbooks','payWbChooser','payWbPools','payWbWhatIf','payWbPayslips','payWbBank','payWbStatutory','payWbCompare','payWbCtc','payWbExceptions','payWbReco','payWbTrail','payWbIntegrity','payWbAllOutlets','payWorkbookEmail','payWbProtected']]]},
  {key:'close',icon:'✅',title:'Approvals & month close',groups:['Approvals','Month close','Alerts','Reminders'],subs:[
    ['Approvals',['poApproval','invoiceApproval','bankFileApproval','deleteApproval','vendorBankApproval','paymentRun']],
    ['Month close',['monthFinalRule','monthFinalNeedsMapping','collRecoNeedsMapping']],
    ['Alerts & reminders',['payablesDueAlert','bankRecoAlert','budgetAlert','missingSalesBanner']]]},
  {key:'ctl',icon:'🎛',title:'Controls page',groups:['Controls page'],subs:[
    ['Seeing what’s set',['ctlOutletView','ctlCompare','ctlHealth','ctlLinks','ctlShowMe']],
    ['History & safety',['ctlLastChanged','ctlHistory','ctlOwnerAlert','ctlTwoPerson','ctlLocks']],
    ['Easier to manage',['ctlSets','ctlCopyOutlet','ctlOutletLimits','ctlTemporary','ctlRoleRules']],
    ['Checking rules work',['ctlHitStats','ctlWhatsNew','ctlExport']]]},
  {key:'app',icon:'🎨',title:'App & look',groups:['App','Look & feel'],subs:[
    ['App',['roleHomeScreens','appInstallPrompt','phoneQuickAdd','geminiModelList']],
    ['Look & feel',['dmyDates','compactToolbars','todayStrip','filterChips','keyboardShortcuts','mobileLayout','calendarPolish','billPrintDesign','miniCharts','undoActions']]]}];
// Rules that stop someone from saving, and rules that send the action for approval — shown as labels.
const CONTROL_STOPS=new Set(['advPullConfirm','ipWizard','ipChecklist','payMakerChecker','advServiceLimit','aadhaarRequired','ctlTwoPerson','ctlLocks','backdateLock','futureLock','salaryChangeReason','negativeStockBlock','proofAboveLimit','dupInvoice','billNeedsPo','gstLock','dayCloseLock','staffChangeLock','creditLimit','discountReason','staffOffBlocking','requireMarketingConsent','bankLockFinal','tallyChangeGuard','mapRoleLimits','vagueNatureReason','monthFinalRule','monthFinalNeedsMapping','collRecoNeedsMapping']);
const CONTROL_APPROVAL=new Set(['advWriteOff','mapApproval','mapReview','tallyNeedsReview','discountApproval','cancelApproval','poApproval','invoiceApproval','bankFileApproval','deleteApproval','vendorBankApproval']);
// [{area, subs:[{title, defs}]}] for every switch in CONTROL_DEFS — nothing is left out.
function controlLayout(){
  const placed=new Set();const out=CONTROL_AREAS.map(a=>({...a,list:a.subs.map(([t,ids])=>({title:t,defs:ids.map(id=>{const d=controlDef(id);if(d)placed.add(id);return d;}).filter(Boolean)}))}));
  CONTROL_DEFS.filter(d=>!placed.has(d.id)).forEach(d=>{const a=out.find(x=>x.groups.includes(d.group))||out[out.length-1];let m=a.list.find(x=>x.title==='More');if(!m){m={title:'More',defs:[]};a.list.push(m);}m.defs.push(d);});
  out.forEach(a=>{a.list=a.list.filter(x=>x.defs.length);a.all=a.list.flatMap(x=>x.defs);});
  return out.filter(a=>a.all.length);
}

// The Master Settings → 🎛 Controls page itself is in js/52-controls-plus.js.
// Strip shown to a Super Admin on every page while requests wait.
function PendingApprovalsStrip({salons,onOpen}){
  const h=React.createElement;const u=currentSessionUser();
  if(typeof CtlAlertStrip==='function'&&u&&(isSuperAdminUser(u)||u.role==='Salon Owner')){const x=h(CtlAlertStrip,{onOpen});if(!isSuperAdminUser(u))return x;
    const n0=loadApprovals().filter(a=>a.status==='pending').length;if(!n0)return x;
    return h('div',null,x,h('div',{style:{background:'rgba(224,165,48,0.12)',border:'1px solid rgba(224,165,48,0.4)',borderRadius:'var(--r)',padding:'8px 12px',marginBottom:12,fontSize:12.5,display:'flex',alignItems:'center',gap:10}},
      h('span',null,'⏳ ',h('b',null,n0),' request'+(n0===1?'':'s')+' waiting for your approval'),onOpen&&h('button',{className:'btn btn-ghost btn-sm',onClick:onOpen},'Open approvals')));}
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
