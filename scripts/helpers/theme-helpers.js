/* main hexo */

"use strict";

const { ensurePrefix } = require("../utils/log-prefix");
const { version } = require("../../package.json");
const themeVersion = version;
const { themeAssetUrl, themeScriptUrl } = require("../utils/asset-url");

hexo.extend.helper.register("isHomePagePagination", function (pagePath, route) {
  if (pagePath.length > 5 && route === "/") {
    return pagePath.slice(0, 5) === "page/";
  }

  return false;
});

/* code block language display */
hexo.extend.filter.register("after_post_render", function (data) {
  // Only process if not already processed
  if (data._processedHighlight) return data;
  
  // Updated pattern to include numbers and other special characters
  const pattern = /<figure class="highlight ([^"]+)">([\s\S]*?)<\/figure>/g;
  data.content = data.content.replace(pattern, function (match, p1, p2) {
    // If already has code-container anywhere in the match, return unchanged
    if (match.includes('code-container')) {
      return match;
    }

    let language = p1 || "code";
    if (language === "plain") {
      language = "code";
    }

    return '<div class="code-container" data-rel="' +
      language.charAt(0).toUpperCase() +
      language.slice(1) +
      '">' +
      match.replace(
        '<figure class="highlight ',
        '<figure class="iseeu highlight '
      ) +
      "</div>";
  });

  // Mark as processed
  data._processedHighlight = true;
  return data;
});

hexo.extend.helper.register("createNewArchivePosts", function (posts) {
  const postList = [],
    postYearList = [];
  posts.forEach((post) => postYearList.push(post.date.year()));
  Array.from(new Set(postYearList)).forEach((year) => {
    postList.push({
      year: year,
      postList: [],
    });
  });
  postList.sort((a, b) => b.year - a.year);
  postList.forEach((item) => {
    posts.forEach(
      (post) => item.year === post.date.year() && item.postList.push(post),
    );
  });
  postList.forEach((item) => {
    item.postList.sort((a, b) => {
      const dateDifference = b.date.unix() - a.date.unix();
      return dateDifference || a.title.localeCompare(b.title);
    });
  });
  return postList;
});

hexo.extend.helper.register(
  "getAuthorLabel",
  function (postCount, isAuto, labelList) {
    let level = Math.floor(Math.log2(postCount));
    level = level < 2 ? 1 : level - 1;

    if (isAuto === false && Array.isArray(labelList) && labelList.length > 0) {
      return level > labelList.length
        ? labelList[labelList.length - 1]
        : labelList[level - 1];
    } else {
      return `Lv${level}`;
    }
  },
);

hexo.extend.helper.register("getPostUrl", function (rootUrl, path) {
  if (rootUrl) {
    let { href } = new URL(rootUrl);
    if (href.substring(href.length - 1) !== "/") {
      href = href + "/";
    }
    return href + path;
  } else {
    return path;
  }
});

hexo.extend.helper.register("renderJS", function (path, options = {}) {
  const js = hexo.extend.helper.get("js").bind(hexo);
  const { module = false, swupReload = false } = options;
  const render = (file) => js({
    src: themeScriptUrl(file, this),
    type: module ? "module" : undefined,
    "data-swup-reload-script": swupReload ? "" : undefined,
  });
  return Array.isArray(path) ? path.map(render).join("") : render(path);
});

hexo.extend.helper.register("renderCSS", function (path) {
  const css = hexo.extend.helper.get("css").bind(hexo);
  const render = (file) => css(themeAssetUrl(file, this));
  return Array.isArray(path) ? path.map(render).join("") : render(path);
});

hexo.extend.helper.register("getThemeVersion", function () {
  return themeVersion;
});

hexo.extend.helper.register("checkDeprecation", function (condition, id, message) {
  if (condition) {
    // Use Set to ensure each warning is only logged once per Hexo process
    if (!global.deprecationWarnings) {
      global.deprecationWarnings = new Set();
    }
    
    if (!global.deprecationWarnings.has(id)) {
      hexo.log.warn(ensurePrefix(`${message}`));
      global.deprecationWarnings.add(id);
    }
    return true;
  }
  return false;
});

hexo.extend.helper.register("configOptions", function (obj, indent = '  ') {
  if (!obj || typeof obj !== 'object') return '';
  
  return Object.entries(obj)
    .filter(([key, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${indent}${key}: '${value}',`;
      }
      return `${indent}${key}: ${value},`;
    })
    .join('\n');
});
