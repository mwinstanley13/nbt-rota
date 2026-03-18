import firebase from 'firebase/compat/app'
import 'firebase/compat/firestore'
import 'firebase/compat/auth'

firebase.initializeApp({
  apiKey:            "AIzaSyCY4GyGVrPp2Aik8_BlwPHcUflY92usfeQ",
  authDomain:        "nbt-rota.firebaseapp.com",
  projectId:         "nbt-rota",
  storageBucket:     "nbt-rota.firebasestorage.app",
  messagingSenderId: "15820685494",
  appId:             "1:15820685494:web:40dd97972ab9ad7c23a617",
})

export const db = firebase.firestore()
export const auth = firebase.auth()
export default firebase
