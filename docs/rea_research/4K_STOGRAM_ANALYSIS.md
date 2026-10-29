# REA TECHNICAL ANALYSIS: 4K STOGRAM ARCHITECTURE & RETRIEVAL WORKFLOWS

**Product**: 4K Stogram (by OpenMedia LLC / InterPromo GMBH)  
**Binary Analyzed**: `C:\Program Files\4KDownload\4kstogram\4kstogram.exe` (Version 4.5.0.4430 / 4.9.0.4680)  
**Artifact Directory**: `C:\Users\rpanw\AppData\Local\4kdownload.com\4K Stogram\4K Stogram\`  
**Investigation Framework**: REA `rea-agents@6.7.0`  
**Classification**: Primary Observable Binary & Runtime Log Evidence (**`VERIFIED`**)  

---

## 1. Executive Summary

4K Stogram is a commercial desktop multimedia downloader for Windows, macOS, and Ubuntu. While marketing claims often portray it as a desktop utility seamlessly syncing Instagram feeds, our direct static binary inspection and runtime log analysis confirm that **4K Stogram operates by spoofing a legacy Android mobile device** and making direct calls to Instagram's private mobile API (`i.instagram.com/api/v1/`).

It does **not** use Meta's official Graph API or oEmbed endpoints. To access private accounts, stories, and batch subscriptions, it requires users to enter their personal Instagram credentials into the desktop client, creating severe account ban and challenge risks.

---

## 2. Binary Architecture & Dependency Manifest (`VERIFIED`)

Inspection of `C:\Program Files\4KDownload\4kstogram` reveals the complete native component stack:

| Component | Shared Library | Function / Purpose in 4K Stogram |
| :--- | :--- | :--- |
| **Main Executable** | `4kstogram.exe` (59.7 MB) | Core application logic, Qt UI host, and orchestrator |
| **GUI Framework** | `Qt5Core.dll`, `Qt5Gui.dll`, `Qt5Widgets.dll`, `Qt5Quick.dll`, `Qt5Qml.dll` | Qt 5.15 QML/C++ desktop presentation layer |
| **Network Engine** | `Qt5Network.dll` | Network event loop, HTTP socket management, proxy dispatch |
| **Transport Security** | `libssl-1_1-x64.dll`, `libcrypto-1_1-x64.dll` | OpenSSL 1.1.1 TLS/SSL implementation |
| **Media Demuxing/Decoding**| `avcodec-58.dll`, `avformat-58.dll`, `avutil-56.dll`, `swscale-5.dll`, `swresample-3.dll` | FFmpeg 4.x libraries for media stream validation, remuxing, and thumbnail extraction |
| **Metadata Tagging** | `libexif-12.dll` | Direct EXIF injection: writes captions, dates, and author metadata into JPEG headers |
| **Crash Telemetry** | `crashpad_handler.exe` | Google Crashpad minidump generator reporting to Sentry (`sentry.io/api/2687358/minidump/`) |
| **Usage Analytics** | Internal HTTP client | Analytics tracking dispatched to `http://sa.openmedia.co:8018/collect` |

---

## 3. Protocol & Emulation Engine: `openmedia.igp` (`VERIFIED`)

Analysis of runtime logs (`app_*.log`) reveals the internal architecture of 4K Stogram's Instagram communication module, designated as `igp` (**I**nsta**g**ram **P**rotocol):

### A. Android Device Spoofing
Rather than identifying as a browser or standard desktop client, 4K Stogram emulates an Android smartphone. The log explicitly records the synthesized device profile:

```json
{
  "android_id": "android-753447fd84aad9c9",
  "device_id": "d2576d79-1103-454a-8535-590f91ca9ab1",
  "device_string": "23/6.0; 640dpi; 1440x2392; LGE/lge; LG-H815; p1; p1",
  "phone_id": "2ea89ad9-05bf-4eea-ac63-197c20023a2f",
  "user_locale": "en_US"
}
```

* **Device Profile**: LG G4 (`LG-H815`), running Android 6.0 Marshmallow (`API 23`), 640 DPI display.
* **Carrier Emulation**: Emulates Zero-Rating token management via `zr_token_update_op`, maintaining carrier rewrite rules and TTL counters (`ttl: 3600`).
* **Heartbeat Update**: A background loop (`device_update_op`) awakens every 115–125 seconds to maintain Android device state.

### B. Direct Credential Login Workflow
The logs document the direct authentication sequence executed against Instagram's private mobile endpoints:

```
[info] [sdk_igd] [StogramCore] performAuth: call for '<redacted_username>'
[info] [igp] [session_...] login_op: +
[info] [igp] [session_...] Change auth state from initial to initial|operation_in_progress
[info] [igp] [session_...] login_op: quering login for user { <redacted_username> }
[info] [igp] [fetch_...] completed with ec = openmedia.igp:2, bad password
[info] [LoginViewModel] Auth callback: ec = errorBadPassword, state = not authorized
```

* 4K Stogram accepts the user's raw Instagram username and password.
* It transmits these credentials using Instagram's private Android app login request structure.
* Session cookies (`sessionid`, `csrftoken`, `ds_user_id`) are persisted locally into application settings (`SettingsViewModel`).

---

## 4. Download Queue & Execution Architecture (`VERIFIED`)

4K Stogram implements an internal queue manager designated as `HttpDownloaderQueue`:

```
[info] [downloader] [HttpDownloaderQueue_...] Set max active count 1 -> 1
[info] [downloader] [NotificationHandlingThread_...] started
[info] [downloader] [QueueHandlingThread_...] started
[info] [downloader] [HttpDownloaderQueue_...] Checking queue: state: Initial; force: no; size: 0
[info] [downloader] [HttpDownloaderQueue_...] Checking queue: state: Pending; force: no; size: 0
```

### Key Queue Characteristics:
1. **Strictly Sequential Execution (`concurrency = 1`)**:
   - `Set max active count 1 -> 1` explicitly enforces sequential downloads.
   - Concurrency is throttled to prevent triggering Instagram CDN rate limits or concurrent IP blocks.
2. **Multi-Threaded Architecture**:
   - `QueueHandlingThread`: Evaluates queued jobs, transitions states (`Initial` -> `Pending` -> `Active`), and dispatches network streams.
   - `NotificationHandlingThread`: Propagates progress updates, errors, and completion events to the Qt UI thread.
3. **Daily Event Rate Limiting**:
   - `initDailyEventsCounter`: Enforces application-level daily download caps to mitigate account flagging.

---

## 5. Account Subscriptions & Automated Sync (`DOCUMENTED`)

* **Subscription Model**: Users subscribe to an account, hashtag, or location.
* **Periodic Polling**: `StogramCore` polls the target profile at user-defined intervals (e.g. every 2 hours, 6 hours, or daily).
* **Incremental Synchronization**: Queries Instagram's user feed endpoint (`/api/v1/feed/user/{user_id}/`) using pagination cursors (`max_id`). New items are compared against the local SQLite database; only unseen media is queued for download.

---

## 6. Critical Operational Risks & Failure Modes (`DOCUMENTED` & `VERIFIED`)

1. **Checkpoint Challenges (`HTTP 400 / checkpoint_required`)**:
   - Because 4K Stogram connects from residential/commercial IP addresses using outdated Android device signatures (`LG-H815` Android 6.0), Meta's automated risk scoring frequently triggers checkpoint challenges.
   - Users are forced into in-app SMS or email two-factor verification.
2. **Account Suspension & Bans**:
   - Automated polling of feeds without official API authorization directly violates Meta Terms of Service (Section 3.2.3).
   - Heavy subscription lists lead to forced session invalidations and temporary or permanent Instagram account bans.
3. **Brittle Private Protocol Dependency**:
   - Changes by Meta to private mobile signatures, request signing (`signed_body`), or GraphQL schema break 4K Stogram updates until a new application release is issued.

---

## 7. Conclusions for Snapora Architecture

| 4K Stogram Pattern | Evaluation for Snapora | Recommendation |
| :--- | :--- | :--- |
| **Android Device Spoofing (`openmedia.igp`)** | High risk, brittle, violates platform terms | **REJECT**. Snapora must not emulate mobile clients or make unauthenticated private API calls. |
| **Direct Credential Entry** | Severe security/privacy liability; violates Zero-Credential principle | **REJECT**. Snapora strictly refuses to collect user passwords or session cookies. |
| **Sequential Queue (`concurrency = 1`)** | Proven effective at avoiding network flooding | **ADOPT**. Snapora's sequential queue (`concurrency = 1`) matches this best practice. |
| **Exif Metadata Injection (`libexif`)** | Valuable for media organization | **CONSIDER (Phase 3)**: Embedding caption and author metadata into client-side downloads. |
| **Local SQLite Persistence** | Keeps data completely local | **ADOPT (IndexedDB)**: Snapora achieves this in the browser using IndexedDB. |
