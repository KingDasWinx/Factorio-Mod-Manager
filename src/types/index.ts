export type ActiveTab = 'all-mods' | 'my-mods' | 'download-queue' | 'config' | 'profile-creation' | 'mod-details';

export interface Profile {
  name: string;
  folder_name: string;
  created_at: string;
  last_used: string;
}
