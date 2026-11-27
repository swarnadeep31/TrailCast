// The parts of YouTube's IFrame Player API the page uses
// (https://developers.google.com/youtube/iframe_api_reference).
declare namespace YT {
  interface PlayerOptions {
    videoId: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: { target: Player }) => void;
      onError?: (event: { data: number }) => void;
      onStateChange?: (event: { data: number }) => void;
    };
  }

  class Player {
    constructor(element: HTMLElement | string, options: PlayerOptions);
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    getPlaybackRate(): number;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    playVideo(): void;
    pauseVideo(): void;
    destroy(): void;
  }
}

interface Window {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
}
