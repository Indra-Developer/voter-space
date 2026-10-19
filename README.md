# Voter Space

Telugu-first voter operations app built with React, TypeScript, Tailwind CSS, Firebase Authentication, Firestore, Cloud Storage, and Cloud Functions.

## Run the app locally

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example` before you sign in.

## Module 1: App shell

- Fixed desktop sidebar and mobile bottom navigation
- Telugu / English language choice
- Green, sky-blue, and dark themes
- Profile and Admin-banner ready display
- Loading, empty, and error states

## Module 2: Login and user permissions

The login screen deliberately shows three choices:

- **Super Admin login** — full control
- **Admin login** — allowed wards and their own Sub-members
- **Sub-member login** — assigned ward and booth only

The choice is not a security permission by itself. Firebase signs in with email and password, then the app checks the protected role in `users/{uid}`. An Admin account cannot enter through the Super Admin choice.

### Account controls

- Super Admin can create Admins and Sub-members, set their login passwords directly, edit accounts, change permissions, enable or disable access, and view all accounts. Admins can create Sub-members and set their login passwords directly.
- Admin can create and edit only their own Sub-members. The Cloud Function stops them from making Admins, changing permissions, or assigning a ward/booth outside their scope.
- Sub-members cannot create accounts.
- Admin banner is supported only for Admin profiles. Profile photos are supported for both Admins and Sub-members.

### Firebase files included

- `functions/src/index.ts` — protected account create/update Cloud Functions
- `firestore.rules` — Firestore role and ownership rules
- `storage.rules` — profile/banner image rules
- `firestore.indexes.json` — Admin Sub-member list index

## Firebase first-time setup

1. In Firebase Console, enable **Email/Password** under Authentication.
2. Create the Firestore database and Cloud Storage bucket.
3. Create the very first Super Admin manually in **Authentication → Users**. Copy its UID.
4. In **Firestore Database**, create `users/{that UID}`. Add these fields:

```text
fullName: "Your name"
email: "your-login-email@example.com"
mobile: "your mobile number"
role: "superAdmin"
status: "active"
scope: { wardIds: [], boothIds: [] }
permissions: { upload: true, edit: true, download: true, audit: true }
createdBy: "bootstrap"
```

Set the first Super Admin password in the Firebase Authentication user form, not in Firestore. Firebase Console writes bypass the app rules, so this first setup is allowed. After that, create every other account from Voter Space.

## Deploy the protected backend

From the `voter-space-react` folder:

```bash
npm --prefix functions install
npm --prefix functions run build
npx firebase-tools login
npx firebase-tools use voterspace-c9aef
npx firebase-tools deploy --only functions,firestore:rules,firestore:indexes,storage
```

New Admin and Sub-member accounts receive their login password directly from the account form. Passwords are sent to Firebase Authentication only and are never stored in Firestore. The email address is still required because it is the Firebase login name.

## Module 3: Voter Register

- Search and filters for door, voter ID, serial number, ward, booth, area, division, PDF source, review state, upload date, and uploader.
- Door-wise and individual record views.
- Excel, PDF, and CSV exports of only the currently filtered and permitted records.
- Voter mobile number and alternate identifier fields.
- Voter data is returned through protected Cloud Functions; the browser cannot bypass a Sub-member's ward/booth scope.

## Module 4: PDF Import

- Multiple PDF selection with filename-based ward/booth detection and manual correction.
- Resumable upload progress, pause/resume, retry, and safe server-side OCR retry.
- Protected source-PDF list, OCR review rows, duplicate detection, and Super Admin approval.
- The voter identity is the Voter ID first, or a reviewed alternate identifier. Ward/booth changes update that voter instead of creating another record.
- A mobile number is updated only when the incoming PDF/review row contains a valid new number. A blank PDF field never removes a stored mobile number.
- Firebase Functions Gen 2 task queues run the OCR and register-update work in the background with retries and controlled concurrency.

### One-time OCR setup before deploying

1. In Google Cloud Console for `voterspace-c9aef`, enable **Cloud Vision API** and **Cloud Tasks API**.
2. Ensure the service account used by the deployed Functions can read the source bucket and create OCR output objects. Cloud Vision PDF OCR writes JSON output into the same Storage bucket.
3. The included Storage-trigger function is configured for this project's **asia-south1** bucket. If you create a different bucket location later, change `storageEventRegion` in `functions/src/index.ts` before deployment.
4. Deploy again:

```bash
npx firebase-tools deploy --only functions,firestore:rules,firestore:indexes,storage
```

Cloud Vision PDF OCR has service limits, including a maximum of 2,000 pages per PDF. The app does not impose an artificial number-of-files limit: it uses three concurrent uploads and paged review rows to stay stable. Original PDFs are preserved; the app does not use lossy PDF compression.

## Module 5: PDF Library, tasks, reports, and audit history

- **PDF Library** lists only PDFs inside the signed-in user's permitted ward and booth scope. It includes PDF-name, ward, booth, area, and status filters.
- The original PDF is downloaded using a ten-minute server-authorized link. Storage stays private: the backend checks the user's role, scope, and Download permission first.
- **Excel, PDF, and CSV reports** export only the filtered Library result. Voter Register exports remain filtered in the same way.
- **Daily Tasks** are live work items based on PDF import status: failed OCR, import review, Super Admin approval, voter records needing review, and active processing.
- **Audit Logs** show all activity to Super Admins. An Admin sees only their own activity when the Super Admin turns on the new **Own audit activity** permission.
- `firestore.indexes.json` now contains the audit-log index. Deploy it with Functions and rules.
