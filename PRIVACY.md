# Privacy Policy for Clarity Finance

**Last updated: November 6, 2026**

Clarity Finance ("Clarity", "we", "our") is designed with a strict privacy-first architecture. We believe your personal financial data belongs solely to you.

## 1. Data Collection & Local Storage
- **Local On-Device Storage**: All accounts, transactions, budget plans, debts, and goals are stored locally on your device within the application's private SQLite database sandbox.
- **No Third-Party Analytics / Tracking**: Clarity does not sell, rent, monetize, or track your personal or financial data.
- **No External Data Transmission**: Your transaction records, balances, and financial activities never leave your phone unless you explicitly choose to backup your data to your private Google Drive account.

## 2. Financial Notification Processing (Notification Access)
- **Scope & Purpose**: With your explicit consent via Android **Notification Access** (`BIND_NOTIFICATION_LISTENER_SERVICE`), Clarity reads incoming push notifications strictly from a curated allowlist of banking and UPI apps (e.g., Google Pay, PhonePe, Paytm, CRED, HDFC, SBI, ICICI, Axis) to automatically extract financial transactions and upcoming bill reminders.
- **Strictly On-Device Analysis**: All notification parsing, categorization, and extraction are performed **100% locally on your device** using offline deterministic parsers.
- **Personal Messages Excluded**: Messaging apps (such as SMS/MMS apps, WhatsApp, and personal chats) are explicitly excluded at the native Android service level—Clarity never inspects personal conversations or OTP messages.
- **No Notification Uploading**: Notification titles, text, and metadata are never transmitted, uploaded, or exposed to any remote server or third-party service.
- **Opt-in & Revocation**: You can pause auto-tracking inside Clarity or revoke Notification Access at any time via Android system settings without losing access to manual tracking or statement import.

## 3. Google Drive Cloud Backup
- If you choose to connect **Google Drive**, Clarity utilizes the secure `drive.appdata` scope to create and store private database backups (`clarity_backup.json`).
- **Private Application Folder**: Your backup files are stored exclusively in your own private Google Drive application space, completely isolated from your public or personal Drive files.
- **No Developer Access**: The developers of Clarity cannot access, view, or transfer your Google Drive backup files. Data transfers directly and securely between your device and Google's servers.

## 4. Permissions Summary
- **Notification Access (`BIND_NOTIFICATION_LISTENER_SERVICE`)**: Used exclusively to detect and record financial transactions and bill due dates from whitelisted banking/UPI app notifications on-device.
- **Biometric Authentication (`USE_BIOMETRIC`, `USE_FINGERPRINT`)**: Used locally on your device to lock and unlock the app. Biometric credentials never leave your device hardware keystore.
- **Microphone (`RECORD_AUDIO`)**: Used only when you explicitly invoke voice transaction entry.
- **Internet Access**: Used solely for Google Drive backup synchronization, remote feature flags, and push notifications.
- **Notifications**: Used to deliver timely bill payment reminders and budget limit warnings to your device.

## 5. Contact
For any questions regarding privacy or data handling, please contact the developer at dhamanidhamani001@gmail.com.
