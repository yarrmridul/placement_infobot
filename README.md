# Placement Reminder & Prep Mailer (Google Apps Script)

This Google Apps Script automates placement preparation emails using data from a Google Sheet.

## 📌 What It Does
- Per-Company Reminders  
  Sends emails 15 days and 10 days before each company’s placement date.  
  Subject:  
  <Company> is coming on <Date> (15 days/10 days)  
  Body includes: Company, Role(s), Approx Salary, Placement Date, and “Start prep”.

- Monthly Roundup  
  On the 2nd and 15th of every month at 6:00 PM IST, sends a summary email with all companies coming in the next month.  
  Styled HTML table with Company, Package, Date, Role(s).  
  Subject:  
  Next month company prep

## ⚙️ Setup
1. Create a Google Sheet with columns:  
   A: Company | B: Package | C: Date | D-F: Roles  
2. Open Apps Script from the Sheet, paste the code, and update config (Sheet ID, recipients).  
3. Run `installAutomation()` once → it will auto-create triggers:  
   Daily 9 AM IST → per-company reminders  
   2nd & 15th, 6 PM IST → monthly roundup  

## 🛠️ Stack
Google Apps Script  
GmailApp API (for emails)  
Google Sheets API (for data)  

## 📄 License
MIT License
