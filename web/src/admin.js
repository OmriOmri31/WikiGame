// Paste your Firebase Auth UID between the quotes.
// Firebase console → Authentication → Users → copy User UID.
// The same UID goes in firestore.rules. Until it is set, the desk stays closed.
export const ADMIN_UID = 'bsoHTJvKDiOr3qzvmL1EIHdnsji1';

export function isAdmin(user) {
  return Boolean(ADMIN_UID) && user?.uid === ADMIN_UID;
}
