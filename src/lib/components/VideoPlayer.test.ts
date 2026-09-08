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
  it('renders loading overlay when not playing', () => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    const { getByText } = render(VideoPlayer, {
      src: 'test.mp4',
      engineStatus: 'Preparando test...'
    });
    expect(getByText('Preparando test...')).toBeDefined();
  });

  it('renders close button when onclose is provided', async () => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    const oncloseMock = vi.fn();
    const { getByLabelText } = render(VideoPlayer, { src: 'test.mp4', onclose: oncloseMock });
    const closeBtn = getByLabelText('Close');
    expect(closeBtn).toBeDefined();
    closeBtn.click();
    expect(oncloseMock).toHaveBeenCalled();
  });
});
