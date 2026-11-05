let playerInstance = null;

export const getConfiguredAudios = (audios = theme.plugins?.aplayer?.audios) =>
  Array.isArray(audios)
    ? audios
        .filter((audio) => audio && audio.url)
        .map((audio) => ({
          name: audio.name,
          artist: audio.artist,
          url: audio.url,
          cover: audio.cover,
          lrc: audio.lrc,
          theme: audio.theme,
        }))
    : [];

export default function initAPlayer() {
  if (playerInstance || typeof window.APlayer === "undefined") {
    return playerInstance;
  }

  const container = document.getElementById("aplayer");
  const audioList = getConfiguredAudios();
  if (!container || audioList.length === 0) {
    return null;
  }

  const type = theme.plugins?.aplayer?.type;
  if (type === "mini") {
    playerInstance = new window.APlayer({
      container,
      mini: true,
      preload: "none",
      audio: audioList,
    });
  } else if (type === "fixed") {
    playerInstance = new window.APlayer({
      container,
      fixed: true,
      lrcType: 3,
      preload: "none",
      audio: audioList,
    });
    container.querySelector(".aplayer-icon-lrc")?.click();
  }

  return playerInstance;
}