// 引入统一错误类，认证流程失败时会用它抛出明确错误。
import { WalletKitError } from '../types';
// 引入认证流程需要用到的类型，type import 不会进入最终运行时代码。
import type { AuthSession, WalletAccount, WalletAuthConfig, WalletId } from '../types';

// createNonceMessage 用来把 nonce、地址、钱包等信息拼成用户要签名的文本。
export function createNonceMessage(input: {
  // nonce 是后端生成的一次性随机字符串。
  nonce: string;
  // address 是当前连接的钱包地址。
  address: string;
  // wallet 是当前使用的钱包类型。
  wallet: WalletId;
  // chainType 是当前链生态。
  chainType: string;
  // audience 是可选业务名称，例如你的 DApp 名称。
  audience?: string;
}): string {
  // 返回数组再 join，是为了让签名文本结构清晰、每行含义明确。
  return [
    // 第一行显示业务名称，如果没有传 audience 就用默认的 Wallet Login。
    input.audience ?? 'Wallet Login',
    // 插入空行，让钱包签名弹窗里显示更易读。
    '',
    // 写入钱包类型，例如 metamask。
    `Wallet: ${input.wallet}`,
    // 写入钱包地址，后端验签时会用到。
    `Address: ${input.address}`,
    // 写入链类型，例如 evm。
    `Chain: ${input.chainType}`,
    // 写入一次性 nonce，防止旧签名被重复使用。
    `Nonce: ${input.nonce}`,
    // 写入签发时间，方便后端或用户审计。
    `Issued At: ${new Date().toISOString()}`,
    // 用换行符把上面的数组拼成一整段签名文本。
  ].join('\n');
}

// authenticateWallet 负责完整的钱包签名登录流程。
export async function authenticateWallet(input: {
  // auth 是业务方传入的认证配置。
  auth?: WalletAuthConfig;
  // wallet 是当前连接的钱包 id。
  wallet: WalletId;
  // account 是当前连接成功的钱包账户。
  account: WalletAccount;
  // signMessage 是适配器提供的签名函数。
  signMessage: (message: string) => Promise<string>;
}): Promise<AuthSession | undefined> {
  // 如果没有启用认证，直接返回 undefined，表示只连接钱包不登录。
  if (!input.auth?.enabled) return undefined;
  // 启用认证时，必须同时提供 getNonce 和 verifySignature。
  if (!input.auth.getNonce || !input.auth.verifySignature) {
    // 配置不完整时抛出统一的认证失败错误。
    throw new WalletKitError('AUTH_FAILED', 'Wallet auth requires getNonce and verifySignature callbacks.');
  }

  // 先调用业务后端拿 nonce。
  const nonce = await input.auth.getNonce({
    // 告诉后端当前使用的钱包类型。
    wallet: input.wallet,
    // 告诉后端当前钱包地址。
    address: input.account.address,
    // 告诉后端当前链生态。
    chainType: input.account.chainType,
    // 透传业务名称。
    audience: input.auth.audience,
  });
  // 根据后端返回的 nonce 拼出要让钱包签名的文本。
  const message = createNonceMessage({
    // 放入一次性 nonce。
    nonce,
    // 放入钱包地址。
    address: input.account.address,
    // 放入钱包类型。
    wallet: input.wallet,
    // 放入链生态。
    chainType: input.account.chainType,
    // 放入业务名称。
    audience: input.auth.audience,
  });
  // 调用钱包签名，如果用户拒绝或钱包失败，就转换成统一错误。
  const signature = await input.signMessage(message).catch((error) => {
    // 把底层错误包装成 SIGNATURE_REJECTED，方便业务层统一处理。
    throw new WalletKitError('SIGNATURE_REJECTED', 'Wallet signature was rejected or failed.', error);
  });

  // 把签名结果发给业务后端验证，验证成功后应该返回 AuthSession。
  return input.auth.verifySignature({
    // 传回钱包类型。
    wallet: input.wallet,
    // 传回钱包地址。
    address: input.account.address,
    // 传回链生态。
    chainType: input.account.chainType,
    // 传回业务名称。
    audience: input.auth.audience,
    // 传回 nonce，后端要检查它是否有效且未使用。
    nonce,
    // 传回签名原文，后端要验证签名对应的就是这段文本。
    message,
    // 传回钱包签名结果。
    signature,
  });
}

// refreshJwtSession 负责 JWT 快过期时调用业务方接口续期。
export async function refreshJwtSession(input: {
  // auth 是认证配置。
  auth?: WalletAuthConfig;
  // session 是当前已有登录态。
  session?: AuthSession;
  // wallet 是当前钱包类型。
  wallet?: WalletId;
  // account 是当前钱包账户。
  account?: WalletAccount;
}): Promise<AuthSession | undefined> {
  // 如果没有启用认证、没有刷新函数、没有 session、没有钱包或账户，就保持原 session。
  if (!input.auth?.enabled || !input.auth.refreshJwt || !input.session || !input.wallet || !input.account) {
    // 返回原 session，表示不用刷新。
    return input.session;
  }

  // try/catch 用来把业务后端刷新失败统一包装成钱包组件错误。
  try {
    // 调用业务方提供的 refreshJwt 函数刷新登录态。
    return await input.auth.refreshJwt({
      // 传入当前 JWT。
      token: input.session.token,
      // 传入可选 refreshToken。
      refreshToken: input.session.refreshToken,
      // 传入钱包类型。
      wallet: input.wallet,
      // 传入钱包地址。
      address: input.account.address,
    });
  } catch (error) {
    // 刷新失败时抛出统一的 JWT_REFRESH_FAILED 错误。
    throw new WalletKitError('JWT_REFRESH_FAILED', 'JWT refresh failed.', error);
  }
}

// getRenewalDelay 计算距离下一次自动续期还要等多久。
export function getRenewalDelay(session: AuthSession, windowMs = 60_000): number {
  // 用过期时间减去当前时间，再减去提前续期窗口，最小值不能小于 0。
  return Math.max(0, session.expiresAt - Date.now() - windowMs);
}
