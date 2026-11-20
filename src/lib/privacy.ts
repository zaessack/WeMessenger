import { Contact, PublicUser } from '../types/youmessage';

export function canViewPrivacyField(
  level: 'everyone' | 'contacts' | 'nobody' | undefined,
  targetUid: string,
  viewerUid: string,
  viewerContacts: Record<string, Contact>
): boolean {
  if (targetUid === viewerUid) return true;
  if (!level || level === 'everyone') return true;
  if (level === 'nobody') return false;
  if (level === 'contacts') {
    const c = viewerContacts[targetUid];
    return Boolean(c && !c.isBlocked);
  }
  return false;
}

export function isUserBlocked(uid: string, contacts: Record<string, Contact>): boolean {
  return Boolean(contacts[uid]?.isBlocked);
}

export function getVisiblePhoto(
  user: PublicUser | undefined | null,
  viewerUid: string,
  viewerContacts: Record<string, Contact>
): string | undefined {
  if (!user) return undefined;
  if (isUserBlocked(user.uid, viewerContacts)) return undefined;
  if (!canViewPrivacyField(user.privacyPhoto, user.uid, viewerUid, viewerContacts)) {
    return undefined;
  }
  return user.photoURL || undefined;
}

export function getVisibleAbout(
  user: PublicUser | undefined | null,
  viewerUid: string,
  viewerContacts: Record<string, Contact>
): string {
  if (!user) return '';
  if (isUserBlocked(user.uid, viewerContacts)) return '';
  if (!canViewPrivacyField(user.privacyAbout, user.uid, viewerUid, viewerContacts)) {
    return '';
  }
  return user.aboutStatus || '';
}

export function getVisibleOnline(
  user: PublicUser | undefined | null,
  viewerUid: string,
  viewerContacts: Record<string, Contact>
): boolean {
  if (!user) return false;
  if (isUserBlocked(user.uid, viewerContacts)) return false;
  if (!canViewPrivacyField(user.privacyOnline, user.uid, viewerUid, viewerContacts)) {
    return false;
  }
  return Boolean(user.isOnline);
}

export function getVisibleLastSeen(
  user: PublicUser | undefined | null,
  viewerUid: string,
  viewerContacts: Record<string, Contact>
) {
  if (!user) return undefined;
  if (isUserBlocked(user.uid, viewerContacts)) return undefined;
  if (!canViewPrivacyField(user.privacyLastSeen, user.uid, viewerUid, viewerContacts)) {
    return undefined;
  }
  return user.lastSeen;
}
