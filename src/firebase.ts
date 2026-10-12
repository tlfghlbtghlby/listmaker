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
  where
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { UserProfile, ADMIN_EMAIL } from './types';

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

// تفعيل المحرك المحلي الدائم لحفظ البيانات على الجهاز والمزامنة التلقائية عند عودة الإنترنت
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

// Authentication helpers
export const loginWithEmailOrUsername = async (identifier: string, password: string) => {
  const cleanId = identifier.trim().toLowerCase();
  const cleanPass = password.trim();

  // 1. حساب المدير الافتراضي للطوارئ إذا تطابق الاسم وكلمة المرور
  if ((cleanId === 'admin' || cleanId === ADMIN_EMAIL.toLowerCase()) && cleanPass === 'admin123') {
    const adminUser: UserProfile = {
      uid: 'admin_root',
      email: ADMIN_EMAIL,
      username: 'admin',
      displayName: 'المدير العام',
      storeName: 'لوحة الإدارة المركزية',
      phone: '',
      role: 'admin',
      isActive: true,
      createdAt: new Date().toISOString()
    };
    saveLocalSession(adminUser);
    return adminUser as any;
  }

  // 2. البحث في Firestore عن الحساب (عبر اسم المستخدم أو الإيميل أو رقم الهاتف)
  const usersRef = collection(db, 'users');
  let matchedUser: any = null;

  // فحص بالبريد أو اسم المستخدم
  const qUsername = query(usersRef, where('username', '==', identifier.trim()));
  const snapUsername = await getDocs(qUsername);
  if (!snapUsername.empty) {
    matchedUser = snapUsername.docs[0].data();
  } else {
    const qEmail = query(usersRef, where('email', '==', identifier.trim()));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) {
      matchedUser = snapEmail.docs[0].data();
    } else {
      const qPhone = query(usersRef, where('phone', '==', identifier.trim()));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        matchedUser = snapPhone.docs[0].data();
      }
    }
  }

  if (!matchedUser) {
    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
  }

  if (matchedUser.password !== cleanPass) {
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
    role: isAdmin ? 'admin' : 'client',
    isActive: true,
    createdAt: matchedUser.createdAt || new Date().toISOString()
  };

  saveLocalSession(cachedProfile);

  return {
    uid: matchedUser.uid,
    email: matchedUser.email,
    displayName: matchedUser.displayName || matchedUser.username,
  } as any;
};

const saveLocalSession = (user: UserProfile) => {
  try {
    localStorage.setItem(`profile_${user.uid}`, JSON.stringify(user));
    localStorage.setItem('active_client_session', JSON.stringify(user));
    localStorage.setItem('last_active_user_uid', user.uid);
  } catch (e) {}
};

export const changeAccountPassword = async (
  uid: string,
  oldPass: string,
  newPass: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      return { success: false, error: 'المستخدم غير موجود' };
    }
    const data = snap.data();
    if (data.password !== oldPass.trim()) {
      return { success: false, error: 'كلمة المرور القديمة غير صحيحة' };
    }
    await updateDoc(userDocRef, { password: newPass.trim() });
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
