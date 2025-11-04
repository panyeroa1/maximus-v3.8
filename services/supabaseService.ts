import { createClient } from '@supabase/supabase-js';
import { ChatMessage } from '../types';

// Supabase credentials are now expected to be in environment variables.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;


/**
 * Checks if the Supabase environment variables are configured.
 * @returns {boolean} - True if configured, false otherwise.
 */
export const isSupabaseConfigured = (): boolean => {
    return !!supabaseUrl && !!supabaseKey;
};

// Initialize Supabase client only if configured.
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const BUCKET_NAME = 'histories';

/**
 * Saves the chat history to Supabase Storage.
 * @param deviceId - The unique ID for the device.
 * @param history - The array of chat messages to save.
 */
export const saveHistory = async (deviceId: string, history: ChatMessage[]): Promise<void> => {
    if (!supabase || !deviceId) return;
    
    const filePath = `${deviceId}.json`;
    
    try {
        if (history.length === 0) {
            // If history is empty, delete the file from storage.
            const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);
            // It's okay if the file doesn't exist, so we can ignore specific errors
            if (error && error.message !== 'The resource was not found') {
                 console.error("Supabase: Failed to delete empty history:", error);
            }
        } else {
            const historyJson = JSON.stringify(history, null, 2);
            const blob = new Blob([historyJson], { type: 'application/json' });
            const { error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(filePath, blob, {
                    cacheControl: '3600',
                    upsert: true, // This will create the file if it doesn't exist, or update it if it does.
                    contentType: 'application/json'
                });

            if (error) {
                console.error("Supabase: Failed to save history:", error);
            }
        }
    } catch (error) {
        console.error("Supabase: An unexpected error occurred while saving history:", error);
    }
};

/**
 * Loads the chat history from Supabase Storage.
 * @param deviceId - The unique ID for the device.
 * @returns The chat history array, or null if not found or an error occurs.
 */
export const loadHistory = async (deviceId: string): Promise<ChatMessage[] | null> => {
    if (!supabase || !deviceId) return null;
    
    const filePath = `${deviceId}.json`;

    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(filePath);
        
        if (error) {
            // "The resource was not found" is a normal case for a new user.
            if (error.message !== 'The resource was not found') {
                console.error("Supabase: Failed to load history:", error);
            } else {
                 console.log("Supabase: No history found for this device. A new one will be created.");
            }
            return null;
        }

        if (data) {
            const historyJson = await data.text();
            return JSON.parse(historyJson) as ChatMessage[];
        }

        return null;
    } catch (error) {
        console.error("Supabase: An unexpected error occurred while loading history:", error);
        return null;
    }
};