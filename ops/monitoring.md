# Voter Space backend monitoring

The Functions code already writes a structured warning when a long operation takes
10 seconds or more:

`Slow Cloud Function execution`

The warning includes the function name, duration, threshold, and the related PDF
or export ID. Use these instructions once in the Google Cloud console to receive
alerts.

## 1. Function error alert

1. Open Google Cloud Console for project `voterspace-c9aef`.
2. Open **Monitoring → Alerting → Create policy**.
3. Add a metric for **Cloud Functions / Function execution count**.
4. Filter the policy to the Voter Space functions and failed executions.
5. Set the condition to alert when failures are greater than 0 for 5 minutes.
6. Add an email notification channel and name the policy `Voter Space function errors`.

For second-generation functions, the resource may be shown as a Cloud Run
revision. If so, select the Voter Space function service and use its request
error count instead.

## 2. Slow-function alert

1. In **Monitoring → Logs-based metrics**, create a counter metric from the
   text `Slow Cloud Function execution`.
2. Name it `voter_space_slow_function_count`.
3. Create an alerting policy for this metric when it is greater than 3 in
   10 minutes.
4. Add the same email notification channel.

This catches slow OCR, voter-apply, export, cleanup, and dashboard rebuild
operations without logging every normal request.

## 3. Billing and cost alert

1. Open **Billing → Budgets & alerts**.
2. Create a budget for the billing account connected to `voterspace-c9aef`.
3. Select this project and the Cloud Functions, Cloud Run, Cloud Storage,
   Firestore, and Vision services.
4. Add alerts at 50%, 80%, and 100% of the monthly budget.
5. Add the project owner email and the operational email as recipients.

Billing budgets are account-level settings. They cannot be safely created by
the Firebase Functions deployment, so this step must be completed by a billing
administrator.

## Runtime safety settings used by Module 9

- Functions and Storage events use `asia-south1`.
- OCR uses 2 GiB memory, a 30-minute timeout, one request per instance, and at
  most two OCR tasks at the same time.
- Voter application uses one request per instance and one task at a time.
- Exports use 1 GiB memory, a 30-minute timeout, and at most two tasks at once.
- Dashboard rebuilding uses one task at a time.
- OCR, apply, and export jobs use Firestore claim/lease checks before work.
- Stable voter document IDs and transactions prevent duplicate voter records.
- Retries are limited to idempotent background jobs. Storage finalization is
  safe to retry because it uses a Firestore transaction guard.

