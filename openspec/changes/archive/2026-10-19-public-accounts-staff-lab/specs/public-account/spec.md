## Purpose

Enables public visitors to register accounts, maintain profile details, change passwords, and reset forgotten passwords via emailed one-time verification codes.

## ADDED Requirements

### Requirement: A visitor can open an account
The system MUST let a new visitor register with an email, a password, and a full name, and then sign in with that email and password.

#### Scenario: New registration
- **WHEN** the visitor submits an email, a password, and a full name for an email that is not already registered
- **THEN** an account exists with that email and full name
- **AND** the role is MEMBER
- **AND** the password is stored as a secure one-way hash

#### Scenario: Email already registered
- **WHEN** a visitor submits an email that already belongs to an existing account
- **THEN** no second account is created
- **AND** the existing password and details are unchanged

### Requirement: The signed-in person can maintain the account
A signed-in account MUST be able to set a new full name, change the password, and change the email address.

#### Scenario: Full name
- **WHEN** a signed-in account saves a new full name
- **THEN** subsequent visits show that updated full name

#### Scenario: Password change
- **WHEN** a signed-in account submits their valid current password and a new password
- **THEN** subsequent sign-ins require the new password
- **AND** the previous password no longer authenticates

#### Scenario: Email change
- **WHEN** a signed-in account requests an email change and enters the one-time code sent to the new email
- **THEN** the account email is updated to the new email
- **AND** a notification message is sent to the previous email confirming the address change

### Requirement: A forgotten password is reset with an emailed code
The system MUST send a one-time code to the account email and accept that code once to set a new password.

#### Scenario: Reset
- **WHEN** a visitor requests a reset for a registered email and submits the emailed code alongside a new password
- **THEN** the account password is updated and authenticates future sign-ins
- **AND** the same code cannot be reused

#### Scenario: The message
- **WHEN** a reset or email-change verification code is dispatched
- **THEN** the message displays the CCG mark and brand palette (#030507, #1088f8, #3e9ff8, #70b8f8)
- **AND** contains the short-lived one-time code
- **AND** all embedded links use the public site host rather than 0.0.0.0

#### Scenario: Unknown email
- **WHEN** a password reset is requested for an email with no registered account
- **THEN** the response does not disclose whether the email address exists in the system

### Requirement: Who may hold an account
The system MUST allow public MEMBER accounts with passwords alongside ADMIN, EDITOR, and STAFF accounts.

#### Scenario: Member and staff both sign in
- **WHEN** a MEMBER account and an ADMIN account sign in with their respective credentials
- **THEN** the MEMBER account lands on the account page
- **AND** the ADMIN account lands on the admin management portal
- **AND** Google sign-in remains available for accounts linked to Google
