import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  getFirestore
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
  // If already initialized (e.g. during fast reloads)
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const isFirebaseConfigured = true;

// Authentication helpers
export const loginWithEmailOrUsername = async (identifier: string, password: string) => {
  const cleanIdentifier = identifier.trim();
  const cleanPassword = password.trim();

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: cleanIdentifier, password: cleanPassword })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة. يرجى التأكد من البيانات المدخلة.');
  }

  const matchedUser = data.user;
  const isAdmin = matchedUser.role === 'admin' || matchedUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const cachedProfile: UserProfile = {
    uid: matchedUser.uid,
    email: matchedUser.email,
    username: matchedUser.username,
    displayName: matchedUser.displayName || matchedUser.username,
    storeName: matchedUser.storeName || (isAdmin ? 'لوحة الإدارة المركزية' : `مخزن ${matchedUser.username}`),
    phone: matchedUser.phone || '',
    role: isAdmin ? 'admin' : 'client',
    isActive: true,
    createdAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(`profile_${matchedUser.uid}`, JSON.stringify(cachedProfile));
    localStorage.setItem('active_client_session', JSON.stringify(cachedProfile));
    localStorage.setItem('last_active_user_uid', matchedUser.uid);
  } catch (e) {}

  return {
    uid: matchedUser.uid,
    email: matchedUser.email,
    displayName: matchedUser.displayName || matchedUser.username,
  } as any;
};

export const changeAccountPassword = async (
  uid: string,
  oldPass: string,
  newPass: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, oldPassword: oldPass, newPassword: newPass }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'فشل تغيير كلمة المرور' };
    }

    return { success: true, message: data.message || 'تم حفظ كلمة المرور الجديدة بنجاح' };
  } catch (err: any) {
    return { success: false, error: err.message || 'تعذر الاتصال بالخادم لتغيير كلمة المرور' };
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

  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newProfile)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'فشل حفظ حساب الزبون على السيرفر');
  }
  return newProfile;
};

export const loadAllClientAccounts = async (): Promise<UserProfile[]> => {
  try {
    const res = await fetch('/api/admin/users');
    if (res.ok) {
      const data = await res.json();
      return (data.users || []).filter((u: any) => u.role === 'client');
    }
  } catch (e) {}
  return [];
};

export const toggleClientAccountStatus = async (uid: string, currentStatus: boolean): Promise<boolean> => {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/toggle-status`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  return data.isActive ?? !currentStatus;
};

export const updateClientAccount = async (updates: UpdateClientInput): Promise<boolean> => {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(updates.uid)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.ok;
};

export const deleteClientAccount = async (uid: string): Promise<boolean> => {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, { method: 'DELETE' });
  return res.ok;
};
