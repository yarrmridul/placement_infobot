/***********************
 *  CONFIGURATION
 ***********************/
const SHEET_ID   = '1mBd-gBg3hrptYOzA4rtZknyYKXBn4w0nKK-Rg1wJ2SQ'; // <-- your Sheet ID
const SHEET_NAME = 'Sheet1';                                       // <-- your tab name
const TZ         = 'Asia/Kolkata';

// Email settings
const RECIPIENTS  = 'mridulagrawal06@gmail.com,parthkothawade2310@gmail.com';
const SENDER_NAME = 'god'; // Display name; "from" = your signed-in Gmail or alias

/***********************
 *  ONE-TIME INSTALL
 *  Creates all triggers (no manual trigger setup needed).
 ***********************/
function installAutomation() {
  // Clean old triggers for a fresh install
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction && t.getHandlerFunction();
    if (['runDailyReminders', 'sendNextMonthRoundup_2nd', 'sendNextMonthRoundup_15th'].includes(fn)) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Daily 9 AM IST: per-row 15/10 day reminders
  ScriptApp.newTrigger('runDailyReminders')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();

  // Monthly 2nd at 6 PM IST: roundup
  ScriptApp.newTrigger('sendNextMonthRoundup_2nd')
    .timeBased()
    .onMonthDay(2)
    .atHour(18)
    .create();

  // Monthly 15th at 6 PM IST: roundup
  ScriptApp.newTrigger('sendNextMonthRoundup_15th')
    .timeBased()
    .onMonthDay(15)
    .atHour(18)
    .create();
}

/***********************
 *  DAILY REMINDERS (UPDATED SUBJECT & BODY)
 *  Sends emails exactly 15 or 10 days before date in column C.
 *  Uses Sent15 / Sent10 columns to avoid duplicates.
 ***********************/
function runDailyReminders() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" not found`);

  // Ensure Sent15 / Sent10 columns exist
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  let sent15Col = header.indexOf('Sent15');
  let sent10Col = header.indexOf('Sent10');
  if (sent15Col === -1) { sh.getRange(1, header.length + 1).setValue('Sent15'); sent15Col = header.length; }
  const header2 = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (sent10Col === -1) { sh.getRange(1, header2.length + 1).setValue('Sent10'); sent10Col = header2.length; }

  const values = sh.getDataRange().getValues();

  // Date-only "today" in IST
  const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const today = new Date(todayStr);

  // Re-read headers in case we just appended
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const c15 = hdr.indexOf('Sent15');
  const c10 = hdr.indexOf('Sent10');

  for (let r = 1; r < values.length; r++) {
    const row = values[r];

    const company = trim_(row[0]); // A
    const pkg     = trim_(row[1]); // B
    const dateVal = row[2];        // C (Date)
    const roles   = [row[3], row[4], row[5]].map(trim_).filter(Boolean).join(', '); // D/E/F

    if (!company || !(dateVal instanceof Date)) continue;

    // Normalize event date to date-only (IST)
    const eventStr = Utilities.formatDate(dateVal, TZ, 'yyyy-MM-dd');
    const eventDay = new Date(eventStr);
    const eventLabel = Utilities.formatDate(eventDay, TZ, 'EEE, d MMM, yyyy'); // e.g., Wed, 1 Oct, 2025

    const diffDays = Math.ceil((eventDay - today) / (1000 * 60 * 60 * 24));
    const is15 = diffDays === 15;
    const is10 = diffDays === 10;

    const already15 = trim_(row[c15]);
    const already10 = trim_(row[c10]);

    if ((is15 && !already15) || (is10 && !already10)) {
      const days = is15 ? 15 : 10;

      // UPDATED SUBJECT: "<Company> is coming on <Date> (15 days|10 days)"
      const subject = `${company} is coming on ${eventLabel} (${days} days)`;

      // UPDATED BODY (no emojis; includes Approx Date)
      const html = buildReminderHtml_({
        company,
        role: roles || 'N/A',
        pkg: pkg || 'N/A',
        daysLeft: days,
        eventLabel
      });

      GmailApp.sendEmail(
        RECIPIENTS,
        subject,
        'Your email client does not support HTML.',
        { htmlBody: html, name: SENDER_NAME }
      );

      const stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
      if (is15 && !already15) sh.getRange(r + 1, c15 + 1).setValue(stamp);
      if (is10 && !already10) sh.getRange(r + 1, c10 + 1).setValue(stamp);
    }
  }
}

/***********************
 *  MONTHLY ROUNDUP (UNCHANGED)
 *  Sends at ~6 PM IST on the 2nd and 15th of EVERY month:
 *  Table of ALL companies whose date in column C falls in NEXT month.
 *  Subject: "Next month company prep"
 ***********************/
function sendNextMonthRoundup_2nd()  { sendNextMonthRoundup_(); }
function sendNextMonthRoundup_15th() { sendNextMonthRoundup_(); }

function sendNextMonthRoundup_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" not found`);
  const values = sh.getDataRange().getValues();

  // Next month [start, end)
  const today    = dateOnly_(new Date());
  const nmStart  = firstDayOfNextMonth_(today);
  const nmEnd    = firstDayAfterMonth_(nmStart);

  const items = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const company = trim_(row[0]); // A
    const pkg     = trim_(row[1]); // B
    const dateVal = row[2];        // C (Date)
    const roles   = [row[3], row[4], row[5]].map(trim_).filter(Boolean).join(', '); // D/E/F

    if (!company || !(dateVal instanceof Date)) continue;

    const event = dateOnly_(dateVal);
    if (event >= nmStart && event < nmEnd) {
      items.push({ company, date: event, role: roles || 'N/A', pkg: pkg || 'N/A' });
    }
  }

  const subject    = 'Next month company prep';
  const monthLabel = Utilities.formatDate(nmStart, TZ, 'MMMM yyyy');
  const html       = buildRoundupHtml_(monthLabel, items);

  GmailApp.sendEmail(
    RECIPIENTS,
    subject,
    'Your email client does not support HTML.',
    { htmlBody: html, name: SENDER_NAME }
  );
}

/***********************
 *  HTML BUILDERS
 ***********************/
// Reminder email (no emojis; adds Approx Date)
function buildReminderHtml_({ company, role, pkg, daysLeft, eventLabel }) {
  return `
  <div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px">
    <div style="max-width:640px;margin:auto;background:#ffffff;border-radius:14px;box-shadow:0 6px 24px rgba(18,38,63,.08);overflow:hidden">
      <div style="padding:24px 28px;border-bottom:1px solid #eef2f7">
        <h1 style="margin:0;font-size:22px;line-height:1.3;color:#111827;">Heyy guysssss!</h1>
        <p style="margin:8px 0 0;font-size:15px;color:#374151;">
          Be ready! <strong>${esc_(company)}</strong> is coming in <strong>${daysLeft} days</strong>.
        </p>
      </div>
      <div style="padding:22px 28px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px;color:#111827">
          <tr>
            <td style="padding:6px 0;width:140px;color:#6b7280">Role</td>
            <td style="padding:6px 0"><strong>${esc_(role)}</strong></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280">Approx Salary</td>
            <td style="padding:6px 0"><strong>${esc_(pkg)} LPA</strong></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280">Approx Date</td>
            <td style="padding:6px 0"><strong>${esc_(eventLabel)}</strong></td>
          </tr>
        </table>
        <div style="margin-top:18px;padding:14px 16px;background:#eef6ff;border:1px solid #dbeafe;border-radius:10px">
          <strong style="display:block;margin-bottom:6px;">Start prep</strong>
          You’ve got this — let’s go!
        </div>
      </div>
      <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #eef2f7;font-size:12px;color:#6b7280">
        Sent via Placement Bot • ${new Date().toLocaleString('en-IN', { timeZone: TZ })}
      </div>
    </div>
  </div>`;
}

// Monthly roundup (unchanged)
function buildRoundupHtml_(monthLabel, items) {
  const rows = items
    .sort((a, b) => a.date - b.date)
    .map(it => {
      const d = it.date.toLocaleDateString('en-IN', {
        timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', weekday: 'short'
      });
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;"><strong>${esc_(it.company)}</strong></td>
          <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;">${d}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;">${esc_(it.role)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;">${esc_(it.pkg)} LPA</td>
        </tr>`;
    }).join('');

  const tableBody = rows || `
    <tr>
      <td colspan="4" style="padding:16px 12px;color:#6b7280;text-align:center;border:1px dashed #e5e7eb;border-radius:8px">
        No companies scheduled next month.
      </td>
    </tr>`;

  return `
  <div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px">
    <div style="max-width:760px;margin:auto;background:#ffffff;border-radius:14px;box-shadow:0 6px 24px rgba(18,38,63,.08);overflow:hidden">
      <div style="padding:24px 28px;border-bottom:1px solid #eef2f7">
        <h1 style="margin:0;font-size:22px;line-height:1.3;color:#111827;">
          Next Month • ${esc_(monthLabel)}
        </h1>
        <p style="margin:8px 0 0;font-size:14px;color:#374151;">
          Here’s the complete list of companies expected next month.
        </p>
      </div>
      <div style="padding:18px 22px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;color:#111827">
          <thead>
            <tr style="background:#f9fafb">
              <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Company</th>
              <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Date</th>
              <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Role</th>
              <th align="left" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Approx Salary</th>
            </tr>
          </thead>
          <tbody>
            ${tableBody}
          </tbody>
        </table>
      </div>
      <div style="padding:14px 28px;background:#fafafa;border-top:1px solid #eef2f7;font-size:12px;color:#6b7280">
        Sent via Placement Bot • ${new Date().toLocaleString('en-IN', { timeZone: TZ })}
      </div>
    </div>
  </div>`;
}

/***********************
 *  DATE/UTIL HELPERS
 ***********************/
function trim_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
function dateOnly_(d) {
  const s = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  return new Date(s);
}
function firstDayOfNextMonth_(d) {
  const dt = dateOnly_(d);
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 1);
}
function firstDayAfterMonth_(firstOfMonth) {
  return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 1);
}
function esc_(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
