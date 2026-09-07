import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import VideoPlayer from './VideoPlayer.svelte';

describe('VideoPlayer component', () => {
  it('renders video element with correct src', () => {
    // Mock play to prevent JSDOM errors
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());

    const src = 'http://127.0.0.1:3030/stream';
    const { getByTestId } = render(VideoPlayer, { src });

    const video = getByTestId('video-element') as HTMLVideoElement;
    expect(video).toBeDefined();
    expect(video.src).toBe(src);
    expect(video.autoplay).toBe(true);
    expect(video.controls).toBe(false); // Controls are now custom
  });
});
