# YouMessage Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email, private preferences, contacts, block lists, and per-chat pin/archive/mute states live strictly in `/users_private/{userId}` and are readable/writable ONLY by `request.auth.uid == userId`.
2. **Public User Integrity**: `/users_public/{userId}` can only be created or updated by `request.auth.uid == userId`, with `uid == userId`, bounded strings, and immutable `createdAt`.
3. **Chat Membership Gate**: A chat document in `/chats/{chatId}` requires `request.auth.uid` to be in `memberIds` (`1 <= size <= 50`). Reading or writing messages or typing indicators in `/chats/{chatId}` requires membership in the parent chat document.
4. **Group Admin Privilege**: Only group admins (`request.auth.uid in existing().adminIds`) can modify group name, description, photo, memberIds, adminIds, or disappearingDuration. Any member can update lastMessage metadata when sending a message.
5. **Message Ownership & Receipts**: A message can only be created by its `senderId == request.auth.uid`. Only the sender can edit message text or mark `isDeleted = true` for everyone. Chat members can add reactions, mark `deliveredTo`/`readBy`, or add themselves to `deletedForUids`.
6. **Status Privacy**: A status in `/statuses/{statusId}` can only be created by `authorId == request.auth.uid`. Visibility on read/list enforces `privacy == 'everyone' || request.auth.uid in resource.data.allowedUids || resource.data.authorId == request.auth.uid`.
7. **Call Session Integrity**: A call in `/calls/{callId}` can only be accessed by participants (`request.auth.uid in resource.data.participantIds`), requires an accepted contact request between caller and callee on create, and once `status` reaches terminal state (`ended`, `declined`, `missed`), it cannot be reopened.
8. **Bilateral Contact Request Gate**: Users cannot list/browse the platform directory (`users_public` `allow list` restricted to `limit <= 1` exact lookup). Creating a 1:1 direct chat or call requires an accepted `/contactRequests/{requestId}` document (`status == 'accepted'`) between the two participants, which only the recipient (`toUid`) can accept.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Email Spoofing / Unverified Token**: Write to `/users_public/{uid}` with `email_verified: false` -> `PERMISSION_DENIED`.
2. **PII Read Leak**: User B attempts `get` on `/users_private/{userA}` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Public Profile**: Create `/users_public/{uid}` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
4. **UID Impersonation on Chat Message**: User B creates `/chats/{chatId}/messages/{msgId}` with `senderId: userA` -> `PERMISSION_DENIED`.
5. **Non-Member Message Snooping**: User C (not in `memberIds`) attempts `list` on `/chats/{chatId}/messages` -> `PERMISSION_DENIED`.
6. **Unauthorized Group Member Escalation**: Non-admin member updates `/chats/{chatId}` to add themselves to `adminIds` -> `PERMISSION_DENIED`.
7. **Message Edit Hijacking**: Member B attempts to edit `text` on Member A's message -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Attempt `create` with a 500-char path variable containing `/` or `$` -> `PERMISSION_DENIED`.
9. **Resource Exhaustion (1MB+ String)**: Send a message with `text` > 4000 chars or `mediaData` > 750KB -> `PERMISSION_DENIED`.
10. **Status Privacy Bypass**: User C not in `allowedUids` attempts `get` on a `selected` privacy status -> `PERMISSION_DENIED`.
11. **Terminal Call Resurrection**: Participant attempts to update a call with `status: 'ended'` back to `status: 'active'` -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Create `/chats/{chatId}/messages/{msgId}` with backdated `createdAt != request.time` -> `PERMISSION_DENIED`.
