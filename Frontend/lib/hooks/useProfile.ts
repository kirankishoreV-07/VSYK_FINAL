import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

export type Profile = {
  id: string;
  user_id: string;
  phone: string;
  full_name: string | null;
  role: 'member' | 'admin';
  kyc_status: 'pending' | 'submitted' | 'verified' | 'rejected';
  language: 'en' | 'ta' | 'hi';
  avatar_url: string | null;
  credit_score: number;
  member_since: string;
};

export function useProfile() {
  return useQuery<Profile | null>({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw new Error(error.message);
      return data as Profile;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Derive health label from credit_score
export function getHealthLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Work';
}

export function getHealthSubtext(score: number): string {
  if (score >= 80) return "You're in the top 5% of savers.";
  if (score >= 60) return "You're making great progress.";
  if (score >= 40) return "Keep up your payments to improve.";
  return "Make regular payments to build your score.";
}
