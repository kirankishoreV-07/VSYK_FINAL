import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export async function registerForPushNotificationsAsync(customerId: string) {
    if (!Device.isDevice) return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    let projectId: string | undefined;
    const extra: any = (Constants.expoConfig as any)?.extra;
    projectId = extra?.eas?.projectId || extra?.projectId;

    const tokenResponse = await Notifications.getDevicePushTokenAsync({ projectId });
    const token = tokenResponse?.data;
    if (!token) return;

    await supabase.from('member_device_tokens').upsert({
        customer_id: customerId,
        fcm_token: token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
    });
}
