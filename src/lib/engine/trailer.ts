import { invoke } from '@tauri-apps/api/core';

/** Opens the trailer on YouTube in the system browser. */
export async function openTrailer(youtubeId: string): Promise<void> {
  await invoke('open_trailer', { youtubeId });
}
