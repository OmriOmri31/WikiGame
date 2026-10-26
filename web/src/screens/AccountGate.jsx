import { useEffect, useState } from 'react';
import { sendEmailVerification, signOut, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';
import Stage from '../Stage';
import NicknameField from '../NicknameField';
import { isBlockedNickname } from '../blockedNames';
import { reportGoogleName } from '../nameAlert';
import { authErrorMessage, publicName } from '../account';
import {
  NICKNAME_TAKEN,
  claimNickname,
  cleanNickname,
  nicknameAvailable,
  nicknameProblem,
} from '../nickname';

function Shell({ title, children }) {
  return (
    <Stage className="stage-home">
      <main className="home-page">
        <section className="home-actions account-gate" aria-label={title}>
          <div className="mail-form">
            <h2>{title}</h2>
            {children}
          </div>
        </section>
      </main>
    </Stage>
  );
}

async function quietSignOut() {
  try { await signOut(auth); } catch (error) { console.error(error); }
}

export function VerifyEmailScreen({ user, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  // Pick up the verification as soon as the player returns to the tab.
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') onRefresh().catch(() => {}); };
    const id = window.setInterval(check, 5000);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', check);
    };
  }, [onRefresh]);

  async function checkNow() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const verified = await onRefresh();
      if (!verified) setNotice('האימייל עדיין לא אומת. לחצו על הקישור שנשלח אליכם.');
    } catch (refreshError) {
      console.error(refreshError);
      setError(authErrorMessage(refreshError, 'הבדיקה נכשלה. נסו שוב.'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await sendEmailVerification(user);
      setNotice('שלחנו קישור אימות חדש.');
      setCooldown(60);
    } catch (sendError) {
      console.error(sendError);
      setError(authErrorMessage(sendError, 'לא הצלחנו לשלוח את הקישור. נסו שוב.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="בדקו את האימייל שלכם">
      <p className="form-note">
        שלחנו קישור אימות אל <bdi dir="ltr">{user.email}</bdi>.
        {' '}
        לחצו על הקישור כדי להפעיל את החשבון. אם לא קיבלתם, בדקו גם בתיקיית הספאם.
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-note" role="status">{notice}</p> : null}
      <button className="primary" type="button" onClick={checkNow} disabled={busy}>
        {busy ? 'רגע…' : 'אימתתי, המשך'}
      </button>
      <div className="form-links">
        <button className="text-button" type="button" onClick={resend} disabled={busy || cooldown > 0}>
          {cooldown > 0 ? `שליחה מחדש (${cooldown})` : 'שליחת הקישור מחדש'}
        </button>
        <button className="text-button danger" type="button" onClick={quietSignOut}>
          התנתקות
        </button>
      </div>
    </Shell>
  );
}

export function NicknameScreen({ user, suggested = '', autoClaim = false, onDone }) {
  const googleEntry = (user.providerData || []).find((entry) => entry.providerId === 'google.com');
  const isGoogle = Boolean(googleEntry);
  const accountName = publicName(cleanNickname(googleEntry?.displayName || user.displayName), '');
  // Keeping the exact Google name skips the blocked-words check (a real name); typed names don't.
  const googleName = isGoogle ? accountName : '';
  // A Google name is offered as is only when it already fits the nickname rules.
  const accountFits = Boolean(accountName) && !nicknameProblem(accountName, { googleName });
  const [choice, setChoice] = useState(isGoogle && accountFits && !suggested ? 'account' : 'new');
  const [name, setName] = useState(suggested || (isGoogle ? '' : accountName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accountTaken, setAccountTaken] = useState(false);

  async function claim(value, options = {}) {
    const problem = nicknameProblem(value, options);
    if (problem) {
      setError(problem);
      return problem;
    }
    setBusy(true);
    setError('');
    try {
      if (!(await nicknameAvailable(value, user.uid))) {
        setError(NICKNAME_TAKEN);
        return NICKNAME_TAKEN;
      }
      const profile = await claimNickname(user, value);
      // A kept Google name with a blocked word: allowed, and Omri gets an email to review it.
      if (options.googleName && isBlockedNickname(value)) reportGoogleName(user, profile.nickname || value);
      onDone(profile);
      return '';
    } catch (claimError) {
      console.error(claimError);
      const message = claimError?.code === 'nickname/taken' ? NICKNAME_TAKEN : 'לא הצלחנו לשמור את הכינוי. נסו שוב.';
      setError(message);
      return message;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoClaim && suggested) claim(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (choice === 'account') {
      const problem = await claim(accountName, { googleName });
      if (problem === NICKNAME_TAKEN) {
        setAccountTaken(true);
        setChoice('new');
        setError(`השם ${accountName} כבר תפוס. בחרו כינוי חדש.`);
      }
      return;
    }
    await claim(name);
  }

  return (
    <Shell title="איך לקרוא לך?">
      <p className="form-note">הכינוי יופיע בטבלת התוצאות. כל כינוי ייחודי לשחקן אחד.</p>
      <form onSubmit={submit} noValidate>
        {isGoogle && accountName && !accountFits ? (
          <p className="form-note">
            השם <bdi>{accountName}</bdi> מהחשבון לא מתאים לכללי הכינוי. בחרו כינוי אחר.
          </p>
        ) : null}
        {isGoogle && accountFits ? (
          <div className="nickname-choices" role="radiogroup" aria-label="בחירת שם">
            <label className={accountTaken ? 'nickname-choice is-disabled' : 'nickname-choice'}>
              <input
                type="radio"
                name="nickname-choice"
                checked={choice === 'account'}
                onChange={() => setChoice('account')}
                disabled={busy || accountTaken}
              />
              <span>להיקרא <bdi>{accountName}</bdi></span>
            </label>
            <label className="nickname-choice">
              <input
                type="radio"
                name="nickname-choice"
                checked={choice === 'new'}
                onChange={() => setChoice('new')}
                disabled={busy}
              />
              <span>ליצור כינוי חדש</span>
            </label>
          </div>
        ) : null}
        {choice === 'new' ? (
          <>
            <label htmlFor="nickname">כינוי</label>
            <NicknameField id="nickname" value={name} onChange={setName} disabled={busy} autoFocus />
          </>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'בודק…' : 'המשך'}
        </button>
      </form>
      <div className="form-links">
        <button className="text-button danger" type="button" onClick={quietSignOut}>
          התנתקות
        </button>
      </div>
    </Shell>
  );
}

// The account already has a nickname but the sign-in brought a different name (e.g. Google).
export function KeepNicknameScreen({ user, nickname, onDone }) {
  const [choice, setChoice] = useState('keep');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (choice === 'keep') {
      setBusy(true);
      try {
        await updateProfile(user, { displayName: nickname });
        onDone({ nickname, key: nickname.toLowerCase() });
      } catch (keepError) {
        console.error(keepError);
        setError('לא הצלחנו לשמור. נסו שוב.');
      } finally {
        setBusy(false);
      }
      return;
    }
    const problem = nicknameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      if (!(await nicknameAvailable(name, user.uid))) {
        setError(NICKNAME_TAKEN);
        return;
      }
      // Reserves the new nickname and frees the old one in the same transaction.
      onDone(await claimNickname(user, name));
    } catch (claimError) {
      console.error(claimError);
      setError(claimError?.code === 'nickname/taken' ? NICKNAME_TAKEN : 'לא הצלחנו לשמור את הכינוי. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="איזה כינוי להשתמש?">
      <p className="form-note">לחשבון הזה כבר יש כינוי. אפשר להמשיך איתו או לבחור כינוי חדש.</p>
      <form onSubmit={submit} noValidate>
        <div className="nickname-choices" role="radiogroup" aria-label="בחירת כינוי">
          <label className="nickname-choice">
            <input
              type="radio"
              name="keep-choice"
              checked={choice === 'keep'}
              onChange={() => setChoice('keep')}
              disabled={busy}
            />
            <span>להמשיך עם <bdi>{nickname}</bdi></span>
          </label>
          <label className="nickname-choice">
            <input
              type="radio"
              name="keep-choice"
              checked={choice === 'new'}
              onChange={() => setChoice('new')}
              disabled={busy}
            />
            <span>ליצור כינוי חדש</span>
          </label>
        </div>
        {choice === 'new' ? (
          <>
            <label htmlFor="new-nickname">כינוי חדש</label>
            <NicknameField id="new-nickname" value={name} onChange={setName} disabled={busy} autoFocus />
          </>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'רגע…' : 'המשך'}
        </button>
      </form>
      <div className="form-links">
        <button className="text-button danger" type="button" onClick={quietSignOut}>
          התנתקות
        </button>
      </div>
    </Shell>
  );
}
