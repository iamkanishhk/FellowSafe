# Women's 
Safety App — Hackathon PRD

## 1. Product Goal

Build an Android safety app that allows a woman to trigger an SOS in seconds and immediately:

* Alert all registered trusted contacts.
* Share her live location.
* Show an emergency UI on trusted contacts' phones.
* Allow trusted contacts to acknowledge the alert and respond.
* Allow the user to end the SOS when she is safe.

---

# 2. Tech Stack

### Mobile

* React Native
* Expo
* TypeScript
* Expo Router

### Backend

* Node.js
* Express
* REST API
* WebSocket / Socket.IO for realtime updates

### Database

* Neon PostgreSQL

### Authentication

* Clerk

### Notifications

* Firebase Cloud Messaging (FCM)
* `expo-notifications`

### Location

* `expo-location`
* Android foreground/background location service

### Maps

* Google Maps

### Emergency UI

* React Native emergency screen
* Android native Full-Screen Intent for the hackathon where supported
* High-priority notification as fallback

### Build

* Expo Development Build
* EAS Build

---

# 3. User Roles

### Primary User

The woman using the app.

### Trusted Contact

Family member/friend who receives SOS alerts.

---

# 4. Main User Flow

```text
Sign Up/Login
     ↓
Grant Permissions
     ↓
Add Trusted Contacts
     ↓
Home
     ↓
 ┌──────────────┐
 │              │
SOS          Safe Trip
 │              │
 ↓              ↓
Emergency      Journey
Session        Tracking
 │              │
 ↓              ↓
Alert          Check-in
Contacts        │
 │         ┌────┴─────┐
 ↓         ↓          ↓
Live      Safe     No Response
Location    │          │
 │          │          ↓
 ↓          │       Alert Contact
Contact     │
Responds    │
 │          │
 ↓          ↓
     SOS / Trip Resolved
```

---

# 5. Authentication

Use Clerk.

### Requirements

* Google Login
* Logout
* User profile
* Phone + OTP verification

---

# 6. Trusted Contacts

User can add 3–5 trusted contacts by accessing contact permissions

### Contact fields

* Name
* Phone number

Example:

```text
Mom
+91 XXXXX XXXXX
```

Contacts are used as the recipients of SOS alerts.

---

# 7. Home Screen

The home screen should be extremely simple.

### Main components

* User greeting
* Large SOS button
* "Hold to activate"
* Safe Trip
* Trusted Contacts
* Settings

The SOS button should be the most prominent element.

---

# 8. SOS Activation

User **holds the SOS button**.

### Flow

```text
Hold SOS
   ↓
Short activation countdown
   ↓
SOS ACTIVE
```

Once activated:

1. Create SOS session.
2. Start location tracking.
3. Notify all trusted contacts.
4. Show SOS active screen.
5. Begin sending live location updates.

No additional confirmation should be required after activation.

---

# 9. SOS Session

Each SOS creates a unique session.

```text
SOS ID
User ID
Status
Start time
End time
Last location
Battery
```

### Status

```text
ACTIVE
RESOLVED
```

---

# 10. Live Location

During an active SOS:

```text
SOS
 ↓
Android location service
 ↓
Node.js
 ↓
Trusted contact
```

Location data:

* Latitude
* Longitude
* Accuracy
* Timestamp
* Battery
* Speed/heading if available

Location must continue updating when:

* App is in background.
* Phone screen is locked.

Use Android foreground service/background location capabilities.

---

# 11. SOS Notification

When SOS starts, all trusted contacts receive an emergency notification.

Example:

```text
🚨 SOS ALERT

Priya has activated an emergency alert.

[VIEW EMERGENCY]
```

Notification should use:

* High priority
* Sound
* Vibration

subject to Android OS restrictions.

---

# 12. Full-Screen Emergency UI

For the hackathon, attempt to show an emergency UI on the trusted contact's Android phone even when the phone is locked.

Example:

```text
🚨 SOS ALERT

PRIYA NEEDS HELP

Emergency activated at 7:42 PM

[VIEW LOCATION]

[CALL PRIYA]

[I'M RESPONDING]
```

### Important

This requires Android-native **Full-Screen Intent** behavior.

React Native + Expo remains the main app framework, but a small amount of Android-native functionality may be required.

If full-screen UI isn't available:

```text
Push notification
      ↓
User taps notification
      ↓
React Native emergency screen
```

---

# 13. Trusted Contact Emergency Screen

The contact should see:

* User name
* SOS status
* Live map
* Last location update
* Battery
* SOS start time
* Response status

Actions:

```text
[CALL]
[VIEW LOCATION]
[I'M RESPONDING]
```

For the hackathon, **Call** can simply open the Android phone dialer. No telephony service is required.

---

# 14. Live Location Screen

Show a map with the user's current location.

Example:

```text
🚨 SOS ACTIVE

Priya

[ LIVE MAP ]

Location updated:
5 sec ago

Battery:
24%

Status:
Moving

[CALL]
[I'M RESPONDING]
```

Use Google Maps.

---

# 15. Contact Response

Trusted contact can press:

**I'm Responding**

Backend records the response.

User receives:

> **Mom has acknowledged your SOS and is responding.**

This demonstrates two-way emergency coordination.

---

# 16. End SOS

User can end the emergency.

```text
SOS ACTIVE

[I'm Safe]
```

Confirmation:

```text
End SOS?

[KEEP ACTIVE]
[YES, I'M SAFE]
```

After ending:

* Stop location tracking.
* Change SOS status to `RESOLVED`.
* Notify trusted contacts.


---

# 17. Backend Requirements

Node.js backend handles:

* Authentication verification
* Trusted contacts
* SOS creation
* SOS status
* Location updates
* FCM notifications
* Contact responses
* Realtime updates

### Core endpoints

```text
POST   /sos
GET    /sos/:id
POST   /sos/:id/location
POST   /sos/:id/respond
POST   /sos/:id/resolve

GET    /contacts
POST   /contacts
PATCH  /contacts/:id
DELETE /contacts/:id

```

---

# 19. Database

### users

```text
id
clerk_user_id
name
phone
email
created_at
```

### trusted_contacts

```text
id
user_id
name
phone
relationship
status
```

### devices

```text
id
user_id
fcm_token
platform
```

### sos_sessions

```text
id
user_id
status
started_at
ended_at
last_latitude
last_longitude
last_location_at
battery_level
```

### sos_locations

```text
id
sos_id
latitude
longitude
accuracy
recorded_at
```

### sos_responses

```text
id
sos_id
contact_id
status
responded_at
```

---

# 20. Security Requirements

* All API requests authenticated.
* Users can only access their own data.
* Trusted contacts can only access authorized emergency sessions.
* Never expose public user locations.
* Use HTTPS/WSS.
* Secure FCM/device tokens.
* Emergency links should use secure tokens.
* Don't permanently retain detailed location history unnecessarily.

---

# 21. Hackathon MVP — Build Only This

### Must Have

* [ ] Clerk authentication
* [ ] Add trusted contacts
* [ ] Home screen
* [ ] SOS button
* [ ] SOS backend
* [ ] Neon database
* [ ] FCM notification
* [ ] Emergency notification
* [ ] Full-screen Android UI attempt
* [ ] Live location
* [ ] Live map
* [ ] "I'm Responding"
* [ ] End SOS


### Don't Build

* [ ] Real telephony infrastructure
* [ ] Nearby stranger responder network
* [ ] AI threat detection
* [ ] Social network
* [ ] iOS
* [ ] Police/emergency-service integration
* [ ] Wearable integration

---

# 22. Ideal Hackathon Demo

Use **two physical Android phones**.

### Phone A

```text
Open app
↓
Hold SOS
↓
SOS ACTIVE
```

### Backend

```text
Create SOS
↓
Start location updates
↓
Send FCM
```

### Phone B

```text
Phone locked
↓
🚨 SOS ALERT
↓
Emergency UI
↓
View Live Location
```

### Phone B

```text
I'm Responding
```

### Phone A

```text
Mom is responding ✓
```

### Phone A

```text
I'm Safe
```

### Both

```text
SOS RESOLVED ✓
```

**That is the core product. Everything else is secondary.**
