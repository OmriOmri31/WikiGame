// Tells Omri (by email, through a Netlify function) that a player kept a Google name with a
// blocked word in it. Fire and forget: never waits on it and never fails the sign-up.
export function reportGoogleName(user, nickname) {
  try {
    Promise.resolve(user.getIdToken())
      .then((idToken) => fetch('/.netlify/functions/name-alert', {
        method: 'POST',
        headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ nickname }),
        keepalive: true,
      }))
      .catch((error) => console.error('name alert', error));
  } catch (error) {
    console.error('name alert', error);
  }
}
