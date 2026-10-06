import { describeError } from "../utils/describeError";

/// 版本检测里不碰界面、不碰存储的那部分：版本比较、更新说明解析、取 Release。
/// 全是纯函数（取 Release 的 fetch 可以注入），所以能在命令行里直接测，见 scripts/test-update-check.mjs。
/// 弹窗、节流、「跳过这个版本」这些带状态的事在 composables/useUpdateCheck.ts。

export const UPDATE_REPO = "orangeTZ07/Haust-Class-Schedule-APP";
export const LATEST_RELEASE_API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
export const FETCH_TIMEOUT_MS = 8000;

/// 弹窗里最多列这么多条更新说明，多的折成「…等 N 项」。
export const NOTES_LIMIT = 6;

// ---------------------------------------------------------------------------
// 版本号
// ---------------------------------------------------------------------------

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /// 空数组 = 正式版。按 semver，带 `-` 后缀的预发布低于同号正式版。
  prerelease: string[];
}

const SEMVER_RE =
  /^[vV]?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/// 去掉前导 v、忽略 `+` 之后的构建信息。认不出就返回 null。
export const parseVersion = (raw: string): SemVer | null => {
  const match = SEMVER_RE.exec(raw.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : []
  };
};

const NUMERIC_ID = /^\d+$/;

/// semver 2.0.0 第 11 条：逐段比；纯数字段按数值比，且低于含字母的段；前面都相同时，段数多的更高。
const comparePrerelease = (a: string[], b: string[]): number => {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    const xNum = NUMERIC_ID.test(x);
    const yNum = NUMERIC_ID.test(y);
    if (xNum && yNum) return Number(x) < Number(y) ? -1 : 1;
    if (xNum) return -1;
    if (yNum) return 1;
    return x < y ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
};

/// 返回 -1 / 0 / 1。任何一边不是合法版本号就抛错，而不是悄悄当成「没有新版」——
/// 否则手动检查时，一个写错的 tag 会让用户看到「已是最新版本」。
export const compareVersions = (a: string, b: string): number => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left) throw new Error(`版本号「${a}」格式不对，没法比较`);
  if (!right) throw new Error(`版本号「${b}」格式不对，没法比较`);

  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;
  return comparePrerelease(left.prerelease, right.prerelease);
};

export const isNewerVersion = (candidate: string, current: string): boolean =>
  compareVersions(candidate, current) > 0;

/// 给界面显示用：统一成「v0.3.0」，不管 tag 本来带不带 v。
export const displayVersion = (raw: string): string => `v${raw.trim().replace(/^[vV]/, "")}`;

// ---------------------------------------------------------------------------
// 更新说明
// ---------------------------------------------------------------------------

export interface NoteGroup {
  title: string;
  items: string[];
}

export interface NotesSummary {
  groups: NoteGroup[];
  /// 因为超过条数上限没列出来的条数。
  hidden: number;
}

/// 旧格式（Keep a Changelog 的英文标题）和新格式（中文标题）映射到同一组显示名。
/// 其他标题（Deprecated / Removed / Security 之类）不在表里，原样显示。
const GROUP_TITLE_ALIASES: Record<string, string> = {
  added: "新功能",
  新功能: "新功能",
  changed: "改动",
  改动: "改动",
  fixed: "修复",
  修复: "修复"
};

/// 显示顺序：新功能在前、修复在后；没见过的标题排在它们后面，保持原来的先后。
const GROUP_ORDER = ["新功能", "改动", "修复"];

/// 正文里没有任何 `###` 小标题时，条目归到这一组。
const FALLBACK_GROUP_TITLE = "更新内容";

const IMAGE_ONLY_LINE = /^(?:!\[[^\]]*\]\([^)]*\)\s*)+$/;
const HEADING_LINE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_ITEM_LINE = /^(?:[-*+]|\d+\.)\s+(.*\S)\s*$/;

/// 去掉常见的行内 Markdown 记号，界面上是纯文本，留着 `**` 和 `[](...)` 很难看。
const stripInlineMarkdown = (text: string): string =>
  text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();

/// 把 Release 正文（来自 CHANGELOG 的某个版本节）拆成分组条目。
///
/// 正文长这样：第一行是图标图片，接着 `## [0.2.0] - 2026-10-06`，再是 `### Added` / `### 新功能`
/// 之类的小标题和 `- ` 列表。图片行和一、二级标题（版本标题行）都不要；缩进的行是上一条的续行或
/// 子项，也不算一条。
export const parseReleaseNotes = (body: string): NoteGroup[] => {
  const groups = new Map<string, string[]>();
  const plainLines: string[] = [];
  let section: string | null = null;

  const push = (title: string, item: string) => {
    const items = groups.get(title);
    if (items) items.push(item);
    else groups.set(title, [item]);
  };

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || IMAGE_ONLY_LINE.test(trimmed)) continue;

    const heading = HEADING_LINE.exec(line);
    if (heading) {
      if (heading[1].length <= 2) {
        // 版本标题行。它之后、下一个小标题之前的条目不属于任何分组。
        section = null;
      } else {
        const title = stripInlineMarkdown(heading[2]);
        section = title ? (GROUP_TITLE_ALIASES[title.toLowerCase()] ?? title) : null;
      }
      continue;
    }

    const item = LIST_ITEM_LINE.exec(line);
    if (item) {
      const text = stripInlineMarkdown(item[1]);
      if (text) push(section ?? FALLBACK_GROUP_TITLE, text);
    } else if (!/^\s/.test(line)) {
      plainLines.push(stripInlineMarkdown(trimmed));
    }
  }

  // 手写的 Release 正文可能一条列表都没有，全是整段文字；有总比一片空白强。
  if (groups.size === 0) {
    for (const text of plainLines) {
      if (text) push(FALLBACK_GROUP_TITLE, text);
    }
  }

  const orderOf = (title: string) => {
    const index = GROUP_ORDER.indexOf(title);
    return index === -1 ? GROUP_ORDER.length : index;
  };

  // Array.prototype.sort 是稳定的，所以没见过的标题之间保持原来的先后。
  return [...groups.entries()]
    .map(([title, items]) => ({ title, items }))
    .sort((a, b) => orderOf(a.title) - orderOf(b.title));
};

/// 总共最多留 `limit` 条。多个分组轮流各取一条，免得「新功能」条数一多，「修复」一条也看不到。
export const summarizeNotes = (groups: NoteGroup[], limit: number = NOTES_LIMIT): NotesSummary => {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const kept = groups.map(() => 0);

  let budget = Math.min(limit, total);
  for (let round = 0; budget > 0; round++) {
    for (let i = 0; i < groups.length && budget > 0; i++) {
      if (round < groups[i].items.length) {
        kept[i]++;
        budget--;
      }
    }
  }

  const shown = groups
    .map((group, i) => ({ title: group.title, items: group.items.slice(0, kept[i]) }))
    .filter((group) => group.items.length > 0);

  return { groups: shown, hidden: total - kept.reduce((sum, n) => sum + n, 0) };
};

export const summarizeReleaseBody = (body: string, limit: number = NOTES_LIMIT): NotesSummary =>
  summarizeNotes(parseReleaseNotes(body), limit);

// ---------------------------------------------------------------------------
// 取 Release
// ---------------------------------------------------------------------------

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface ReleaseInfo {
  tag: string;
  body: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
}

const GITHUB_URL_PREFIX = "https://github.com/";

/// 只信 github.com 的链接。能打开哪些网址在 capabilities 里也限定过一遍，这里先挡一道，
/// 好让「接口回了个怪链接」变成回退到 Release 页，而不是用户点了没反应。
const isGithubUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(GITHUB_URL_PREFIX);

/// 把 GitHub 返回的 JSON 收成我们用的形状。缺 tag_name 说明返回的不是 Release，直接报错。
export const parseRelease = (raw: unknown): ReleaseInfo => {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tag = data.tag_name;
  if (typeof tag !== "string" || !tag.trim()) {
    throw new Error("GitHub 返回的内容里没有版本号，不像是一个 Release");
  }

  const assets: ReleaseAsset[] = [];
  if (Array.isArray(data.assets)) {
    for (const asset of data.assets) {
      const entry = (asset && typeof asset === "object" ? asset : {}) as Record<string, unknown>;
      if (typeof entry.name === "string" && isGithubUrl(entry.browser_download_url)) {
        assets.push({ name: entry.name, url: entry.browser_download_url });
      }
    }
  }

  return {
    tag: tag.trim(),
    body: typeof data.body === "string" ? data.body : "",
    htmlUrl: isGithubUrl(data.html_url)
      ? data.html_url
      : `${GITHUB_URL_PREFIX}${UPDATE_REPO}/releases/latest`,
    assets
  };
};

export interface FetchReleaseOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/// 取最新的正式 Release（接口本身不含 draft 和 prerelease）。
///
/// 用 WebView 自带的 fetch 而不是 tauri-plugin-http：GitHub API 回了 CORS 头，不需要绕同源策略，
/// 也就不用把 api.github.com 加进 http 插件的白名单。
/// 失败时抛的 Error 的 message 已经是能直接给用户看的中文。
export const fetchLatestRelease = async (options: FetchReleaseOptions = {}): Promise<ReleaseInfo> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 计时器要一直盖到读完正文：连上了但正文迟迟不来，一样算超时。
  try {
    let response: Response;
    try {
      response = await fetchImpl(LATEST_RELEASE_API, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal
      });
    } catch (e) {
      throw new Error(connectionFailureMessage(e, timeoutMs));
    }

    if (!response.ok) throw new Error(httpFailureMessage(response));

    let json: unknown;
    try {
      json = await response.json();
    } catch (e) {
      throw new Error(
        isAbortError(e) ? timeoutMessage(timeoutMs) : `GitHub 返回的内容读不懂：${describeError(e)}`
      );
    }
    return parseRelease(json);
  } finally {
    clearTimeout(timer);
  }
};

const isAbortError = (e: unknown): boolean =>
  !!e && typeof e === "object" && (e as { name?: unknown }).name === "AbortError";

const timeoutMessage = (timeoutMs: number): string =>
  `连接 GitHub 超过 ${Math.round(timeoutMs / 1000)} 秒没有响应`;

const connectionFailureMessage = (e: unknown, timeoutMs: number): string =>
  isAbortError(e) ? timeoutMessage(timeoutMs) : `无法连接到 GitHub：${describeError(e)}`;

const httpFailureMessage = (response: Response): string => {
  if (response.status === 404) return "GitHub 上还没有发布过正式版本";
  // 没登录的请求每小时有次数上限，超了会回 403 或 429。
  if (response.status === 403 || response.status === 429) {
    return "GitHub 暂时限制了请求次数，请过一会儿再试";
  }
  return `GitHub 返回了错误（HTTP ${response.status}）`;
};

// ---------------------------------------------------------------------------
// 点「立即更新」后打开哪里
// ---------------------------------------------------------------------------

/// 只用来决定给用户哪个下载链接，不做任何别的平台分支。
export const isAndroidUserAgent = (userAgent: string): boolean => /android/i.test(userAgent);

/// release-android.yml 只打 arm64 的 APK，但还是优先挑名字带 arm64 / aarch64 的，
/// 以后要是多发了别的架构，不会装错。
const pickApk = (assets: ReleaseAsset[]): ReleaseAsset | undefined => {
  const apks = assets.filter((asset) => /\.apk$/i.test(asset.name));
  return apks.find((asset) => /arm64|aarch64/i.test(asset.name)) ?? apks[0];
};

/// Android 且 Release 里有 .apk：直接下载链接。其余情况（iOS、桌面，或 Release 里没传 APK）：Release 页面。
export const pickInstallUrl = (release: ReleaseInfo, android: boolean): string => {
  if (android) {
    const apk = pickApk(release.assets);
    if (apk) return apk.url;
  }
  return release.htmlUrl;
};
