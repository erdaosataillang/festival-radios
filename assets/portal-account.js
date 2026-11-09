import './account-header.js';

const account = document.querySelector('urakata-account');
const login = () => location.assign('./invoice/');
account.setProfile(null, {login});

try {
  const {initializeApp} = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js');
  const {getAuth,onAuthStateChanged,signOut} = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js');
  const auth = getAuth(initializeApp({
    apiKey:'AIzaSyAWtITnn5uMOPBgOY0Bd7Rt5IN1ry8XoJI',
    authDomain:'urakata-app.firebaseapp.com',projectId:'urakata-app',
    appId:'1:407777765696:web:045c2d94729022b4eab2a5',
  }));
  onAuthStateChanged(auth, async user => {
    account.setProfile(null,{login});
    if (!user) return;
    try {
      const token = await user.getIdToken();
      for (const api of ['festivalRadioApi','receiptApi']) {
        const response = await fetch('https://asia-northeast1-urakata-app.cloudfunctions.net/'+api+'/me',{
          headers:{Authorization:'Bearer '+token},cache:'no-store',
        });
        if (!response.ok) continue;
        const {profile} = await response.json();
        if (auth.currentUser?.uid === user.uid) account.setProfile(profile,{login,logout:()=>signOut(auth)});
        break;
      }
    } catch {}
  });
} catch {}
