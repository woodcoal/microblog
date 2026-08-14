/**
 * 网络地址边界工具。
 *
 * 仅处理已由运行时适配器提供的可信客户端地址；调用方不得把可伪造的转发请求头直接传入。
 */

/**
 * 判断客户端 IP 是否属于本机、私有网络或链路本地网络。
 *
 * @param address - 由运行时适配器提供的客户端 IP 地址。
 * @returns 地址属于允许访问内部资源的网络范围时返回 true。
 */
export function isInternalIpAddress(address: string): boolean {
	const normalized = address.trim().toLowerCase();
	const mappedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
	if (mappedIpv4) return isInternalIpv4Address(mappedIpv4);
	if (normalized === '::1') return true;
	if (/^(?:fc|fd)[0-9a-f]{2}:/i.test(normalized)) return true;
	if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true;
	return isInternalIpv4Address(normalized);
}

/**
 * 判断客户端能否访问 API 文档。
 *
 * @param address - 由运行时适配器提供的客户端 IP 地址。
 * @param publiclyAvailable - 是否明确向公网公开文档。
 * @returns 文档公开或客户端处于内网时返回 true。
 */
export function mayAccessApiDocs(address: string, publiclyAvailable: boolean): boolean {
	return publiclyAvailable || isInternalIpAddress(address);
}

/**
 * 判断 IPv4 地址是否属于本机、RFC 1918 私有网段或链路本地网段。
 *
 * @param address - 已去除空白的 IPv4 地址。
 * @returns 地址位于内部 IPv4 范围时返回 true。
 */
function isInternalIpv4Address(address: string): boolean {
	const octets = address.split('.').map(Number);
	if (
		octets.length !== 4 ||
		octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
	) {
		return false;
	}

	const [first, second] = octets;
	return (
		first === 127 ||
		first === 10 ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168) ||
		(first === 169 && second === 254)
	);
}
