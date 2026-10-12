import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { UserProfile, ADMIN_EMAIL, StoreSettings } from './types';
import { LEGACY_ACCOUNT_UID, LEGACY_SETTINGS } from './data/legacySeed';

export const firebaseConfig = {
  apiKey: "AIzaSyBcddkA-S_Z9R3ss-KZ0hFTPuTXUnscOZQ",
  authDomain: "list-manger3.firebaseapp.com",
  projectId: "list-manger3",
  storageBucket: "list-manger3.firebasestorage.app",
  messagingSenderId: "1000193986227",
  appId: "1:1000193986227:web:873addec0a02b76426aac6",
  measurementId: "G-BW891F3NPB"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Client-side Firestore with offline persistence
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

// Normalize digits (remove spaces, symbols, and convert Eastern Arabic numerals to standard digits)
export const normalizeDigits = (str: string): string => {
  return (str || '')
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\s\-\(\)\+\.]/g, '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
};

// Known default accounts for automatic seed in Firestore
const DEFAULT_ACCOUNTS: UserProfile[] = [
  {
    uid: "admin_master_001",
    email: ADMIN_EMAIL,
    username: "tlfghlbtghlby",
    displayName: "المدير العام",
    storeName: "لوحة الإدارة المركزية",
    phone: "07700000000",
    role: "admin",
    isActive: true,
    password: "123456",
    createdAt: "2026-10-01T00:00:00.000Z"
  },
  {
    uid: LEGACY_ACCOUNT_UID,
    email: "muntazar@list-3d848.app",
    username: "muntazar",
    displayName: "انشائية المسعودي",
    storeName: "منتظر",
    phone: "07740193906",
    role: "client",
    isActive: true,
    password: "19981998",
    createdAt: "2026-10-01T12:42:44.911Z"
  },
  {
    uid: "LS8HLUUCZUbYvMoP7lZLAY9Zghf1",
    email: "montazar@list-3d848.app",
    username: "montazar",
    displayName: "montazar",
    storeName: "مخزن montazar",
    phone: "",
    role: "client",
    isActive: true,
    password: "19901990",
    createdAt: "2026-10-01T12:40:33.965Z"
  }
];

// Pure Client-side Authentication via Firestore
export const loginWithEmailOrUsername = async (identifier: string, password: string): Promise<any> => {
  const cleanInput = identifier.trim();
  const cleanPass = password.trim();

  if (!cleanInput) {
    throw new Error('يرجى إدخال اسم المستخدم أو رقم الهاتف أو البريد الإلكتروني');
  }
  if (!cleanPass) {
    throw new Error('يرجى إدخال كلمة المرور');
  }

  // 1. Admin Login (tlfghlbtghlby@gmail.com or tlfghlbtghlby)
  const isAdminInput = 
    cleanInput.toLowerCase() === ADMIN_EMAIL.toLowerCase() || 
    cleanInput.toLowerCase() === 'tlfghlbtghlby';

  if (isAdminInput) {
    let adminPass = '123456';
    try {
      const adminDoc = await getDoc(doc(db, 'users', 'admin_master_001'));
      if (adminDoc.exists() && adminDoc.data().password) {
        adminPass = adminDoc.data().password;
      } else {
        // Seed admin user in Firestore
        await setDoc(doc(db, 'users', 'admin_master_001'), DEFAULT_ACCOUNTS[0], { merge: true });
      }
    } catch (e) {}

    if (cleanPass !== adminPass) {
      throw new Error('كلمة المرور غير صحيحة لحساب المدير العام.');
    }

    const adminProfile: UserProfile = {
      uid: 'admin_master_001',
      email: ADMIN_EMAIL,
      username: 'tlfghlbtghlby',
      displayName: 'المدير العام',
      storeName: 'لوحة الإدارة المركزية',
      phone: '07700000000',
      role: 'admin',
      isActive: true,
      createdAt: new Date().toISOString()
    };

    localStorage.setItem('active_client_session', JSON.stringify(adminProfile));
    localStorage.setItem('last_active_user_uid', adminProfile.uid);
    return adminProfile;
  }

  // 2. Client Login from Firestore
  const inputDigits = normalizeDigits(cleanInput);
  let usersList: UserProfile[] = [];

  try {
    const snap = await getDocs(collection(db, 'users'));
    usersList = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
  } catch (err) {
    console.warn("Firestore fetch users warning:", err);
  }

  // If users list is empty (first client run), seed default client accounts into Firestore
  if (usersList.length === 0) {
    for (const acc of DEFAULT_ACCOUNTS) {
      try {
        await setDoc(doc(db, 'users', acc.uid), acc, { merge: true });
        usersList.push(acc);
      } catch (e) {}
    }
  }

  // Find matching user
  let matched = usersList.find((u) => {
    if (u.username && u.username.toLowerCase() === cleanInput.toLowerCase()) return true;
    if (u.email && u.email.toLowerCase() === cleanInput.toLowerCase()) return true;
    if (inputDigits && inputDigits.length >= 7 && normalizeDigits(u.phone || '') === inputDigits) return true;
    if (u.displayName && u.displayName.trim().toLowerCase() === cleanInput.toLowerCase()) return true;
    if (u.storeName && u.storeName.trim().toLowerCase() === cleanInput.toLowerCase()) return true;
    return false;
  });

  // Check fallback default accounts if not yet in Firestore
  if (!matched) {
    const fallbackMatch = DEFAULT_ACCOUNTS.find((u) => {
      if (u.username && u.username.toLowerCase() === cleanInput.toLowerCase()) return true;
      if (u.email && u.email.toLowerCase() === cleanInput.toLowerCase()) return true;
      if (inputDigits && inputDigits.length >= 7 && normalizeDigits(u.phone || '') === inputDigits) return true;
      return false;
    });

    if (fallbackMatch) {
      matched = fallbackMatch;
      setDoc(doc(db, 'users', fallbackMatch.uid), fallbackMatch, { merge: true }).catch(() => {});
    }
  }

  if (!matched) {
    throw new Error('اسم المستخدم أو رقم الهاتف غير مسجل في النظام. يرجى التأكد من البيانات أو مراجعة المدير.');
  }

  if (matched.isActive === false) {
    throw new Error('هذا الحساب معطل حالياً من قِبل إدارة النظام.');
  }

  if (matched.password && matched.password !== cleanPass) {
    throw new Error('كلمة المرور غير صحيحة. يرجى التأكد من البيانات المدخلة.');
  }

  const userProfile: UserProfile = {
    uid: matched.uid,
    email: matched.email,
    username: matched.username,
    displayName: matched.displayName || matched.username,
    storeName: matched.storeName || `مخزن ${matched.username}`,
    phone: matched.phone || '',
    role: matched.role || 'client',
    isActive: true,
    createdAt: matched.createdAt || new Date().toISOString()
  };

  try {
    localStorage.setItem(`profile_${matched.uid}`, JSON.stringify(userProfile));
    localStorage.setItem('active_client_session', JSON.stringify(userProfile));
    localStorage.setItem('last_active_user_uid', matched.uid);
  } catch (e) {}

  return userProfile;
};

// Change Password directly via Firestore
export const changeAccountPassword = async (
  uid: string,
  oldPass: string,
  newPass: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const cleanOld = String(oldPass).trim();
    const cleanNew = String(newPass).trim();

    if (cleanNew.length < 6) {
      return { success: false, error: 'يجب ألا تقل كلمة المرور الجديدة عن 6 خانات' };
    }

    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      return { success: false, error: 'تعذر العثور على حساب المستخدم في السحابة' };
    }

    const userData = userSnap.data();
    if (userData.password && userData.password !== cleanOld) {
      return { success: false, error: 'كلمة المرور القديمة غير صحيحة' };
    }

    await updateDoc(userDocRef, {
      password: cleanNew,
      updatedAt: new Date().toISOString()
    });

    return { success: true, message: 'تم حفظ كلمة المرور الجديدة في السحابة بنجاح' };
  } catch (err: any) {
    return { success: false, error: err.message || 'تعذر الاتصال بـ Firestore لتغيير كلمة المرور' };
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

// Admin: Create client directly in Firestore
export const createClientAccount = async (clientData: CreateClientInput): Promise<UserProfile> => {
  const newUid = `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanUsername = clientData.username.trim().toLowerCase();
  
  const newProfile: UserProfile = {
    uid: newUid,
    email: `${cleanUsername}@client.app`,
    username: cleanUsername,
    displayName: clientData.displayName.trim() || cleanUsername,
    storeName: clientData.storeName.trim() || `مخزن ${cleanUsername}`,
    phone: clientData.phone?.trim() || '',
    role: 'client',
    isActive: true,
    password: clientData.password,
    createdAt: new Date().toISOString()
  };

  // 1. Save user document in Firestore
  await setDoc(doc(db, 'users', newUid), newProfile);

  // 2. Initialize independent store settings document for this specific user
  const initialSettings: StoreSettings = {
    storeName: newProfile.storeName,
    ownerName: newProfile.displayName,
    phone: newProfile.phone || '',
    address: '',
    currency: 'دينار',
    invoiceFooterNote: 'شكراً لتعاملكم معنا',
    printFormat: 'a4',
    enableWholesale: true,
    deviceMode: 'desktop',
    desktopLayout: 'full'
  };

  await setDoc(doc(db, 'stores', newUid, 'settings', 'config'), initialSettings);

  return newProfile;
};

// Admin: Load all client accounts directly from Firestore
export const loadAllClientAccounts = async (): Promise<UserProfile[]> => {
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs
      .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
      .filter(u => u.role !== 'admin' && u.uid !== 'admin_master_001' && u.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase());
  } catch (e) {
    console.error("Error loading client accounts from Firestore:", e);
    return [];
  }
};

// Admin: Toggle status directly in Firestore
export const toggleClientAccountStatus = async (uid: string, currentStatus: boolean): Promise<boolean> => {
  const newStatus = !currentStatus;
  await updateDoc(doc(db, 'users', uid), { isActive: newStatus, updatedAt: new Date().toISOString() });
  return newStatus;
};

// Admin: Update client directly in Firestore
export const updateClientAccount = async (updates: UpdateClientInput): Promise<boolean> => {
  const cleanPayload: any = { updatedAt: new Date().toISOString() };
  if (updates.displayName !== undefined) cleanPayload.displayName = updates.displayName;
  if (updates.storeName !== undefined) cleanPayload.storeName = updates.storeName;
  if (updates.phone !== undefined) cleanPayload.phone = updates.phone;
  if (updates.password) cleanPayload.password = updates.password;
  if (updates.isActive !== undefined) cleanPayload.isActive = updates.isActive;

  await updateDoc(doc(db, 'users', updates.uid), cleanPayload);

  // Also update store config if storeName or displayName changed
  if (updates.storeName || updates.displayName || updates.phone !== undefined) {
    const storeUpdate: any = {};
    if (updates.storeName) storeUpdate.storeName = updates.storeName;
    if (updates.displayName) storeUpdate.ownerName = updates.displayName;
    if (updates.phone !== undefined) storeUpdate.phone = updates.phone;
    setDoc(doc(db, 'stores', updates.uid, 'settings', 'config'), storeUpdate, { merge: true }).catch(() => {});
  }

  return true;
};

// Admin: Delete client directly in Firestore
export const deleteClientAccount = async (uid: string): Promise<boolean> => {
  if (uid === 'admin_master_001') {
    throw new Error('لا يمكن حذف حساب المدير العام الرئيسي');
  }
  await deleteDoc(doc(db, 'users', uid));
  await deleteDoc(doc(db, 'stores', uid, 'settings', 'config')).catch(() => {});
  return true;
};
