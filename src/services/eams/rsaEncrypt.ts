// 用学校的公钥把密码加密成 CAS 要求的 `__RSA__<base64>` 形式。
//
// 为什么需要第三方库：学校用的是 **RSA PKCS#1 v1.5**，而浏览器原生的 WebCrypto **只支持 OAEP** ——
// 两者互不兼容，WebCrypto 做不了这件事。所以只能引库（jsencrypt）。
//
// 而"引了库、看起来能跑"和"产出的密文学校真的能解开"是两回事。后者错了，表现是登录失败，
// 而且会被误报成"密码不对" —— 今天已经这样被带偏过一次。所以 scripts/test-rsa-encrypt.mjs
// 会本地生成一对密钥，用它解密 jsencrypt 的输出，证明格式确实是 PKCS#1 v1.5。
import JSEncrypt from "jsencrypt";

/// CAS 要求在密文前加这个前缀，服务端据此知道要走 RSA 解密。
export const RSA_PREFIX = "__RSA__";

/// 加密失败时返回 null，由调用方决定怎么报错 —— 这里不抛，因为"公钥不合法"和"网络错误"
/// 需要给出完全不同的提示。
export const encryptPasswordWithKey = (password: string, publicKeyPem: string): string | null => {
  const encryptor = new JSEncrypt();
  encryptor.setPublicKey(publicKeyPem);
  const encrypted = encryptor.encrypt(password);
  if (typeof encrypted !== "string" || !encrypted) return null;
  return `${RSA_PREFIX}${encrypted}`;
};
