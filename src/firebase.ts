import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  enableNetwork
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { UserProfile, ADMIN_EMAIL } from './types';

export const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || "AIzaSyBcddkA-S_Z9R3ss-KZ0hFTPuTXUnscOZQ",
  authDomain: "list-manger3.firebaseapp.com",
  projectId: "list-manger3",
  storageBucket: "list-manger3.firebasestorage.app",
  messagingSenderId: "1000193986227",
  appId: "1:1000193986227:web:873addec0a02b76426aac6",
  measurementId: "G-BW891F3NPB"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// تفعيل المحرك المحلي الدائم بسعة لا محدودة لضمان حفظ كل حركة على القرص الصلب
let firestoreDb: any;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: CACHE_SIZE_UNLIMITED
    })
  });
} catch (e) {
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const isFirebaseConfigured = true;

// إعادة تفعيل الشبكة فور استعادة الاتصال
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    try {
      await enableNetwork(db);
    } catch (e) {
      console.warn('Network sync trigger error:', e);
    }
  });
}

// دالة جلب الجلسة الدائمة فور فتح البرنامج (حتى لو بعد 100 سنة بدون إنترنت)
export const getActiveLocalSession = (): UserProfile | null => {
  try {
    const session = localStorage.getItem('active_client_session');
    if (session) {
      return JSON.parse(session);
    }
  } catch (e) {}
  return null;
};

export const loginWithEmailOrUsername = async (identifier: string, password: string) => {
  const cleanId = identifier.trim().toLowerCase();
  const cleanPass = password.trim();

  // 1. حساب المدير الافتراضي للطوارئ بدون إنترنت
  if ((cleanId === 'admin' || cleanId === ADMIN_EMAIL.toLowerCase()) && (cleanPass === 'admin123' || cleanPass === '123456')) {
    const adminUser: UserProfile = {
      uid: 'admin_root',
      email: ADMIN_EMAIL,
      username: 'admin',
      displayName: 'المدير العام',
      storeName: 'لوحة الإدارة المركزية',
      phone: '',
      password: cleanPass,
      role: 'admin',
      isActive: true,
      createdAt: new Date().toISOString()
    };
    saveLocalSession(adminUser);
    return adminUser as any;
  }

  // 2. التحقق من الجلسة المخزنة محلياً أولاً (للبقاء مسجلاً حتى لو انقطع النت لسنوات وبدون استهلاك Firebase)
  const cached = getActiveLocalSession();
  if (
    cached &&
    (cached.username?.toLowerCase() === cleanId || cached.email?.toLowerCase() === cleanId)
  ) {
    if (cached.password && String(cached.password).trim() !== cleanPass) {
      throw new Error('كلمة المرور غير صحيحة.');
    }
    return {
      uid: cached.uid,
      email: cached.email,
      username: cached.username,
      displayName: cached.displayName || cached.username,
      storeName: cached.storeName || '',
      phone: cached.phone || '',
      password: cleanPass,
      role: cached.role || 'client',
    } as any;
  }

  // 3. التحقق عبر خادم التطبيق المحلي الداخلي Express
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: identifier.trim(), password: cleanPass })
    });
    const data = await res.json();
    if (data.success && data.user) {
      const u = data.user;
      const profile: UserProfile = {
        uid: u.uid,
        email: u.email || '',
        username: u.username || cleanId,
        displayName: u.displayName || u.username || cleanId,
        storeName: u.storeName || '',
        phone: u.phone || '',
        password: cleanPass,
        role: u.role || 'client',
        isActive: true,
        createdAt: new Date().toISOString()
      };
      saveLocalSession(profile);
      return profile as any;
    }
  } catch (e) {}

  // 4. استعلام Firestore كخيار أخير إذا كان النت متصلاً
  const usersRef = collection(db, 'users');
  let matchedUser: any = null;

  try {
    const qUsername = query(usersRef, where('username', '==', identifier.trim()));
    const snapUsername = await getDocs(qUsername);
    if (!snapUsername.empty) {
      matchedUser = snapUsername.docs[0].data();
    } else {
      const qEmail = query(usersRef, where('email', '==', identifier.trim()));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        matchedUser = snapEmail.docs[0].data();
      }
    }
  } catch (err) {
    throw new Error('تعذر الاتصال بالسيرفر، ولم يتم العثور على جلسة محلية مسجلة لهذا الحساب.');
  }

  if (!matchedUser) {
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
  }

  if (matchedUser.password && String(matchedUser.password).trim() !== cleanPass) {
    throw new Error('كلمة المرور غير صحيحة.');
  }

  if (matchedUser.isActive === false) {
    throw new Error('تم تعطيل هذا الحساب من قبل الإدارة.');
  }

  const isAdmin = matchedUser.role === 'admin' || matchedUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const cachedProfile: UserProfile = {
    uid: matchedUser.uid,
    email: matchedUser.email || '',
    username: matchedUser.username,
    displayName: matchedUser.displayName || matchedUser.username,
    storeName: matchedUser.storeName || (isAdmin ? 'لوحة الإدارة المركزية' : `مخزن ${matchedUser.username}`),
    phone: matchedUser.phone || '',
    password: cleanPass,
    role: isAdmin ? 'admin' : 'client',
    isActive: true,
    createdAt: matchedUser.createdAt || new Date().toISOString()
  };

  saveLocalSession(cachedProfile);

  return {
    uid: matchedUser.uid,
    email: matchedUser.email,
    username: matchedUser.username,
    displayName: matchedUser.displayName || matchedUser.username,
    storeName: cachedProfile.storeName,
    phone: cachedProfile.phone,
    password: cleanPass,
    role: isAdmin ? 'admin' : 'client',
  } as any;
};

const saveLocalSession = (user: UserProfile) => {
  try {
    localStorage.setItem(`profile_${user.uid}`, JSON.stringify(user));
    localStorage.setItem('active_client_session', JSON.stringify(user));
    localStorage.setItem('last_active_user_uid', user.uid);
    if (user.password) {
      localStorage.setItem('last_known_account_password', user.password);
    }
  } catch (e) {}
};

export const changeAccountPassword = async (
  uid: string,
  oldPass: string,
  newPass: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const cleanOld = oldPass.trim();
    const cleanNew = newPass.trim();
    let firestoreUpdated = false;

    try {
      const userDocRef = doc(db, 'users', uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.password && String(data.password).trim() !== cleanOld) {
          return { success: false, error: 'كلمة المرور القديمة غير صحيحة' };
        }
        await updateDoc(userDocRef, { password: cleanNew });
        firestoreUpdated = true;
      }
    } catch (e) {
      console.warn('Firestore password update notice:', e);
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, oldPassword: cleanOld, newPassword: cleanNew })
      });
      const data = await res.json();
      if (!data.success && !firestoreUpdated) {
        return { success: false, error: data.error || 'فشل تحديث كلمة المرور' };
      }
    } catch (e) {}

    try {
      const activeStr = localStorage.getItem('active_client_session');
      if (activeStr) {
        const activeObj = JSON.parse(activeStr);
        activeObj.password = cleanNew;
        localStorage.setItem('active_client_session', JSON.stringify(activeObj));
      }
      localStorage.setItem('last_known_account_password', cleanNew);
    } catch (e) {}

    return { success: true, message: 'تم حفظ كلمة المرور الجديدة بنجاح' };
  } catch (err: any) {
    return { success: false, error: err.message || 'تعذر الاتصال بقاعدة البيانات لتغيير كلمة المرور' };
  }
};

export const logoutAccount = async () => {
  try {
    localStorage.removeItem('active_client_session');
    localStorage.removeItem('last_active_user_uid');
  } catch (e) {}
};

export interface CreateClientInput {
  username: string;
  password: string;
  storeName: string;
  displayName: string;
  phone?: string;
}

export interface UpdateClientInput {
  uid: string;
  storeName?: string;
  displayName?: string;
  phone?: string;
  password?: string;
  isActive?: boolean;
}

export const createClientAccount = async (clientData: CreateClientInput): Promise<UserProfile> => {
  const newUid = `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newProfile: UserProfile = {
    uid: newUid,
    email: `${clientData.username}@client.app`,
    username: clientData.username,
    displayName: clientData.displayName.trim() || clientData.username,
    storeName: clientData.storeName.trim() || `مخزن ${clientData.username}`,
    phone: clientData.phone?.trim() || '',
    role: 'client',
    isActive: true,
    password: clientData.password,
    createdAt: new Date().toISOString()
  };

  const userDocRef = doc(db, 'users', newUid);
  await setDoc(userDocRef, newProfile);
  return newProfile;
};

export const loadAllClientAccounts = async (): Promise<UserProfile[]> => {
  try {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    const users: UserProfile[] = [];
    snap.forEach((d) => {
      const u = d.data() as UserProfile;
      if (u.role === 'client') users.push(u);
    });
    return users;
  } catch (e) {
    return [];
  }
};

export const toggleClientAccountStatus = async (uid: string, currentStatus: boolean): Promise<boolean> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, { isActive: !currentStatus });
    return !currentStatus;
  } catch (e) {
    return currentStatus;
  }
};

export const updateClientAccount = async (updates: UpdateClientInput): Promise<boolean> => {
  try {
    const userDocRef = doc(db, 'users', updates.uid);
    const dataToUpdate: any = {};
    if (updates.storeName !== undefined) dataToUpdate.storeName = updates.storeName;
    if (updates.displayName !== undefined) dataToUpdate.displayName = updates.displayName;
    if (updates.phone !== undefined) dataToUpdate.phone = updates.phone;
    if (updates.password !== undefined) dataToUpdate.password = updates.password;
    if (updates.isActive !== undefined) dataToUpdate.isActive = updates.isActive;

    await updateDoc(userDocRef, dataToUpdate);
    return true;
  } catch (e) {
    return false;
  }
};

export const deleteClientAccount = async (uid: string): Promise<boolean> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    await deleteDoc(userDocRef);
    return true;
  } catch (e) {
    return false;
  }
};
