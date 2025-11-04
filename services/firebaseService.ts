import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadString, getBytes, deleteObject } from "firebase/storage";
import { ChatMessage } from '../types';

// IMPORTANT: User must fill in their Firebase configuration here.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

// Function to get a reference to the history file for a given device
const getHistoryFileRef = (deviceId: string) => {
    return ref(storage, `histories/${deviceId}.json`);
}

/**
 * Saves the chat history to Firebase Storage.
 * @param deviceId - The unique ID for the device.
 * @param history - The array of chat messages to save.
 */
export const saveHistory = async (deviceId: string, history: ChatMessage[]): Promise<void> => {
    if (!deviceId) return;
    try {
        const historyFileRef = getHistoryFileRef(deviceId);
        if (history.length === 0) {
            // If history is empty, delete the file from storage to keep it clean.
            await deleteObject(historyFileRef).catch(error => {
                // It's okay if the file doesn't exist, so we ignore 'object-not-found' errors.
                if (error.code !== 'storage/object-not-found') {
                    throw error;
                }
            });
        } else {
            const historyJson = JSON.stringify(history, null, 2); // Pretty print for readability
            await uploadString(historyFileRef, historyJson, 'raw', { contentType: 'application/json' });
        }
    } catch (error) {
        console.error("Firebase: Failed to save history:", error);
        // We might want to throw the error to let the UI know, or handle it silently.
        // For now, logging is sufficient.
    }
};

/**
 * Loads the chat history from Firebase Storage.
 * @param deviceId - The unique ID for the device.
 * @returns The chat history array, or null if not found or an error occurs.
 */
export const loadHistory = async (deviceId: string): Promise<ChatMessage[] | null> => {
    if (!deviceId) return null;
    try {
        const historyFileRef = getHistoryFileRef(deviceId);
        const bytes = await getBytes(historyFileRef);
        const decoder = new TextDecoder('utf-8');
        const historyJson = decoder.decode(bytes);
        return JSON.parse(historyJson) as ChatMessage[];
    } catch (error: any) {
        if (error.code === 'storage/object-not-found') {
            // This is not an error, it just means the user has no history yet.
            console.log("Firebase: No history found for this device. A new one will be created.");
        } else {
            console.error("Firebase: Failed to load history:", error);
        }
        return null;
    }
};
