// 「网络诊断矩阵」：把同一个请求用几种不同的发法各跑一遍，**逐跳**记录结果。
//
// 为什么需要它：上一版的探测里我传了 `redirect: "manual"` —— 而插件根本没有这个参数
// （它只认 `maxRedirections`），所以那一次请求其实**由插件自己跟完了跳转**，我看到的 403 是
// **最后一跳**的结果，却被我标成了"第 1 跳"，还据此下了结论。标签错了，结论就跟着错。
//
// 所以这里做两件事：
//   1. 用 `maxRedirections: 0` **真正**关掉自动跳转，由我们自己一跳一跳走，每跳都留痕；
//   2. 同样的请求用几个变体各跑一遍（Origin 的有无、浏览器头的完整程度），看差异出在哪。
//
// 单独成文件而不是塞进客户端：**逐跳跟随的逻辑必须能被回放测试覆盖** —— 这是这一块里唯一
// 我能在本地验证的部分，而它恰恰是上一轮出错的地方。
import { pageTitle, type EamsHttp, type TraceEntry } from "./casLogin";

/// 一跳的记录。刻意把"请求地址"和"最终地址"分开 —— 混淆这两个是上一轮出错的根源。
export interface Hop {
  index: number;
  /// 这一跳请求的地址
  url: string;
  status: number;
  /// 响应的 Location（相对地址已解析成绝对地址）
  location?: string;
  /// 这一跳有没有 Set-Cookie
  setCookie: boolean;
  title: string;
  /// 非 2xx / 3xx 时附上正文开头，用来判断"是谁拒的"
  bodyStart?: string;
}

export interface VariantResult {
  name: string;
  /// 这个变体改了什么（给用户看的）
  note: string;
  hops: Hop[];
  /// 一句话结论
  verdict: string;
}

/// 逐跳跟随。
///
/// `maxRedirections: 0` 是这里的关键 —— 没有它，插件会自己跟完跳转，我们只能看到最后一跳，
/// 而"哪一跳出的问题"恰恰是唯一需要知道的事。
export const walkHopChain = async (
  http: EamsHttp,
  startUrl: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
  maxHops = 6
): Promise<Hop[]> => {
  const hops: Hop[] = [];
  let url = startUrl;

  for (let i = 0; i < maxHops; i++) {
    const response = await http.request(url, { ...init, maxRedirections: 0 });
    const rawLocation = response.headers.location;
    // Location 可能是相对地址（例如只写 /eams/loginExt.action;jsessionid=…），必须按当前地址解析，
    // 否则下一跳会请求到一个拼错的地址上，而那种错误看起来像"服务器拒绝"。
    let location: string | undefined;
    if (rawLocation) {
      try {
        location = new URL(rawLocation, url).toString();
      } catch {
        location = rawLocation;
      }
    }

    const isRedirect = response.status >= 300 && response.status < 400;

    hops.push({
      index: i + 1,
      url,
      status: response.status,
      location,
      setCookie: !!response.headers["set-cookie"],
      title: pageTitle(response.body),
      bodyStart: isRedirect ? undefined : response.body.replace(/\s+/g, " ").trim().slice(0, 200)
    });

    if (!isRedirect || !location) break;
    url = location;
  }

  return hops;
};

/// 一个变体跑完之后，给一句人话。
const verdictOf = (hops: Hop[], variantName: string, baseline: Hop[] | null): string => {
  const last = hops[hops.length - 1];
  if (!last) return "没有拿到任何响应。";

  const chain = hops.map((h) => `${h.status}${h.location ? "→" : ""}`).join(" ");
  const first = hops[0];

  if (first.status < 300) {
    return `第一跳就成功（HTTP ${first.status}），这个变体是通的。链路：${chain}`;
  }
  if (first.status >= 300 && first.status < 400) {
    return `第一跳是跳转（HTTP ${first.status}），跟着走到了 HTTP ${last.status}。链路：${chain}`;
  }

  // 第一跳就是 4xx/5xx —— 这才是"第一跳被拒"，和上一轮那个被误标的结论不是一回事。
  if (baseline && baseline[0] && baseline[0].status === first.status) {
    return `第一跳被拒：HTTP ${first.status}（与「A · 现状」相同，说明这个变体没改变结果）。`;
  }
  if (baseline && baseline[0]) {
    return `第一跳被拒：HTTP ${first.status}，而「A · 现状」是 HTTP ${baseline[0].status} —— **这个变体改变了结果**。`;
  }
  return `第一跳被拒：HTTP ${first.status}（${variantName}）。`;
};

/// 要试的变体。
///
/// 顺序有讲究：**A 是现状**，作为对照；B 只动一个变量（Origin），这样 B 与 A 的差别才有意义；
/// C 在 B 之上补齐浏览器头。一次改多个变量的话，即使 C 通了也不知道是哪一个起了作用。
export const VARIANTS: Array<{ name: string; note: string; headers: Record<string, string> }> = [
  {
    name: "A · 现状",
    note: "和自动同步完全一样的发法",
    headers: {}
  },
  {
    name: "B · 移除 Origin",
    note: "只改一处：不发 Origin 头（浏览器直接打开页面时也不发）",
    headers: { Origin: "" }
  },
  {
    name: "C · B + 完整浏览器头",
    note: "在 B 之上补齐 Sec-Fetch-* / Upgrade-Insecure-Requests（**不含 Accept-Encoding**：实测加了它之后正文是压缩后的乱码，因为没人解压）",
    headers: {
      Origin: "",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-User": "?1",
      "Sec-Fetch-Dest": "document",
      Connection: "keep-alive"
    }
  }
];

/// 跑完整个矩阵。
export const runDiagnosticMatrix = async (
  http: EamsHttp,
  url: string,
  onProgress?: (text: string) => void
): Promise<VariantResult[]> => {
  const results: VariantResult[] = [];
  let baseline: Hop[] | null = null;

  for (const variant of VARIANTS) {
    onProgress?.(`正在试「${variant.name}」…`);
    try {
      const hops = await walkHopChain(http, url, { headers: variant.headers });
      if (variant.name.startsWith("A")) baseline = hops;
      results.push({ name: variant.name, note: variant.note, hops, verdict: verdictOf(hops, variant.name, baseline) });
    } catch (error) {
      // 连不上和"被拒绝"是两回事，必须分开说 —— 否则又会出现"一律说成某某原因"的老毛病。
      results.push({
        name: variant.name,
        note: variant.note,
        hops: [],
        verdict: `请求发不出去（不是被拒绝）：${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  return results;
};

/// 把结果排成可以直接贴给人看的文本。
export const formatMatrix = (results: VariantResult[]): string =>
  results
    .map((r) => {
      const head = `【${r.name}】${r.note}\n结论：${r.verdict}`;
      const hops = r.hops
        .map((h) => {
          const parts = [`  第 ${h.index} 跳  HTTP ${h.status}`];
          parts.push(`    请求 → ${h.url}`);
          if (h.location) parts.push(`    Location → ${h.location}`);
          parts.push(`    标题「${h.title || "(无)"}」  Set-Cookie: ${h.setCookie ? "有" : "没有"}`);
          if (h.bodyStart) parts.push(`    正文开头 → ${h.bodyStart || "(空)"}`);
          return parts.join("\n");
        })
        .join("\n");
      return `${head}\n${hops}`;
    })
    .join("\n\n");

/// 复用已有的 TraceEntry 形状，方便和主流程的诊断混在一起展示。
export const hopsToTrace = (results: VariantResult[]): TraceEntry[] =>
  results.flatMap((r) =>
    r.hops.map((h) => ({
      step: `${r.name} 第 ${h.index} 跳`,
      url: h.url,
      status: h.status,
      finalUrl: h.location ?? h.url,
      title: h.title,
      snippet: h.bodyStart
    }))
  );
