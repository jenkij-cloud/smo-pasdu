// src/firebase.js

// 1. นำเข้า Firebase, Auth, Firestore และ Storage
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 2. การตั้งค่าของคุณ (Config)
const firebaseConfig = {
    apiKey: "AIzaSyAL7R_3SHACfAdkYEnfm7d11JjheGSZmrU",
    authDomain: "smodi-738ec.firebaseapp.com",
    projectId: "smodi-738ec",
    storageBucket: "smodi-738ec.firebasestorage.app",
    messagingSenderId: "235304256630",
    appId: "1:235304256630:web:d36355641b78a0f912cb57",
    measurementId: "G-NNSZLGL4NY"
};

// 3. เริ่มต้นแอป Firebase
const app = initializeApp(firebaseConfig);

// 4. ส่งออกตัวแปร auth, db และ storage เพื่อให้หน้าอื่นเรียกใช้ได้
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);