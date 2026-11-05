"use strict";

const { version } = require("../../package.json");

const providers = {
  zstatic:
    "https://s4.zstatic.net/ajax/libs/hexo-theme-redefine/:version/:path",
  cdnjs:
    "https://cdnjs.cloudflare.com/ajax/libs/hexo-theme-redefine/:version/:path",
  unpkg: "https://unpkg.com/hexo-theme-redefine@:version/source/:path",
  jsdelivr:
    "https://cdn.jsdelivr.net/npm/hexo-theme-redefine@:version/source/:path",
  aliyun:
    "https://evan.beee.top/projects/hexo-theme-redefine@:version/source/:path",
  npmmirror:
    "https://registry.npmmirror.com/hexo-theme-redefine/:version/files/source/:path",
};

const themeAssetUrl = (path, context) => {
  const cdn = context.theme.cdn || {};
  if (!cdn.enable) return context.url_for(path);

  const base =
    cdn.provider === "custom" && cdn.custom_url
      ? cdn.custom_url
      : providers[cdn.provider] || providers.npmmirror;
  return base.replace(":version", version).replace(":path", path);
};

const themeScriptUrl = (path, context) => {
  if (context.theme.developer?.enable === true) {
    return context.url_for(`js/${path}`);
  }
  return themeAssetUrl(`js/build/${path}`, context);
};

module.exports = { themeAssetUrl, themeScriptUrl };
