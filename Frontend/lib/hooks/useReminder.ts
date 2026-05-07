import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { supabase } from '../supabase';

/**
 * Toggle a reminder for an upcoming auction.
 * If the reminder exists → delete it (cancel reminder)
 * If it doesn't exist → insert it (set reminder)
 */
export function useToggleReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      auctionId,
      hasReminder,
    }: {
      auctionId: string;
      hasReminder: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (hasReminder) {
        // Cancel reminder
        const { error } = await supabase
          .from('auction_reminders')
          .delete()
          .eq('auction_id', auctionId)
          .eq('user_id', user.id);
        if (error) throw new Error(error.message);
      } else {
        // Set reminder
        const { error } = await supabase
          .from('auction_reminders')
          .insert({ auction_id: auctionId, user_id: user.id });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      // Refetch auctions so reminder state updates immediately
      queryClient.invalidateQueries({ queryKey: ['upcoming-auctions'] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });
}
