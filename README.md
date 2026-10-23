# Animal Welfare Management System — AGTech Starter

Provisional organisation name: **Sporsho (Touch the Animals)**. The app name is configurable. Branding includes **AGTech Solutions** copyright.

## Included
- Android Studio WebView wrapper project (`android/`)
- Mobile-first app UI with login-by-email OTP flow, dashboard, module navigation, forms, report/print view, notes/prescription print layout, and offline submission queue
- Google Apps Script backend starter (`apps_script/Code.gs`) for a Google Sheets database stored in Drive, role checks, OTP email verification, audit logging, and CRUD starter actions
- Data dictionary (`docs/DATA_DICTIONARY.md`)

## Important status
This is a **starter source project, not a compiled or tested APK**. The current environment does not have Android SDK/build tools installed. Import the `android/` folder into Android Studio, set up the Android SDK, and build the APK after configuring the backend endpoint.

The backend must be deployed and tested in the organisation's Google account. Do not use the starter with real donor, financial, medical, or personal data until authentication, access rules, backups, and recovery have been tested.

## Setup overview
1. Create a Google Sheet in the organisation's Google Drive. Open Extensions → Apps Script from that sheet and paste `apps_script/Code.gs`.
2. Run `setupDatabase()` once and authorise it. In the `Users` tab, add the administrator email with role `Admin` and Active `TRUE`. Add other users with roles `Stock`, `Finance`, or `Volunteer`.
3. Deploy the Apps Script as a Web App, executing as the deploying account. Configure access to permit the intended users to reach the web app; the app still checks the email allowlist and OTP. Copy the `/exec` URL.
4. In `android/app/src/main/assets/index.html`, replace `__APPS_SCRIPT_URL__` with the deployed URL.
5. Open the `android/` folder in Android Studio, install the required SDK/platform, then build and test a debug APK on a test device.
6. Test every role, offline queue, duplicate submission handling, financial posting, PDF printing, and recovery from sync errors before production.

## Google Drive / Excel note
The live database is a Google Sheets workbook in Drive, which Apps Script can update reliably. It can be downloaded/exported as Excel (.xlsx). Editing a binary Excel file directly in Drive is not a good live multi-user database design; the recommended workflow is Google Sheets as the source of truth and XLSX exports for sharing/archiving.

## Current limitations
- The source project has not been compiled or tested on a device.
- The Apps Script is a starter and does not yet implement full double-entry accounting, all approvals, complete stock ledger validation, file attachment uploads, or production-grade PDF generation.
- OTP delivery uses Apps Script MailApp and is subject to Google quotas and deployment settings.
- Offline records remain pending until a network connection and backend are available. Users must open the app or press Sync Now; background sync is not guaranteed.
- Native APK signing, production OAuth verification, backups, data-retention policy, and final role-permission review are still required.

## Optional APK build through GitHub Actions
A workflow is included at `.github/workflows/build-apk.yml`. Upload this project to a GitHub repository, then open **Actions → Build Android APK → Run workflow**. When the workflow completes, download the `AnimalWelfare-AGTech-debug-apk` artifact. This is a debug build for testing, not a production-signed release. Configure the backend URL first and test on a device before using it.
