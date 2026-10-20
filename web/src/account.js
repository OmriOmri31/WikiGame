export function accountName(user) {
  const displayName = user?.displayName?.trim();
  if (displayName) return displayName;
  const localPart = user?.email?.split('@')[0]?.trim();
  return localPart || 'שחקן';
}

const AUTH_ERRORS = {
  'auth/invalid-email': 'כתובת האימייל אינה תקינה.',
  'auth/missing-email': 'יש להזין אימייל.',
  'auth/missing-password': 'יש להזין סיסמה.',
  'auth/invalid-credential': 'האימייל או הסיסמה שגויים.',
  'auth/invalid-login-credentials': 'האימייל או הסיסמה שגויים.',
  'auth/user-not-found': 'האימייל או הסיסמה שגויים.',
  'auth/wrong-password': 'האימייל או הסיסמה שגויים.',
  'auth/email-already-in-use': 'כבר קיים חשבון עם האימייל הזה.',
  'auth/account-exists-with-different-credential': 'כבר קיים חשבון עם האימייל הזה בשיטת התחברות אחרת.',
  'auth/weak-password': 'הסיסמה קצרה מדי. נדרשים לפחות 6 תווים.',
  'auth/operation-not-allowed': 'שיטת ההתחברות הזו אינה פעילה.',
  'auth/configuration-not-found': 'שירות ההתחברות עדיין לא זמין.',
  'auth/unauthorized-domain': 'ההתחברות אינה זמינה מהאתר הזה.',
  'auth/network-request-failed': 'אין חיבור לרשת. נסו שוב.',
  'auth/too-many-requests': 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.',
  'auth/user-disabled': 'החשבון הזה חסום.',
  'auth/popup-blocked': 'חלון ההתחברות נחסם. נסו שוב.',
  'auth/internal-error': 'ההתחברות נכשלה. נסו שוב.',
};

export function authErrorMessage(error, fallback = 'ההתחברות נכשלה. נסו שוב.') {
  return AUTH_ERRORS[error?.code] || fallback;
}
