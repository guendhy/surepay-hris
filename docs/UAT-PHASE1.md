# UAT checklist — Phase 1 (Foundation & Leave)

Run on **staging** with demo data (`npm run seed:demo`). Tick each item and note the tester and date. Logins are printed by the seed script.

| # | Test | Who | Expected | ✔ |
|---|---|---|---|---|
| **Sign-in & security** |||||
| 1 | Sign in as an employee (e.g. Carlo Mendoza) | Employee | Dashboard opens; no MFA prompt | |
| 2 | Sign in as the HR Manager (Liza Santos) | HR | Asked to set up an authenticator app; after the code, dashboard opens with HR overview | |
| 3 | Leave the browser idle for 15 minutes | Any | Signed out automatically | |
| 4 | As an employee, open `/hr/employees` | Employee | "You don't have access" page | |
| 5 | Sign in with a wrong password | Any | Generic error, no hint whether the email exists | |
| **201 records** |||||
| 6 | Add a new probationary employee | HR | Employee number SPT-YYYY-#### and regularisation due date (+6 months) are set | |
| 7 | Add government IDs; reveal the TIN | HR | Only last 4 digits shown; reveal shows full number; audit log shows `view.government_id_revealed` | |
| 8 | Set compensation with a reason | HR | Salary history row created | |
| 9 | Upload a PDF with an expiry date | HR | Document listed; opens via link | |
| 10 | Change an employee's supervisor | HR | History tab shows "Supervisor change" | |
| 11 | Send an invitation | HR | Email received; after setting a password the employee is linked | |
| 12 | Update own mobile number | Employee | Saved; HR sees the new value | |
| **Leave filing** |||||
| 13 | File VL Mon–Fri next month | Employee | Preview shows 5 days and remaining balance; submit succeeds | |
| 14 | File VL over a week with a regular holiday | Employee | Holiday not counted | |
| 15 | File more VL than available | Employee | Blocked with "Insufficient … balance" | |
| 16 | File overlapping dates | Employee | Blocked | |
| 17 | File SL for 3 days without attachment | Employee | Blocked: supporting document required; succeeds with attachment | |
| 18 | File Paternity Leave as a female employee | Employee | Blocked: eligibility | |
| 19 | File a half day (AM) | Employee | 0.5 day | |
| **Approvals** |||||
| 20 | Supervisor approves request #13 | Supervisor | Moves to department head | |
| 21 | Department head approves | Dept head | Status Approved; balance reduced; employee notified | |
| 22 | Reject without a comment | Supervisor | Blocked; with comment → Rejected | |
| 23 | Bulk-approve two requests | Supervisor | Both approved | |
| 24 | Supervisor sets a delegation, then an employee files | Supervisor | New task goes to the delegate | |
| 25 | Employee cancels approved future leave | Employee | Cancelled; balance restored | |
| 26 | HR cancels a started leave with a reason | HR | Cancelled; balance restored | |
| **HR tools** |||||
| 27 | Leave balances → Export to Excel | HR | XLSX downloads; audit log shows `export.leave_balances` | |
| 28 | Post an opening balance adjustment | HR | Ledger entry with reason | |
| 29 | Try to adjust your own balance | HR | Blocked | |
| 30 | Edit a leave type's credit; run accruals | HR | New credits appear | |
| 31 | Mark a holiday verified; add a local holiday | HR | Saved | |
| 32 | Create a flow for Maternity Leave → HR Manager | HR | Maternity requests route to HR | |
| 33 | Publish an announcement to one department | HR | Only that department sees it | |
| **Admin & audit** |||||
| 34 | Grant HR Staff to a user | Admin | Role appears; user is asked for MFA at next sign-in | |
| 35 | Try to grant yourself a role | Admin | Not possible | |
| 36 | Set an employee to Separated | HR | Their login stops working | |
| 37 | Open Audit log as Auditor | Auditor | Entries visible, read-only | |

Sign-off: HR Manager ____________  IT / ISMS ____________  Date ________
