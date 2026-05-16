export interface Profile {
  id: string;
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
  membership_level?: string | null;
  ro_coin_balance?: number | null;
}
