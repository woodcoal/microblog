/**
 * 短链 ID 生成器
 *
 * 生成 8 位无规律字母数字混合 ID，排除易混淆字符：
 * - 0 / O（零与大写 O）
 * - 1 / l / I（一与小写 L 与大写 I）
 *
 * 字符池：2-9, a-k, m-n, p-z, A-H, J-N, P-Z（共 54 个字符）
 */

/** 安全字符池，已排除 0/O/1/l/I */
const SAFE_CHARS = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

/** 字符池长度 */
const CHARSET_LEN = SAFE_CHARS.length;

/**
 * 拒绝采样上界：大于等于此值的字节会被丢弃，避免模运算导致微小概率偏差。
 * 216 = 54 * 4，即 256 / CHARSET_LEN 向下取整 * CHARSET_LEN，
 * 确保每个字符被选中的概率完全均等。
 */
const REJECT_THRESHOLD = Math.floor(256 / CHARSET_LEN) * CHARSET_LEN;

/**
 * 生成一个 8 位无规律短链 ID
 *
 * 使用拒绝采样（rejection sampling）避免模运算偏差：
 * 当随机字节值 >= REJECT_THRESHOLD 时丢弃并重新获取，
 * 确保每个字符被选中的概率完全均等。
 *
 * @param length - ID 长度，默认 8
 * @returns 随机字符串，如 "a3Kx9mP2"
 */
export function generateShortId(length: number = 8): string {
	let id = '';
	// 预分配较多字节以应对拒绝采样的丢弃
	const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
	let byteIndex = 0;

	for (let i = 0; i < length; i++) {
		// 拒绝采样：丢弃 >= REJECT_THRESHOLD 的字节值，重新获取
		while (byteIndex < bytes.length && bytes[byteIndex] >= REJECT_THRESHOLD) {
			byteIndex++;
		}
		// 如果预分配字节用完（极低概率），补充随机字节
		if (byteIndex >= bytes.length) {
			const extra = crypto.getRandomValues(new Uint8Array(1));
			if (extra[0] < REJECT_THRESHOLD) {
				id += SAFE_CHARS[extra[0] % CHARSET_LEN];
			} else {
				// 仍然被拒绝，递归重试该位置
				i--;
				continue;
			}
		} else {
			id += SAFE_CHARS[bytes[byteIndex] % CHARSET_LEN];
		}
		byteIndex++;
	}
	return id;
}
