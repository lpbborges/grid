/**
 * Maps a DOM `MediaError.code` to pt-BR copy the user can act on.
 *
 * Linux plays through libmpv by default; when the `<video>` element is forced
 * (`VITE_GRID_NATIVE_PLAYER=off`) it decodes through GStreamer, which handles 4K
 * HEVC and E-AC3 only when the libav plugins are installed. They are not a
 * default on a clean Ubuntu or Fedora and no package declares them, and the
 * symptom is a bare `MediaError 4` that reads as a broken file, so the user
 * needs to be told what is missing.
 */
export function describeMediaError(code: number): string {
  switch (code) {
    case 1:
      return 'O carregamento do vídeo foi interrompido.';
    case 2:
      return 'Falha de rede ao carregar o vídeo.';
    case 3:
      return 'Não foi possível decodificar este vídeo.';
    case 4:
      return 'Este vídeo precisa de componentes de vídeo que não estão instalados no sistema.';
    default:
      return 'Não foi possível reproduzir este vídeo.';
  }
}
