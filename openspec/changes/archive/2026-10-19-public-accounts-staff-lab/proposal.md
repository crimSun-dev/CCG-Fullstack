# Proposal: Public accounts and staff access to CK Virtual Lab

## Why

The public site currently restricts account creation to command-line provisioning for staff and admins, with no public registration or self-service password maintenance. At the same time, CK Virtual Lab operates as an independent app without email identity, where staff members must manually choose display names. Adding public accounts and linking authenticated staff accounts to the Virtual Lab provides a unified user identity across both systems while keeping their databases decoupled.

## What Changes

- Enable visitor self-service registration with email, password, and full name (role defaults to `MEMBER`).
- Retain existing email/password and Google sign-in workflows on the unified `AdminUser` model.
- Add self-service profile maintenance for signed-in accounts: update full name, change password, and change email.
- Provide password reset and email change verification using short-lived one-time email codes styled with the CCG mark and brand blues (#030507, #1088f8, #3e9ff8, #70b8f8).
- Provide an admin portal for administrators to inspect registered accounts and grant or revoke the `STAFF` role.
- Allow `STAFF`, `EDITOR`, and `ADMIN` roles to view contact enquiries and access the CK Virtual Lab button (using the supplied brand asset).
- Provide a secure signed assertion mechanism passing email and full name to CK Virtual Lab so staff accounts automatically display their verified name without entering the lab's manual name picker.
- Close CK Virtual Lab to everyone except STAFF, EDITOR, and ADMIN accounts arriving from the CCG site: the guest name picker is removed, every lab surface requires a lab session created by the signed hand-off, and the public Neon Data API path (GitHub Pages) is revoked. Existing notes and bookings are kept.

## Capabilities

### New Capabilities
- `public-account`: Visitor registration, profile maintenance, password reset via emailed codes, and member role assignment.
- `staff-lab-access`: Admin staff role management, enquiry access for staff, CK Virtual Lab entry button, and signed assertion integration with the lab.

### Modified Capabilities
<!-- None -->

## Impact

- `web/prisma/schema.prisma`: Add `STAFF` role and support for one-time verification codes for reset and email change.
- `web/src/lib/session-service.ts`: Support member registration, staff permissions, profile updates, and code verification.
- `web/src/app/`: Add public registration, password reset, account management, and admin role assignment routes.
- `web/public/brand/ck-virtual-lab.png`: Supplied image asset for lab button.
- CK Virtual Lab / Virtual Office: Handle signed assertions to authenticate staff members by full name and email while leaving the unauthenticated guest workflow intact.
- `web/PRODUCT.md`: Update documentation to reflect public registration and password management capabilities.
