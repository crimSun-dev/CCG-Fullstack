## Purpose

Provides administrative controls to assign the Staff role, grants staff access to contact enquiries, and enables seamless single sign-on entry to CK Virtual Lab with verified name identity while preserving separate databases.

## ADDED Requirements

### Requirement: Admin assigns Staff
Any authenticated account with the ADMIN role MUST be able to view registered accounts and set or clear the STAFF role on any account other than its own.

#### Scenario: Assign Staff
- **WHEN** an authenticated ADMIN views the role management portal and marks a registered account as STAFF
- **THEN** that account's role becomes STAFF
- **AND** that account gains access to contact enquiries and CK Virtual Lab

#### Scenario: Non-admin access restricted
- **WHEN** a signed-in MEMBER, STAFF, or EDITOR account attempts to open the role assignment portal
- **THEN** access is denied
- **AND** the account list is not exposed

### Requirement: Staff can read every enquiry
A STAFF, EDITOR, or ADMIN account MUST be able to read every contact enquiry stored in the database.

#### Scenario: Staff opens enquiries
- **WHEN** a signed-in STAFF, EDITOR, or ADMIN account opens the enquiry list
- **THEN** all stored enquiries are visible
- **AND** a MEMBER account cannot open or query that list

### Requirement: The lab button is only for staff and admin
The site MUST display the supplied CK Virtual Lab image button exclusively to accounts with the STAFF, EDITOR, or ADMIN role.

#### Scenario: Member
- **WHEN** an authenticated MEMBER views their account page
- **THEN** the CK Virtual Lab image button is not displayed

#### Scenario: Staff
- **WHEN** an authenticated STAFF, EDITOR, or ADMIN account views the account or admin page
- **THEN** the supplied CK Virtual Lab image is displayed as an actionable control
- **AND** clicking the control opens CK Virtual Lab

### Requirement: The lab shows the account full name
When a STAFF, EDITOR, or ADMIN account enters CK Virtual Lab from the CCG site, the lab MUST display that account's verified full name without prompting for display name selection.

#### Scenario: Staff enters
- **WHEN** a staff account with full name "Draven Chen" opens the lab via the authenticated link
- **THEN** the lab displays "Draven Chen" as the signed-in person
- **AND** the manual name selection sheet is skipped

#### Scenario: Unauthenticated direct visitor
- **WHEN** a visitor accesses CK Virtual Lab directly without a valid lab session
- **THEN** the lab shows only a page directing them to sign in through the CCG site
- **AND** no notes, names, bookings, whiteboard strokes, or live updates are served or accepted
- **AND** no guest name can be added or picked

### Requirement: The lab is staff only
CK Virtual Lab MUST be reachable only by a STAFF, EDITOR, or ADMIN account that entered through a valid CCG assertion. Every page, asset, API call, and live connection MUST require the lab session that entry creates, and the acting person MUST be the session's person, never a name the browser supplies.

#### Scenario: Session from the hand-off
- **WHEN** a valid CCG assertion is accepted
- **THEN** the lab sets an HttpOnly session cookie bound to that account's person record
- **AND** the session expires after a working day, after which the person re-enters from the CCG site

#### Scenario: No acting as someone else
- **WHEN** a signed-in staff member sends a request naming a different person
- **THEN** the request is refused

#### Scenario: No public database path
- **WHEN** anyone calls the lab database's public Data API functions with an anonymous or Neon Auth token
- **THEN** the call is refused, so the GitHub Pages copy of the wall cannot read or write

#### Scenario: Separate databases
- **WHEN** an authenticated staff member enters the lab from CCG
- **THEN** no password credentials are passed to the lab
- **AND** the CCG web application does not write to the lab's database tables

### Requirement: Existing lab name identity
The lab MUST maintain display name identity for existing users while associating an authenticated CCG email alongside the person record upon staff entry.

#### Scenario: Existing names remain
- **WHEN** the staff integration is applied
- **THEN** existing lab name records, notes, and bookings are preserved intact (former guest names stay as authors but can no longer sign in)
- **AND** two distinct authenticated emails cannot be associated with the same person record
